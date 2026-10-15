// Ask AI: chats with Claude about the user's notebooks. A message can @mention notebooks or whole
// projects, and attach files (picked, dropped or pasted images); Claude gets them read-only and
// answers in Markdown, streamed to the window. Each chat is one Claude session (--resume), run in
// its own folder (sessions are kept per folder); attachments are copied into <chat>/files, so they
// stay readable when the originals move. Chats live in chats.json in the data folder.
use crate::claude::{kill_tree, spawn_claude};
use crate::i18n::t;
use crate::library::{s, Library, Record};
use crate::util::{iso, js_slice, js_tail, now_ms, rand_hex, read_json, write_json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub kind: String, // "notebook" | "project"
    pub id: String,
    pub title: String,
}

/// A file attached to a message: first staged (chats/_staged), then moved into the chat's files/.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub path: String,
    pub kind: String, // "image" | "file"
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Staged {
    pub files: Vec<Attachment>,
    pub errors: Vec<String>,
}

pub const MAX_ATTACH: u64 = 30 * 1024 * 1024;
const IMAGES: [&str; 5] = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String, // "user" | "assistant"
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mentions: Vec<Mention>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<Attachment>,
    pub at: String,
    /// assistant: "streaming" | "done" | "stopped" | "error"
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// assistant: questions to ask next (written by Claude after FOLLOW_UPS, shown as chips)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub followups: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Claude ends an answer with this line, then up to 3 "- question" lines (cut off before showing).
pub const FOLLOW_UPS: &str = "[[FOLLOWUPS]]";

/// The answer text, and the follow-up questions after the marker.
pub fn split_followups(text: &str) -> (String, Vec<String>) {
    match text.find(FOLLOW_UPS) {
        None => (text.trim_end().to_string(), vec![]),
        Some(i) => {
            let qs = text[i + FOLLOW_UPS.len()..]
                .lines()
                .map(|l| l.trim().trim_start_matches(['-', '*', '•']).trim().to_string())
                .filter(|l| !l.is_empty())
                .take(3)
                .collect();
            (text[..i].trim_end().to_string(), qs)
        }
    }
}

struct Answer {
    text: String,
    cost_usd: Option<f64>,
    ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Everything mentioned so far: Claude may read these for the rest of the chat.
    #[serde(default)]
    pub mentions: Vec<Mention>,
    #[serde(default)]
    pub messages: Vec<Message>,
    /// The model picked in the chat ("" = the default)
    #[serde(default)]
    pub model: String,
    /// Pinned to the top of the chat list
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub pinned: bool,
}

/// What the window shows in the chat list.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub last: String,
    pub busy: bool,
    pub pinned: bool,
}

pub trait ChatHost: Send + Sync {
    fn library(&self) -> Arc<Library>;
    /// Claude's path, and the model / web access picked in Settings.
    fn claude(&self) -> crate::runs::BoxFut<'_, Result<String, String>>;
    fn model(&self) -> String;
    fn research(&self) -> bool;
    /// The text of a Word / PowerPoint / Excel file (Claude can't read those directly).
    fn office_text(&self, path: PathBuf, ext: String) -> crate::runs::BoxFut<'_, Result<String, String>>;
    fn emit(&self, event: &str, payload: Value);
}

pub struct Chats {
    dir: PathBuf,
    file: PathBuf,
    list: Mutex<Vec<Chat>>,
    busy: Mutex<HashMap<String, Option<u32>>>, // chat id → claude's pid while it answers
    stopped: Mutex<Vec<String>>,
    host: Arc<dyn ChatHost>,
}

impl Chats {
    pub fn new(data_dir: &Path, host: Arc<dyn ChatHost>) -> Arc<Self> {
        let file = data_dir.join("chats.json");
        let mut list: Vec<Chat> = read_json(&file).unwrap_or_default();
        // An answer cut off by quitting the app.
        for c in &mut list {
            for m in &mut c.messages {
                if m.status == "streaming" {
                    m.status = "stopped".into();
                }
            }
        }
        let _ = std::fs::remove_dir_all(data_dir.join("chats").join("_staged")); // attachments never sent
        Arc::new(Chats { dir: data_dir.join("chats"), file, list: Mutex::new(list), busy: Mutex::new(HashMap::new()), stopped: Mutex::new(vec![]), host })
    }

    fn staged_dir(&self) -> PathBuf {
        self.dir.join("_staged")
    }

    /// Files under the chats folder (attachments) may be shown in the window.
    pub fn serves(&self, p: &Path) -> bool {
        match (std::fs::canonicalize(p), std::fs::canonicalize(&self.dir)) {
            (Ok(f), Ok(d)) => f.starts_with(d),
            _ => false,
        }
    }

