// Runs: every press of Process becomes a persisted Run (one item for "merge", one per file for
// "separate"). Items are worked one at a time. A run can be paused, resumed, stopped, restarted;
// single items can be retried or skipped. Pause/stop keep the item's working folder and Claude
// session id, so "continue" resumes the same session (claude --resume) instead of starting over —
// also after the app was quit.
use crate::engine::Engine;
use crate::i18n::t;
use crate::job::{Job, JobCtl, JobEvent, JobOpts};
use crate::paths::{basename, extname};
use crate::util::{iso, now_ms, rand_hex, read_json, write_json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

const FINAL: [&str; 3] = ["done", "failed", "skipped"];
fn is_final(status: &str) -> bool {
    FINAL.contains(&status)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunItem {
    pub id: String,
    pub files: Vec<String>,
    pub title: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>, // Claude session to --resume after a pause/stop
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slides: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub articles: Option<i64>,
    #[serde(default)]
    pub cost_usd: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<i64>,
    #[serde(default)]
    pub elapsed_ms: i64, // working time, pauses excluded
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_since: Option<i64>, // set while running
    #[serde(default)]
    pub attempts: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunOptions {
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub research: bool,
    #[serde(default)]
    pub lang: String,
    #[serde(default)]
    pub output_dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>, // missing = "tap" (runs made before formats existed)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub state: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub options: RunOptions,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub items: Vec<RunItem>,
}

/// What the window asks for when the user presses Process.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub files: Vec<String>,
    #[serde(default)]
    pub title: String, // merge: the notebook name; separate: the run's label
    #[serde(default)]
    pub titles: Option<Vec<String>>, // separate: one name per file
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub research: bool,
    #[serde(default)]
    pub lang: String,
    #[serde(default)]
    pub output_dir: String,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub project_id: Option<String>,
}

pub type BoxFut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// What the run manager needs from the app (or from a test).
pub trait RunHost: Send + Sync {
    fn data_file(&self, name: &str) -> PathBuf; // path inside the data folder
    fn jobs_dir(&self) -> PathBuf;
    fn assets_dir(&self) -> PathBuf;
    fn claude(&self) -> BoxFut<'_, Result<(String, String), String>>; // (path, version)
    fn publish(&self, run: &Run); // full snapshot → window
    fn removed(&self, id: &str);
    fn tick(&self, tick: Value); // live activity/log → window
    fn notebook_done(&self, run: &Run, item: &RunItem);
    /// Where a finished notebook goes (the project folder, if any).
    fn output_dir(&self, run: &Run) -> String {
        run.options.output_dir.clone()
    }
    fn engine(&self) -> Arc<Engine>;
}

struct Active {
    run_id: String,
    item_id: String,
    ctl: Arc<JobCtl>,
}

#[derive(Default)]
struct State {
    runs: Vec<Run>,
    active: Option<Active>,
    driving: HashSet<String>, // runs whose loop is running
}

pub struct RunManager {
    host: Arc<dyn RunHost>,
    state: Mutex<State>,
    me: Weak<RunManager>,
}

fn settle(it: &mut RunItem) {
    if let Some(since) = it.active_since.take() {
        it.elapsed_ms += now_ms() - since;
    }
}

fn finish_if_done(run: &mut Run) {
    if !run.items.iter().all(|it| is_final(&it.status)) {
        return;
    }
    run.state = if run.items.iter().any(|it| it.status == "failed") { "failed" } else { "done" }.into();
}

/// Back to "waiting". Retry keeps the attempt count (shown as "attempt n"); start over is a clean slate.
fn reset(it: &mut RunItem, fresh: bool) {
    if fresh {
        it.attempts = 0;
    }
    if let Some(dir) = &it.work_dir {
        let _ = std::fs::remove_dir_all(dir);
    }
    *it = RunItem { id: it.id.clone(), files: it.files.clone(), title: it.title.clone(), status: "waiting".into(), attempts: it.attempts, ..Default::default() };
}

impl RunManager {
    pub fn new(host: Arc<dyn RunHost>) -> Arc<Self> {
        let mut runs: Vec<Run> = read_json(&host.data_file("runs.json")).unwrap_or_default();
        // The app quit (or crashed) mid-run: those runs/items are now stopped, ready to resume.
        let mut dirty = false;
        for r in runs.iter_mut() {
            if r.state == "running" {
                r.state = "stopped".into();
                dirty = true;
            }
            for it in r.items.iter_mut().filter(|it| it.status == "running") {
                it.status = "stopped".into();
                settle(it);
                dirty = true;
            }
        }
        let m = Arc::new_cyclic(|me| RunManager { host, state: Mutex::new(State { runs, ..Default::default() }), me: me.clone() });
        if dirty {
            m.save(&m.lock());
        }
        m
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ---------- persistence ----------
    fn save(&self, st: &State) {
        let keep = &st.runs[..st.runs.len().min(300)];
        let _ = write_json(&self.host.data_file("runs.json"), &keep, false);
    }
    fn touch(&self, st: &mut State, run_id: &str) {
        if let Some(r) = st.runs.iter_mut().find(|r| r.id == run_id) {
            r.updated_at = now_ms();
        }
        self.save(st);
        if let Some(r) = st.runs.iter().find(|r| r.id == run_id) {
            self.host.publish(r);
        }
    }

    pub fn list(&self) -> Vec<Run> {
        self.lock().runs.clone()
    }

    /// App is quitting/relaunching: halt the active job; its run is marked stopped (resumable) on next start.
    pub fn shutdown(&self) {
        let mut st = self.lock();
        let Some(a) = st.active.as_ref().map(|a| (a.run_id.clone(), a.item_id.clone(), a.ctl.clone())) else { return };
        a.2.stop("stop");
        if let Some(r) = st.runs.iter_mut().find(|r| r.id == a.0) {
            r.state = "stopped".into();
            if let Some(it) = r.items.iter_mut().find(|i| i.id == a.1) {
                settle(it);
                it.status = "stopped".into();
            }
        }
        self.save(&st);
    }

    /// A notebook file moved (renamed, or moved into a project): runs that made it point to the new place.
    pub fn relocate(&self, from: &str, to: &str) {
        let mut st = self.lock();
        let mut hits = vec![];
        for r in st.runs.iter_mut() {
            let mut hit = false;
            for it in r.items.iter_mut().filter(|it| it.output.as_deref() == Some(from)) {
                it.output = Some(to.into());
                hit = true;
            }
            if hit {
                hits.push(r.id.clone());
            }
        }
        if !hits.is_empty() {
            self.save(&st);
            for id in hits {
                if let Some(r) = st.runs.iter().find(|r| r.id == id) {
                    self.host.publish(r);
                }
            }
        }
    }

    /// Outputs that are no longer on disk: take the library's current path for the same notebook, if it has one.
    pub fn repair_outputs(&self, find: impl Fn(&Run, &RunItem) -> Option<String>) {
        let mut st = self.lock();
        let mut dirty = false;
        let runs = st.runs.clone();
        for (ri, r) in runs.iter().enumerate() {
            for (ii, it) in r.items.iter().enumerate() {
                let Some(out) = &it.output else { continue };
                if Path::new(out).exists() {
                    continue;
                }
                if let Some(now) = find(r, it).filter(|n| n != out && Path::new(n).exists()) {
                    st.runs[ri].items[ii].output = Some(now);
                    dirty = true;
                }
            }
        }
        if dirty {
            self.save(&st);
        }
    }

    pub fn is_busy(&self) -> bool {
        let st = self.lock();
        st.active.is_some() || !st.driving.is_empty()
    }
    pub fn active_project(&self) -> Option<String> {
        let st = self.lock();
        let a = st.active.as_ref()?;
        st.runs.iter().find(|r| r.id == a.run_id)?.project_id.clone()
    }

    // ---------- create ----------
    pub fn create(&self, req: RunRequest) -> String {
        let now = now_ms();
        let id = format!("{}-{}", iso(now).replace([':', '.'], "-"), rand_hex(2));
        let item = |files: Vec<String>, title: String| RunItem { id: rand_hex(4), files, title, status: "waiting".into(), ..Default::default() };
        let items: Vec<RunItem> = if req.mode == "separate" && req.files.len() > 1 {
            req.files
                .iter()
                .enumerate()
                .map(|(i, f)| {
                    let given = req.titles.as_ref().and_then(|t| t.get(i)).filter(|t| !t.is_empty()).cloned();
                    item(vec![f.clone()], given.unwrap_or_else(|| basename(Path::new(f), &extname(Path::new(f)))))
                })
                .collect()
        } else {
            vec![item(req.files.clone(), req.title.clone())]
        };
        let title = [req.title.clone(), items[0].title.clone(), basename(Path::new(req.files.first().map(String::as_str).unwrap_or("")), "")]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
        let format = match req.format.as_deref() {
            Some(f @ ("brief" | "wbs")) => f.to_string(),
            _ => "tap".into(),
        };
        let run = Run {
            id: id.clone(),
            title,
            mode: if items.len() > 1 { "separate" } else { "merge" }.into(),
            state: "running".into(),
            created_at: now,
            updated_at: now,
            options: RunOptions { model: req.model, research: req.research, lang: req.lang, output_dir: req.output_dir, format: Some(format) },
            project_id: req.project_id.filter(|p| !p.is_empty()),
            items,
        };
        {
            let mut st = self.lock();
            st.runs.insert(0, run);
            self.touch(&mut st, &id);
        }
        self.drive(id.clone());
        id
    }

    // ---------- run controls ----------
    pub async fn action(&self, run_id: &str, action: &str) -> Result<(), String> {
        let is_active = { self.lock().active.as_ref().is_some_and(|a| a.run_id == run_id) };
        match action {
            "pause" | "stop" => {
                let mut st = self.lock();
                let Some(run) = st.runs.iter_mut().find(|r| r.id == run_id) else { return Ok(()) };
                if (action == "pause" && run.state != "running") || (action == "stop" && run.state == "done") {
                    return Ok(());
                }
                run.state = if action == "pause" { "paused" } else { "stopped" }.into();
                self.touch(&mut st, run_id);
                if is_active {
                    if let Some(a) = &st.active {
                        a.ctl.stop(if action == "pause" { "pause" } else { "stop" });
                    }
                }
            }
            "resume" => {
                {
                    let mut st = self.lock();
                    let Some(run) = st.runs.iter().find(|r| r.id == run_id) else { return Ok(()) };
                    if run.state == "running" || run.state == "done" {
                        return Ok(());
                    }
                    Self::assert_free(&st, run_id)?;
                    // failed items from a finished run stay failed; "retryFailed" re-queues those
                    st.runs.iter_mut().find(|r| r.id == run_id).unwrap().state = "running".into();
                    self.touch(&mut st, run_id);
                }
                self.drive(run_id.to_string());
            }
            "restart" | "retryFailed" => {
                if action == "restart" && is_active {
                    self.halt(run_id, "stop").await;
                }
                {
                    let mut st = self.lock();
                    if !st.runs.iter().any(|r| r.id == run_id) {
                        return Ok(());
                    }
                    Self::assert_free(&st, run_id)?;
                    let run = st.runs.iter_mut().find(|r| r.id == run_id).unwrap();
                    for it in run.items.iter_mut() {
                        if action == "restart" {
                            reset(it, true);
                        } else if ["failed", "stopped", "skipped"].contains(&it.status.as_str()) {
                            reset(it, false);
                        }
                    }
                    run.state = "running".into();
                    self.touch(&mut st, run_id);
                }
                self.drive(run_id.to_string());
            }
            "remove" => {
                if is_active {
                    self.halt(run_id, "stop").await;
                }
                let mut st = self.lock();
                let Some(i) = st.runs.iter().position(|r| r.id == run_id) else { return Ok(()) };
                let run = st.runs.remove(i);
                for it in &run.items {
                    if let Some(d) = &it.work_dir {
                        let _ = std::fs::remove_dir_all(d);
                    }
                }
                self.save(&st);
                self.host.removed(run_id);
            }
            _ => {}
        }
        Ok(())
    }

    pub async fn item_action(&self, run_id: &str, item_id: &str, action: &str) -> Result<(), String> {
        let mut st = self.lock();
        let active_item = st.active.as_ref().filter(|a| a.item_id == item_id).map(|a| a.ctl.clone());
        let Some(run) = st.runs.iter_mut().find(|r| r.id == run_id) else { return Ok(()) };
        let Some(it) = run.items.iter_mut().find(|x| x.id == item_id) else { return Ok(()) };
        if action == "skip" {
            if let Some(ctl) = active_item {
                ctl.stop("skip"); // the loop marks it skipped and moves on
                return Ok(());
            }
            if ["waiting", "paused", "stopped"].contains(&it.status.as_str()) {
                it.status = "skipped".into();
                settle(it);
                finish_if_done(run);
                self.touch(&mut st, run_id);
            }
            return Ok(());
        }
        if action == "retry" {
            if active_item.is_some() {
                return Ok(());
            }
            reset(it, false);
            if run.state != "running" {
                Self::assert_free(&st, run_id)?;
                st.runs.iter_mut().find(|r| r.id == run_id).unwrap().state = "running".into();
                self.touch(&mut st, run_id);
                drop(st);
                self.drive(run_id.to_string());
            } else {
                self.touch(&mut st, run_id);
            }
        }
        Ok(())
    }

    /// Stop the active job of a run and wait until its loop has let go.
    async fn halt(&self, run_id: &str, reason: &'static str) {
        {
            let mut g = self.lock();
            let st = &mut *g;
            if let Some(r) = st.runs.iter_mut().find(|r| r.id == run_id) {
                r.state = if reason == "pause" { "paused" } else { "stopped" }.into();
            }
            if let Some(a) = &st.active {
                a.ctl.stop(reason);
            }
        }
        while self.lock().driving.contains(run_id) {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }

    fn assert_free(st: &State, run_id: &str) -> Result<(), String> {
        if st.driving.iter().any(|id| id != run_id) { Err("busy".into()) } else { Ok(()) }
    }

    // ---------- the worker loop: one item at a time ----------
    fn drive(&self, run_id: String) {
        {
            let mut st = self.lock();
            if !st.driving.insert(run_id.clone()) {
                return;
            }
        }
        let Some(me) = self.me.upgrade() else { return };
        tauri::async_runtime::spawn(async move {
            loop {
                let next = {
                    let mut st = me.lock();
                    let Some(run) = st.runs.iter_mut().find(|r| r.id == run_id) else { break };
                    if run.state != "running" {
                        break;
                    }
                    match run.items.iter().find(|x| !is_final(&x.status)) {
                        Some(it) => it.id.clone(),
                        None => {
                            finish_if_done(run);
                            me.touch(&mut st, &run_id);
                            break;
                        }
                    }
                };
                me.work(&run_id, &next).await;
            }
            me.lock().driving.remove(&run_id);
        });
    }

    async fn work(&self, run_id: &str, item_id: &str) {
        let claude = self.host.claude().await;
        let snapshot = { self.lock().runs.iter().find(|r| r.id == run_id).cloned() };
        let Some(snapshot) = snapshot else { return };
        let output_dir = self.host.output_dir(&snapshot);
        let ctl = Arc::new(JobCtl::default());

        let (opts, work_dir, resume, cost_before, version, bin) = {
            let mut st = self.lock();
            let st = &mut *st;
            let Some(run) = st.runs.iter_mut().find(|r| r.id == run_id) else { return };
            let (bin, version) = match claude {
                Ok(c) => c,
                Err(e) => {
                    if let Some(it) = run.items.iter_mut().find(|x| x.id == item_id) {
                        it.status = "failed".into();
                        it.error = Some(e);
                    }
                    run.state = "failed".into();
                    self.touch(st, run_id);
                    return;
                }
            };
            let options = run.options.clone();
            let run_id_s = run.id.clone();
            let Some(idx) = run.items.iter().position(|x| x.id == item_id) else { return };
            let it = &run.items[idx];
            let resume = (it.status == "paused" || it.status == "stopped") && it.work_dir.as_ref().is_some_and(|d| Path::new(d).exists()) && it.session_id.is_some();
            let resume = if resume { it.session_id.clone() } else { None };
            if resume.is_none() {
                if let Some(d) = &it.work_dir {
                    let _ = std::fs::remove_dir_all(d);
                }
                let attempts = it.attempts;
                self.prune(st, run_id);
                let dir = self.host.jobs_dir().join(format!("{run_id_s}-{item_id}-{}", attempts + 1));
                let _ = std::fs::create_dir_all(&dir);
                let run = st.runs.iter_mut().find(|r| r.id == run_id).unwrap();
                let it = &mut run.items[idx];
                it.work_dir = Some(dir.to_string_lossy().into_owned());
                it.session_id = None;
            }
            let run = st.runs.iter_mut().find(|r| r.id == run_id).unwrap();
            let it = &mut run.items[idx];
            it.attempts += 1;
            it.status = "running".into();
            it.error = None;
            it.started_at.get_or_insert(now_ms());
            it.active_since = Some(now_ms());
            let opts = JobOpts {
                files: it.files.clone(),
                title: it.title.clone(),
                model: options.model,
                research: options.research,
                lang: options.lang,
                output_dir,
                format: options.format.unwrap_or_else(|| "tap".into()),
            };
            let work_dir = PathBuf::from(it.work_dir.clone().unwrap_or_default());
            let cost_before = it.cost_usd;
            let title = it.title.clone();
            st.active = Some(Active { run_id: run_id.into(), item_id: item_id.into(), ctl: ctl.clone() });
            self.touch(st, run_id);
            let mark = if resume.is_some() { " ↻" } else { "" };
            self.log_line(st, run_id, item_id, &format!("━━ {title}{mark} · AI {version}"), "say");
            (opts, work_dir, resume, cost_before, version, bin)
        };
        let _ = version;

        let me = self.me.clone();
        let (rid, iid) = (run_id.to_string(), item_id.to_string());
        let emit: Arc<dyn Fn(JobEvent) + Send + Sync> = Arc::new(move |e| {
            if let Some(m) = me.upgrade() {
                m.on_job_event(&rid, &iid, e, cost_before);
            }
        });
        let job = Job::new(opts, bin, self.host.assets_dir(), work_dir, emit, resume, self.host.engine(), ctl);
        job.run().await;

        let mut st = self.lock();
        st.active = None;
        if let Some(it) = st.runs.iter_mut().find(|r| r.id == run_id).and_then(|r| r.items.iter_mut().find(|x| x.id == item_id)) {
            settle(it);
            if it.status == "running" {
                it.status = "failed".into(); // ended without a verdict
            }
        }
        self.touch(&mut st, run_id);
    }

    fn on_job_event(&self, run_id: &str, item_id: &str, e: JobEvent, cost_before: f64) {
        let mut guard = self.lock();
        let st = &mut *guard;
        let Some(it) = st.runs.iter_mut().find(|r| r.id == run_id).and_then(|r| r.items.iter_mut().find(|x| x.id == item_id)) else { return };
        match e {
            JobEvent::Stage { stage, text } => {
                it.stage = Some(stage.into());
                self.log_line(st, run_id, item_id, &format!("— {text}"), "info");
                self.touch(st, run_id);
            }
            JobEvent::Log { text, tone } => self.log_line(st, run_id, item_id, &text, tone),
            JobEvent::Activity(text) => self.host.tick(json!({ "runId": run_id, "itemId": item_id, "kind": "activity", "text": text, "at": now_ms() })),
            JobEvent::Stats { cost_usd } => {
                it.cost_usd = cost_before + cost_usd;
                self.touch(st, run_id);
            }
            JobEvent::Session(id) => {
                it.session_id = Some(id);
                self.save(st);
            }
            JobEvent::Done { title, output, slides, articles, cost_usd } => {
                it.status = "done".into();
                it.output = Some(output);
                it.output_title = Some(title);
                it.slides = Some(slides);
                it.articles = Some(articles);
                it.cost_usd = cost_before + cost_usd;
                it.ended_at = Some(now_ms());
                settle(it);
                let item = it.clone();
                let run = st.runs.iter().find(|r| r.id == run_id).cloned().unwrap();
                // The library may call back into the runs (a notebook moved): not under this lock.
                drop(guard);
                self.host.notebook_done(&run, &item);
            }
            JobEvent::Fail(message) => {
                it.status = "failed".into();
                it.error = Some(message.clone());
                it.ended_at = Some(now_ms());
                self.log_line(st, run_id, item_id, &message, "err");
            }
            JobEvent::Halted(reason) => {
                it.status = match reason {
                    "skip" => "skipped",
                    "pause" => "paused",
                    _ => "stopped",
                }
                .into();
                if reason == "skip" {
                    it.ended_at = Some(now_ms());
                }
                self.log_line(st, run_id, item_id, &format!("■ {}", t(&format!("halt.{reason}"), &[])), "warn");
            }
        }
    }

    // ---------- logs (one JSON line per entry, in the item's working folder) ----------
    fn log_line(&self, st: &State, run_id: &str, item_id: &str, text: &str, tone: &str) {
        let at = now_ms();
        let dir = st.runs.iter().find(|r| r.id == run_id).and_then(|r| r.items.iter().find(|x| x.id == item_id)).and_then(|it| it.work_dir.clone());
        if let Some(dir) = dir {
            if let Ok(mut f) = std::fs::OpenOptions::new().append(true).create(true).open(Path::new(&dir).join("log.jsonl")) {
                let _ = writeln!(f, "{}", json!({ "at": at, "text": text, "tone": tone }));
            }
        }
        self.host.tick(json!({ "runId": run_id, "itemId": item_id, "kind": "log", "text": text, "tone": tone, "at": at }));
    }

    pub fn log(&self, run_id: &str, item_id: &str) -> Vec<Value> {
        let dir = { self.lock().runs.iter().find(|r| r.id == run_id).and_then(|r| r.items.iter().find(|x| x.id == item_id)).and_then(|it| it.work_dir.clone()) };
        let Some(dir) = dir else { return vec![] };
        let Ok(text) = std::fs::read_to_string(Path::new(&dir).join("log.jsonl")) else { return vec![] };
        let lines: Vec<&str> = text.trim().split('\n').filter(|l| !l.is_empty()).collect();
        lines[lines.len().saturating_sub(3000)..].iter().filter_map(|l| serde_json::from_str(l).ok()).collect()
    }

    // Working folders are kept while a run might still use them (unfinished items) or for the last 30
    // finished items; older ones go.
    fn prune(&self, st: &State, _current: &str) {
        let jobs = self.host.jobs_dir();
        let Ok(rd) = std::fs::read_dir(&jobs) else { return };
        let dirs: Vec<String> = rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        let mut needed: HashSet<String> = HashSet::new();
        let mut finished: Vec<(String, i64)> = vec![];
        for r in &st.runs {
            for it in &r.items {
                let Some(wd) = &it.work_dir else { continue };
                let name = basename(Path::new(wd), "");
                if !is_final(&it.status) {
                    needed.insert(name);
                } else {
                    finished.push((name, it.ended_at.unwrap_or(0)));
                }
            }
        }
        finished.sort_by(|a, b| b.1.cmp(&a.1));
        needed.extend(finished.into_iter().take(30).map(|f| f.0));
        for d in dirs.into_iter().filter(|d| !needed.contains(d)) {
            let _ = std::fs::remove_dir_all(jobs.join(d));
        }
    }
}