    fn stage_file(&self, name: &str, write: impl FnOnce(&Path) -> std::io::Result<u64>) -> Result<Attachment, String> {
        let name = Path::new(name).file_name().map(|n| n.to_string_lossy().into_owned()).filter(|n| !n.is_empty()).unwrap_or_else(|| "file".into());
        let ext = crate::paths::extname(Path::new(&name)).to_lowercase();
        if !crate::convert::accepted(&ext) {
            return Err(t("conv.unsupported", &[("ext", if ext.is_empty() { "?" } else { &ext }), ("name", &name)]));
        }
        let dir = self.staged_dir().join(rand_hex(6));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(&name);
        let size = write(&path).map_err(|e| format!("{name}: {e}"))?;
        let kind = if IMAGES.contains(&ext.as_str()) { "image" } else { "file" };
        Ok(Attachment { name, path: path.to_string_lossy().into_owned(), kind: kind.into(), size })
    }

    /// Copy files from disk into the staging folder (picked or dropped).
    pub fn stage_paths(&self, paths: &[String]) -> Staged {
        let mut out = Staged::default();
        for p in paths {
            let src = Path::new(p);
            let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let res = match std::fs::metadata(src) {
                Ok(m) if !m.is_file() => Err(t("chat.notFile", &[("name", &name)])),
                Ok(m) if m.len() > MAX_ATTACH => Err(t("chat.tooBig", &[("name", &name), ("mb", &(MAX_ATTACH / 1048576).to_string())])),
                Ok(_) => self.stage_file(&name, |to| std::fs::copy(src, to)),
                Err(e) => Err(format!("{name}: {e}")),
            };
            match res {
                Ok(a) => out.files.push(a),
                Err(e) => out.errors.push(e),
            }
        }
        out
    }

    /// Save bytes the window has (a pasted screenshot, a file dragged from a browser).
    pub fn stage_bytes(&self, name: &str, bytes: &[u8]) -> Result<Attachment, String> {
        if bytes.len() as u64 > MAX_ATTACH {
            return Err(t("chat.tooBig", &[("name", name), ("mb", &(MAX_ATTACH / 1048576).to_string())]));
        }
        self.stage_file(name, |to| std::fs::write(to, bytes).map(|_| bytes.len() as u64))
    }

    /// Move staged attachments into <chat>/files (names kept, made unique).
    fn adopt(&self, id: &str, list: &[Attachment]) -> Result<Vec<Attachment>, String> {
        let staged = std::fs::canonicalize(self.staged_dir()).ok();
        let files = self.dir.join(id).join("files");
        let mut out = vec![];
        for a in list {
            let src = std::fs::canonicalize(&a.path).map_err(|_| t("chat.attachGone", &[("name", &a.name)]))?;
            if !staged.as_ref().is_some_and(|d| src.starts_with(d)) {
                return Err(t("chat.attachGone", &[("name", &a.name)]));
            }
            std::fs::create_dir_all(&files).map_err(|e| e.to_string())?;
            let mut to = files.join(&a.name);
            let mut n = 2;
            while to.exists() {
                to = files.join(format!("{n}-{}", a.name));
                n += 1;
            }
            if std::fs::rename(&src, &to).is_err() {
                std::fs::copy(&src, &to).map_err(|e| e.to_string())?;
            }
            if let Some(parent) = src.parent() {
                let _ = std::fs::remove_dir_all(parent);
            }
            out.push(Attachment { path: to.to_string_lossy().into_owned(), ..a.clone() });
        }
        Ok(out)
    }

    fn save(&self, list: &[Chat]) {
        let _ = write_json(&self.file, &list, false);
    }

    pub fn summaries(&self) -> Vec<ChatSummary> {
        let busy = self.busy.lock().unwrap();
        let mut out: Vec<ChatSummary> = self
            .list
            .lock()
            .unwrap()
            .iter()
            .map(|c| ChatSummary {
                id: c.id.clone(),
                title: c.title.clone(),
                updated_at: c.updated_at.clone(),
                last: c.messages.iter().rev().find(|m| !m.text.is_empty()).map(|m| preview(&m.text)).unwrap_or_default(),
                busy: busy.contains_key(&c.id),
                pinned: c.pinned,
            })
            .collect();
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        out
    }

    pub fn get(&self, id: &str) -> Option<Chat> {
        self.list.lock().unwrap().iter().find(|c| c.id == id).cloned()
    }

    fn changed(&self, id: &str) {
        if let Some(c) = self.get(id) {
            self.host.emit("chat:update", serde_json::to_value(&c).unwrap_or_default());
        }
    }

    pub fn rename(&self, id: &str, title: &str) -> Result<(), String> {
        let title = title.trim();
        if title.is_empty() {
            return Err(t("chat.noTitle", &[]));
        }
        let mut list = self.list.lock().unwrap();
        let c = list.iter_mut().find(|c| c.id == id).ok_or_else(|| t("chat.notFound", &[]))?;
        c.title = js_slice(title, 120).to_string();
        self.save(&list);
        drop(list);
        self.changed(id);
        Ok(())
    }

    pub fn pin(&self, id: &str, pinned: bool) -> Result<(), String> {
        let mut list = self.list.lock().unwrap();
        let c = list.iter_mut().find(|c| c.id == id).ok_or_else(|| t("chat.notFound", &[]))?;
        c.pinned = pinned;
        self.save(&list);
        drop(list);
        self.changed(id);
        Ok(())
    }

    pub fn remove(&self, id: &str) {
        self.stop(id);
        let mut list = self.list.lock().unwrap();
        list.retain(|c| c.id != id);
        self.save(&list);
        drop(list);
        let _ = std::fs::remove_dir_all(self.dir.join(id));
        self.host.emit("chat:update", json!({ "id": id, "removed": true }));
    }

    /// The app is quitting: stop every answer in progress (Claude runs in its own process group).
    pub fn shutdown(&self) {
        for pid in self.busy.lock().unwrap().values().flatten() {
            kill_tree(*pid);
        }
    }

    pub fn stop(&self, id: &str) {
        let pid = self.busy.lock().unwrap().get(id).cloned().flatten();
        if self.busy.lock().unwrap().contains_key(id) {
            self.stopped.lock().unwrap().push(id.to_string());
        }
        if let Some(pid) = pid {
            kill_tree(pid);
        }
    }

    /// Add the user's message (to a new chat when `chat_id` is None) and start the answer.
    pub fn send(self: &Arc<Self>, chat_id: Option<String>, text: String, mentions: Vec<Mention>, attachments: Vec<Attachment>, model: Option<String>) -> Result<Chat, String> {
        let mut text = text.trim().to_string();
        if text.is_empty() && attachments.is_empty() {
            return Err(t("chat.empty", &[]));
        }
        if text.is_empty() {
            text = t("chat.lookAt", &[]);
        }
        let now = iso(now_ms());
        let mut list = self.list.lock().unwrap();
        let id = match chat_id {
            Some(id) => {
                if self.busy.lock().unwrap().contains_key(&id) {
                    return Err(t("chat.busy", &[]));
                }
                id
            }
            None => {
                let id = format!("{}-{}", now.replace([':', '.'], "-"), rand_hex(4));
                // "@Caching Basics what is…" → "Caching Basics what is…"
                let plain = mentions.iter().fold(text.clone(), |t, m| t.replace(&format!("@{}", m.title), &m.title));
                list.push(Chat { id: id.clone(), title: title_from(&plain), created_at: now.clone(), updated_at: now.clone(), session: None, mentions: vec![], messages: vec![], model: String::new(), pinned: false });
                id
            }
        };
        let attachments = match self.adopt(&id, &attachments) {
            Ok(a) => a,
            Err(e) => {
                list.retain(|c| !(c.id == id && c.messages.is_empty())); // a new chat that never started
                return Err(e);
            }
        };
        let chat = list.iter_mut().find(|c| c.id == id).ok_or_else(|| t("chat.notFound", &[]))?;
        let fresh: Vec<Mention> = mentions.iter().filter(|m| !chat.mentions.contains(m)).cloned().collect();
        chat.mentions.extend(fresh.iter().cloned());
        if let Some(m) = model.filter(|m| ["", "opus", "sonnet", "haiku"].contains(&m.as_str())) {
            chat.model = m;
        }
        let model = if chat.model.is_empty() { self.host.model() } else { chat.model.clone() };
        let blank = Message { id: String::new(), role: String::new(), text: String::new(), mentions: vec![], attachments: vec![], at: now.clone(), status: String::new(), error: None, followups: vec![], cost_usd: None, ms: None, model: None };
        chat.messages.push(Message { id: rand_hex(6), role: "user".into(), text: text.clone(), mentions, attachments: attachments.clone(), ..blank.clone() });
        let reply_id = rand_hex(6);
        chat.messages.push(Message { id: reply_id.clone(), role: "assistant".into(), status: "streaming".into(), model: Some(model.clone()), ..blank });
        chat.updated_at = now;
        let first = chat.session.is_none();
        let (session, all) = (chat.session.clone(), chat.mentions.clone());
        let recap = recap_of(&chat.messages[..chat.messages.len() - 2]);
        let out = chat.clone();
        self.save(&list);
        drop(list);
        self.busy.lock().unwrap().insert(id.clone(), None);
        self.stopped.lock().unwrap().retain(|x| x != &id);
        self.changed(&id);

        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let turn = Turn { id: &id, reply_id: &reply_id, question: &text, fresh: &fresh, all: &all, attached: &attachments, model: &model };
            let mut res = me.answer(&turn, first, session.clone(), None).await;
            // The Claude session is gone (cleaned up, or another machine): start a new one with a recap.
            if let (Err(e), Some(_)) = (&res, &session) {
                if e.contains("No conversation found") && !me.stopped.lock().unwrap().iter().any(|x| x == &id) {
                    me.clear_session(&id);
                    res = me.answer(&turn, true, None, Some(recap)).await;
                }
            }
            me.finish(&id, &reply_id, res);
        });
        Ok(out)
    }

    fn clear_session(&self, id: &str) {
        let mut list = self.list.lock().unwrap();
        if let Some(c) = list.iter_mut().find(|c| c.id == id) {
            c.session = None;
        }
    }

    fn finish(&self, id: &str, reply_id: &str, res: Result<Answer, String>) {
        let stopped = self.stopped.lock().unwrap().iter().any(|x| x == id);
        self.busy.lock().unwrap().remove(id);
        self.stopped.lock().unwrap().retain(|x| x != id);
        let mut list = self.list.lock().unwrap();
        if let Some(m) = list.iter_mut().find(|c| c.id == id).and_then(|c| c.messages.iter_mut().find(|m| m.id == reply_id)) {
            match res {
                _ if stopped => {
                    m.text = split_followups(&m.text).0;
                    m.status = "stopped".into();
                }
                Ok(a) => {
                    let (text, followups) = split_followups(if a.text.trim().is_empty() { &m.text } else { &a.text });
                    m.text = text;
                    m.followups = followups;
                    m.cost_usd = a.cost_usd;
                    m.ms = Some(a.ms);
                    m.status = "done".into();
                }
                Err(e) => {
                    m.status = "error".into();
                    m.error = Some(e);
                }
            }
        }
        if let Some(c) = list.iter_mut().find(|c| c.id == id) {
            c.updated_at = iso(now_ms());
        }
        self.save(&list);
        drop(list);
        self.changed(id);
    }

    fn set_text(&self, id: &str, reply_id: &str, text: &str) {
        let mut list = self.list.lock().unwrap();
        if let Some(m) = list.iter_mut().find(|c| c.id == id).and_then(|c| c.messages.iter_mut().find(|m| m.id == reply_id)) {
            m.text = text.to_string();
        }
    }

    fn set_session(&self, id: &str, session: &str) {
        let mut list = self.list.lock().unwrap();
        if let Some(c) = list.iter_mut().find(|c| c.id == id) {
            if c.session.as_deref() != Some(session) {
                c.session = Some(session.to_string());
                self.save(&list);
            }
        }
    }

    /// One `claude -p` turn; streams the answer and returns its final text.
    async fn answer(&self, turn: &Turn<'_>, first: bool, session: Option<String>, recap: Option<String>) -> Result<Answer, String> {
        let Turn { id, reply_id, question, fresh, all, attached, model } = *turn;
        let started = std::time::Instant::now();
        let bin = self.host.claude().await?;
        let lib = self.host.library();
        let work = self.dir.join(id);
        std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;

        let mut dirs: Vec<String> = vec![];
        for m in all {
            for f in files_of(&lib, m).into_iter().flat_map(|d| d.files) {
                if let Some(p) = Path::new(&f).parent() {
                    let p = p.to_string_lossy().into_owned();
                    if !p.is_empty() && !dirs.contains(&p) && Path::new(&p).is_dir() {
                        dirs.push(p);
                    }
                }
            }
        }
        // Word / PowerPoint / Excel: their text next to them, for Claude to read.
        let mut texts: Vec<Option<PathBuf>> = vec![];
        for a in attached {
            let p = PathBuf::from(&a.path);
            let ext = crate::paths::extname(&p).to_lowercase();
            if !crate::convert::OFFICE.contains(&ext.as_str()) {
                texts.push(None);
                continue;
            }
            self.host.emit("chat:stream", json!({ "chatId": id, "msgId": reply_id, "text": "", "activity": t("chat.extracting", &[("name", &a.name)]) }));
            let md = self.host.office_text(p.clone(), ext).await.map_err(|e| format!("{}: {e}", a.name))?;
            let to = p.with_file_name(format!("{}.txt", a.name));
            std::fs::write(&to, md).map_err(|e| e.to_string())?;
            texts.push(Some(to));
        }
        // A new session after the old one was lost: the rules, every document so far, and a recap.
        let mut prompt = match &recap {
            Some(r) => {
                let mut p = build_prompt(&lib, true, all);
                if !r.is_empty() {
                    p.push_str("Earlier in this conversation (a recap; the full history is gone):\n");
                    p.push_str(r);
                    p.push('\n');
                }
                p
            }
            None => build_prompt(&lib, first, fresh),
        };
        if !attached.is_empty() {
            prompt.push_str("Files the user attached to this message (read them before answering):\n");
            for (a, text) in attached.iter().zip(&texts) {
                let what = if a.kind == "image" { "image" } else { "file" };
                prompt.push_str(&format!("- \"{}\" ({what}): {}\n", a.name, a.path));
                if let Some(t) = text {
                    prompt.push_str(&format!("  - its text: {}\n", t.display()));
                }
            }
            prompt.push('\n');
        }
        prompt.push_str("User:\n");
        prompt.push_str(question);
        prompt.push('\n');

        let mut tools = vec!["Read", "Glob", "Grep"];
        if self.host.research() {
            tools.extend(["WebSearch", "WebFetch"]);
        }
        let mut args: Vec<String> = [
            "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
            "--permission-mode", "dontAsk", "--allowedTools", &tools.join(","),
            "--disallowedTools", "Bash,Write,Edit,NotebookEdit,Task,Agent,Skill,TodoWrite,ScheduleWakeup,Monitor,CronCreate,CronDelete,CronList,RemoteTrigger,PushNotification,EnterWorktree",
            "--strict-mcp-config",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        for d in &dirs {
            args.extend(["--add-dir".into(), d.clone()]);
        }
        if !model.is_empty() {
            args.extend(["--model".into(), model.to_string()]);
        }
        if let Some(sid) = &session {
            args.extend(["--resume".into(), sid.clone()]);
        }

        let mut child = spawn_claude(&bin, &args, Some(&work)).map_err(|e| e.to_string())?;
        if let Some(slot) = self.busy.lock().unwrap().get_mut(id) {
            *slot = child.id();
        }
        if self.stopped.lock().unwrap().iter().any(|x| x == id) {
            if let Some(pid) = child.id() {
                kill_tree(pid); // stopped while it was starting
            }
        }
        let mut stdin = child.stdin.take().unwrap();
        tokio::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
        let mut stderr = child.stderr.take().unwrap();
        let err_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            String::from_utf8_lossy(&buf).into_owned()
        });

        // The answer is the text Claude writes after its last tool use; earlier text ("let me look…")
        // is replaced when it starts reading again.
        let mut text = String::new();
        let mut after_tool = false;
        let mut result_text = String::new();
        let mut result_err = String::new();
        let mut cost: Option<f64> = None;
        let mut last_emit = 0i64;
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(ev) = serde_json::from_str::<Value>(line.trim()) else { continue };
            if let Some(sid) = ev["session_id"].as_str().filter(|s| !s.is_empty()) {
                self.set_session(id, sid);
            }
            let top = !ev["parent_tool_use_id"].is_string();
            let mut emit = |text: &str, activity: Option<String>, force: bool| {
                let now = now_ms();
                if force || now - last_emit > 60 {
                    last_emit = now;
                    self.set_text(id, reply_id, text);
                    self.host.emit("chat:stream", json!({ "chatId": id, "msgId": reply_id, "text": text, "activity": activity }));
                }
            };
            match ev["type"].as_str() {
                Some("stream_event") if top => {
                    let e = &ev["event"];
                    if e["type"] == "content_block_start" {
                        let cb = &e["content_block"];
                        if cb["type"] == "tool_use" {
                            after_tool = true;
                        } else if cb["type"] == "text" {
                            if after_tool {
                                text.clear();
                                after_tool = false;
                            } else if !text.is_empty() {
                                text.push_str("\n\n");
                            }
                        }
                    } else if e["type"] == "content_block_delta" && e["delta"]["type"] == "text_delta" {
                        text.push_str(e["delta"]["text"].as_str().unwrap_or(""));
                        emit(&text, None, false);
                    }
                }
                Some("assistant") => {
                    for c in ev["message"]["content"].as_array().into_iter().flatten() {
                        if c["type"] == "tool_use" {
                            let what = describe(c["name"].as_str().unwrap_or(""), &c["input"]);
                            emit(&text, Some(what), true);
                        }
                    }
                }
                Some("result") => {
                    cost = ev["total_cost_usd"].as_f64().or(cost);
                    if ev["is_error"].as_bool() == Some(true) || ev["subtype"] != "success" {
                        result_err = ev["result"].as_str().filter(|s| !s.is_empty()).or(ev["subtype"].as_str()).unwrap_or("error").to_string();
                    } else {
                        result_text = ev["result"].as_str().unwrap_or("").to_string();
                    }
                }
                _ => {}
            }
        }
        let status = child.wait().await;
        let err_text = err_task.await.unwrap_or_default();
        if !result_err.is_empty() {
            return Err(t("run.claudeError", &[("msg", js_slice(&result_err, 400))]));
        }
        let status = status.map_err(|e| e.to_string())?;
        if !status.success() && !self.stopped.lock().unwrap().iter().any(|x| x == id) {
            let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "null".into());
            let tail = err_text.trim();
            let msg = if tail.is_empty() { t("run.noInfo", &[]) } else { js_tail(tail, 600).to_string() };
            return Err(t("run.exit", &[("code", &code), ("msg", &msg)]));
        }
        let text = if result_text.trim().is_empty() { text } else { result_text };
        Ok(Answer { text, cost_usd: cost, ms: started.elapsed().as_millis() as u64 })
    }
}

/// What one answer is about.
#[derive(Clone, Copy)]
struct Turn<'a> {
    id: &'a str,
    reply_id: &'a str,
    question: &'a str,
    fresh: &'a [Mention],
    all: &'a [Mention],
    attached: &'a [Attachment],
    model: &'a str,
}

/// The last turns as plain text (each message cut short), for a new session to pick up from.
fn recap_of(messages: &[Message]) -> String {
    let start = messages.len().saturating_sub(12);
    messages[start..]
        .iter()
        .filter(|m| !m.text.trim().is_empty())
        .map(|m| {
            let who = if m.role == "user" { "User" } else { "You" };
            let files = m.attachments.iter().map(|a| format!(" [attached \"{}\": {}]", a.name, a.path)).collect::<String>();
            format!("{who}: {}{files}", js_slice(m.text.trim(), 700))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// One line of plain text from a Markdown answer, for the chat list.
fn preview(text: &str) -> String {
    let plain: String = text.chars().filter(|c| !matches!(c, '#' | '*' | '`' | '>' | '|' | '~')).collect();
    js_slice(&plain.split_whitespace().collect::<Vec<_>>().join(" "), 140).to_string()
}

fn title_from(text: &str) -> String {
    let one = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let short = js_slice(&one, 60);
    if short.len() < one.len() { format!("{}…", short.trim_end()) } else { one }
}

/// A mentioned notebook (or each notebook of a mentioned project): its title and files.
struct Doc {
    title: String,
    project: Option<String>,
    notebook: Option<String>,
    sources: Vec<String>,
    files: Vec<String>,
}

fn doc_of(r: &Record, project: Option<String>) -> Doc {
    let notebook = s(r, "output").filter(|p| Path::new(p).is_file()).map(String::from);
    let sources: Vec<String> = r.get("files").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).filter(|p| Path::new(p).is_file()).map(String::from).collect();
    let files = notebook.iter().cloned().chain(sources.iter().cloned()).collect();
    Doc { title: s(r, "title").unwrap_or("").to_string(), project, notebook, sources, files }
}

fn files_of(lib: &Library, m: &Mention) -> Vec<Doc> {
    let history = lib.history();
    if m.kind == "project" {
        let name = lib.project(&m.id).and_then(|p| s(&p, "name").map(String::from));
        history.iter().filter(|h| s(h, "projectId") == Some(&m.id) && s(h, "status") == Some("done")).map(|h| doc_of(h, name.clone())).collect()
    } else {
        history.iter().filter(|h| s(h, "id") == Some(&m.id)).map(|h| {
            let pj = s(h, "projectId").and_then(|p| lib.project(p)).and_then(|p| s(&p, "name").map(String::from));
            doc_of(h, pj)
        }).collect()
    }
}

/// What Claude is told before the question: the rules (first turn) and the newly mentioned documents.
fn build_prompt(lib: &Library, first: bool, fresh: &[Mention]) -> String {
    let mut p = String::new();
    if first {
        p.push_str(
            "You are the study assistant inside StudyLens, a desktop app that turns study material into interactive HTML notebooks.\n\
             Answer the user's questions about their documents.\n\
             - Reply in the language the user writes in.\n\
             - Write GitHub-flavoured Markdown (headings, lists, tables, `code`, fenced code blocks). No HTML. When a diagram helps (a flow, a sequence, a structure), draw it in a ```mermaid block; keep labels short and plain.\n\
             - When documents are referenced, base the answer on them: look before answering. Notebook HTML files are large, so Grep them for the key terms first, then Read just the parts you need (offset/limit). PDFs and images can be read directly; for Word/PowerPoint/Excel sources use the notebook, which holds their content.\n\
             - Cite where each point comes from, right after it, as a Markdown link with the cite: scheme, its target in angle brackets: [short label](<cite:absolute file path#anchor>). Anchor: in a notebook HTML, the id of the element you read it in (an explanation id that starts with d-, or a section heading id like sec3); in a PDF, page=<n>; otherwise leave out the #. Example: [Caching · slide 4](<cite:/Users/me/My Notes/Caching.html#d-cache-hit>). Only cite files and ids you actually saw. If the documents don't cover something, say so, then answer from general knowledge and mark it as such.\n\
             - You can only read files. Don't offer to edit or create them.\n\
             - Keep it focused: answer first, then the detail that helps.\n\
             - End every answer with a line that is exactly [[FOLLOWUPS]], then 3 short questions the user could ask next (in their language), one per line starting with \"- \". Nothing after them.\n\n",
        );
        if fresh.is_empty() {
            p.push_str("No documents are referenced yet. The user can mention notebooks or projects with @ in a later message.\n\n");
        }
    }
    if !fresh.is_empty() {
        p.push_str("Documents the user referenced");
        p.push_str(if first { ":\n" } else { " (new in this message):\n" });
        for m in fresh {
            let docs = files_of(lib, m);
            if m.kind == "project" {
                p.push_str(&format!("- Project \"{}\" ({} notebooks):\n", m.title, docs.len()));
            }
            let pad = if m.kind == "project" { "  " } else { "" };
            if docs.is_empty() {
                p.push_str(&format!("{pad}- \"{}\": no files found (moved or deleted).\n", m.title));
            }
            for d in docs {
                let pj = d.project.map(|n| format!(" (project \"{n}\")")).unwrap_or_default();
                p.push_str(&format!("{pad}- Notebook \"{}\"{pj}\n", d.title));
                if let Some(nb) = d.notebook {
                    p.push_str(&format!("{pad}  - notebook (HTML): {nb}\n"));
                }
                for s in d.sources {
                    p.push_str(&format!("{pad}  - source: {s}\n"));
                }
            }
        }
        p.push('\n');
    }
    p
}

/// "Reading System Design.html" for the line under a streaming answer.
fn describe(tool: &str, input: &Value) -> String {
    let file = input["file_path"].as_str().or(input["path"].as_str()).map(|p| p.rsplit(['/', '\\']).next().unwrap_or(p).to_string());
    match tool {
        "Read" => t("chat.read", &[("file", &file.unwrap_or_default())]),
        "Grep" => t("chat.grep", &[("q", js_slice(input["pattern"].as_str().unwrap_or(""), 40))]),
        "Glob" => t("chat.glob", &[]),
        "WebSearch" => t("chat.web", &[("q", js_slice(input["query"].as_str().unwrap_or(""), 60))]),
        "WebFetch" => t("chat.fetch", &[]),
        other => t("chat.tool", &[("tool", other)]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles() {
        assert_eq!(title_from("  what is\n caching? "), "what is caching?");
        let long = "a ".repeat(50);
        assert!(title_from(&long).ends_with('…'));
        assert_eq!(preview("## Hi\n**bold** `x` | y"), "Hi bold x y");
    }

    struct TestHost {
        lib: Arc<Library>,
        events: Mutex<Vec<(String, Value)>>,
    }
    impl ChatHost for TestHost {
        fn library(&self) -> Arc<Library> {
            self.lib.clone()
        }
        fn claude(&self) -> crate::runs::BoxFut<'_, Result<String, String>> {
            let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
            Box::pin(async move { Ok(root.join("scripts").join("fake-claude.mjs").to_string_lossy().into_owned()) })
        }
        fn model(&self) -> String {
            String::new()
        }
        fn research(&self) -> bool {
            false
        }
        fn office_text(&self, _: PathBuf, _: String) -> crate::runs::BoxFut<'_, Result<String, String>> {
            Box::pin(async { Ok("slide text".into()) })
        }
        fn emit(&self, event: &str, payload: Value) {
            self.events.lock().unwrap().push((event.to_string(), payload));
        }
    }

    async fn settled(chats: &Chats, id: &str) -> Chat {
        for _ in 0..200 {
            let c = chats.get(id).unwrap();
            if c.messages.last().is_some_and(|m| m.status != "streaming") && !chats.busy.lock().unwrap().contains_key(id) {
                return c;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        panic!("chat {id} never finished");
    }

    // With the fake Claude: a question about a mentioned notebook, a follow-up in the same session,
    // a failure, a stop, then reading chats.json back as the next launch would.
    #[tokio::test(flavor = "multi_thread")]
    async fn chat_end_to_end() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        std::fs::create_dir_all(&data).unwrap();
        let nb_dir = tmp.path().join("Notes");
        std::fs::create_dir_all(&nb_dir).unwrap();
        let nb = nb_dir.join("Caching.html");
        std::fs::write(&nb, "<html>cache</html>").unwrap();
        let lib = Arc::new(Library::new(data.clone(), Box::new(|| {}), Box::new(|_, _| {})));
        let serde_json::Value::Object(rec) = json!({ "id": "n1", "status": "done", "title": "Caching", "output": nb.to_string_lossy(), "files": [] }) else { unreachable!() };
        lib.add_history(rec);
        let host = Arc::new(TestHost { lib: lib.clone(), events: Mutex::new(vec![]) });
        let chats = Chats::new(&data, host.clone());
        let m = Mention { kind: "notebook".into(), id: "n1".into(), title: "Caching".into() };

        let c = chats.send(None, "@Caching what is a cache hit?".into(), vec![m.clone()], vec![], None).unwrap();
        assert_eq!(c.title, "Caching what is a cache hit?");
        let c = settled(&chats, &c.id).await;
        let a = c.messages.last().unwrap();
        assert_eq!(a.status, "done", "{:?}", a.error);
        assert!(a.text.contains("Caching.html") && a.text.contains("cache hit"), "{}", a.text);
        let sid = c.session.clone().expect("session saved");
        assert_eq!(a.followups.len(), 3, "follow-ups split off: {:?}", a.followups);
        assert!(!a.text.contains(FOLLOW_UPS));
        assert!(a.cost_usd.is_some() && a.ms.is_some());
        {
            let ev = host.events.lock().unwrap();
            assert!(ev.iter().any(|(e, p)| e == "chat:stream" && p["activity"].as_str().is_some_and(|a| a.contains("Caching.html"))), "a Read line was streamed");
            assert!(ev.iter().any(|(e, p)| e == "chat:stream" && p["text"].as_str().is_some_and(|t| !t.is_empty() && t.len() < a.text.len())), "partial text was streamed");
        }

        // Follow-up: same session (--resume), the notebook still readable.
        chats.send(Some(c.id.clone()), "and a miss?".into(), vec![], vec![], Some("haiku".into())).unwrap();
        assert!(chats.send(Some(c.id.clone()), "too fast".into(), vec![], vec![], None).is_err(), "one answer at a time");
        let c = settled(&chats, &c.id).await;
        assert_eq!(c.session.as_deref(), Some(sid.as_str()));
        assert!(c.messages.last().unwrap().text.contains("Tiếp tục"), "resumed");
        assert_eq!(c.messages.len(), 4);
        assert_eq!(c.model, "haiku");
        assert_eq!(c.messages.last().unwrap().model.as_deref(), Some("haiku"));

        // The Claude session is gone: a new session, told the documents and a recap of the chat.
        chats.list.lock().unwrap().iter_mut().find(|x| x.id == c.id).unwrap().session = Some("gone-1".into());
        chats.send(Some(c.id.clone()), "still there?".into(), vec![], vec![], None).unwrap();
        let c = settled(&chats, &c.id).await;
        let a = c.messages.last().unwrap();
        assert_eq!(a.status, "done", "{:?}", a.error);
        assert!(a.text.contains("recap") && a.text.contains("Caching.html"), "{}", a.text);
        assert!(c.session.as_deref().is_some_and(|s| s != "gone-1"));

        // A failing answer keeps the error.
        chats.send(Some(c.id.clone()), "fail please".into(), vec![], vec![], None).unwrap();
        let c = settled(&chats, &c.id).await;
        assert_eq!(c.messages.last().unwrap().status, "error");

        // Stop while it answers.
        chats.send(Some(c.id.clone()), "a long one".into(), vec![m.clone()], vec![], None).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        chats.stop(&c.id);
        let c = settled(&chats, &c.id).await;
        assert_eq!(c.messages.last().unwrap().status, "stopped");

        // Attachments: staged (copied; a bad type and a missing file refused), pasted bytes, then sent:
        // moved into the chat's files/, Office text extracted next to them, listed for Claude.
        let shot = tmp.path().join("shot.png");
        std::fs::write(&shot, b"png").unwrap();
        let deck = tmp.path().join("Week 3.pptx");
        std::fs::write(&deck, b"pptx").unwrap();
        let bad = tmp.path().join("tool.exe");
        std::fs::write(&bad, b"x").unwrap();
        let st = chats.stage_paths(&[shot.to_string_lossy().into(), deck.to_string_lossy().into(), bad.to_string_lossy().into(), "/no/such.pdf".into()]);
        assert_eq!(st.files.len(), 2);
        assert_eq!(st.errors.len(), 2, "{:?}", st.errors);
        assert_eq!(st.files[0].kind, "image");
        assert_eq!(st.files[1].kind, "file");
        let pasted = chats.stage_bytes("Screenshot.png", b"img").unwrap();
        assert!(chats.stage_bytes("../../evil.exe", b"x").is_err());
        let mut files = st.files.clone();
        files.push(pasted);
        assert!(chats.send(Some(c.id.clone()), "x".into(), vec![], vec![Attachment { path: shot.to_string_lossy().into(), ..files[0].clone() }], None).is_err(), "only staged files can be sent");
        chats.send(Some(c.id.clone()), "".into(), vec![], files, None).unwrap();
        let c = settled(&chats, &c.id).await;
        let q = &c.messages[c.messages.len() - 2];
        assert_eq!(q.text, t("chat.lookAt", &[]));
        assert_eq!(q.attachments.len(), 3);
        for a in &q.attachments {
            assert!(Path::new(&a.path).starts_with(data.join("chats").join(&c.id).join("files")), "{}", a.path);
            assert!(Path::new(&a.path).is_file());
            assert!(chats.serves(Path::new(&a.path)));
        }
        assert!(data.join("chats").join(&c.id).join("files").join("Week 3.pptx.txt").is_file(), "office text");
        assert!(!chats.serves(&shot));
        assert_eq!(std::fs::read_dir(data.join("chats").join("_staged")).map(|d| d.count()).unwrap_or(0), 0, "staging emptied");
        let a = c.messages.last().unwrap();
        assert_eq!(a.status, "done", "{:?}", a.error);
        assert!(a.text.contains("**3**"), "Claude saw the 3 files: {}", a.text);

        // Saved: a new launch reads the same chat; rename and remove.
        let again = Chats::new(&data, host.clone());
        assert_eq!(again.get(&c.id).unwrap().messages.len(), 12);
        assert_eq!(again.summaries()[0].id, c.id);
        again.pin(&c.id, true).unwrap();
        assert!(again.summaries()[0].pinned && Chats::new(&data, host.clone()).get(&c.id).unwrap().pinned);
        again.rename(&c.id, "Caching Q&A").unwrap();
        assert_eq!(again.get(&c.id).unwrap().title, "Caching Q&A");
        again.remove(&c.id);
        assert!(again.get(&c.id).is_none());
        assert!(Chats::new(&data, host).get(&c.id).is_none());
    }

    #[test]
    fn followups() {
        let (t, q) = split_followups("Answer **here**.\n\n[[FOLLOWUPS]]\n- One?\n- Two?\n* Three?\n- Four?");
        assert_eq!(t, "Answer **here**.");
        assert_eq!(q, ["One?", "Two?", "Three?"]);
        assert_eq!(split_followups("No marker\n").1.len(), 0);
    }

    #[test]
    fn tool_lines() {
        assert!(describe("Read", &json!({ "file_path": "/x/y/Notes.html" })).contains("Notes.html"));
        assert!(describe("Grep", &json!({ "pattern": "cache" })).contains("cache"));
    }
}
