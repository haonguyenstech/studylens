// End-to-end test of the run engine with the fake Claude (scripts/fake-claude.mjs) and the engine
// under Node (dist/engine.cjs, so `npm run build` first; `npm test` does). No window, no real AI.
// Covers: pause → continue (same session), stop → app restart → continue, skip, retry item,
// retry failed, start over, delete, project folders, relocation, Deep Brief, WBS Map.
use crate::engine::{node_engine, Engine};
use crate::runs::{BoxFut, Run, RunHost, RunItem, RunManager, RunRequest};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

struct TestHost {
    base: PathBuf,
    engine: Arc<Engine>,
}

impl RunHost for TestHost {
    fn data_file(&self, name: &str) -> PathBuf {
        self.base.join("data").join(name)
    }
    fn jobs_dir(&self) -> PathBuf {
        self.base.join("data").join("jobs")
    }
    fn assets_dir(&self) -> PathBuf {
        root().join("assets")
    }
    fn claude(&self) -> BoxFut<'_, Result<(String, String), String>> {
        Box::pin(async { Ok((root().join("scripts").join("fake-claude.mjs").to_string_lossy().into_owned(), "9.9.9 (Claude Code)".into())) })
    }
    fn publish(&self, _: &Run) {}
    fn removed(&self, _: &str) {}
    fn tick(&self, _: Value) {}
    fn notebook_done(&self, _: &Run, _: &RunItem) {}
    fn output_dir(&self, run: &Run) -> String {
        if run.project_id.as_deref() == Some("p1") { self.base.join("Project One").to_string_lossy().into_owned() } else { run.options.output_dir.clone() }
    }
    fn engine(&self) -> Arc<Engine> {
        self.engine.clone()
    }
}

fn get(m: &RunManager, id: &str) -> Run {
    m.list().into_iter().find(|r| r.id == id).expect("run")
}

async fn until(m: &RunManager, id: &str, ok: impl Fn(&Run) -> bool, secs: u64) -> Run {
    for _ in 0..secs * 10 {
        let r = get(m, id);
        if ok(&r) {
            return r;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("timeout waiting on run {id}: {:?}", get(m, id).items.iter().map(|i| (&i.status, &i.error)).collect::<Vec<_>>());
}

fn statuses(r: &Run) -> String {
    r.items.iter().map(|x| x.status.as_str()).collect::<Vec<_>>().join(",")
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[tokio::test(flavor = "multi_thread")]
async fn runs_end_to_end() {
    let engine_js = root().join("dist").join("engine.cjs");
    assert!(engine_js.exists(), "run `npm run build` first (needs dist/engine.cjs)");
    std::env::set_var("FAKE_DELAY", "700");
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().to_path_buf();
    let docs = base.join("docs");
    std::fs::create_dir_all(&docs).unwrap();
    let files: Vec<String> = ["A one.pdf", "B broken.pdf", "C three.pdf"].iter().map(|n| { let p = docs.join(n); std::fs::write(&p, "x").unwrap(); s(&p) }).collect();
    let engine = node_engine(&engine_js).unwrap();
    let host = || Arc::new(TestHost { base: base.clone(), engine: engine.clone() });
    let req = |files: Vec<String>, titles: Vec<&str>| RunRequest {
        files,
        mode: "separate".into(),
        title: "Test".into(),
        titles: Some(titles.into_iter().map(String::from).collect()),
        lang: "Tiếng Việt".into(),
        output_dir: s(&docs),
        ..Default::default()
    };

    // 1. pause → continue resumes the same session
    let mut m = RunManager::new(host());
    let id = m.create(req(files.clone(), vec!["A one", "B broken", "C three"]));
    until(&m, &id, |r| r.items[0].session_id.is_some(), 20).await;
    m.action(&id, "pause").await.unwrap();
    let run = until(&m, &id, |r| r.items[0].status == "paused", 20).await;
    let sid = run.items[0].session_id.clone();
    assert_eq!(run.state, "paused", "pause: run is paused");
    m.action(&id, "resume").await.unwrap();
    let run = until(&m, &id, |r| r.state == "failed" || r.state == "done", 30).await;
    assert_eq!(statuses(&run), "done,failed,done", "continue: items finished");
    assert!(run.items[0].attempts == 2 && run.items[0].session_id == sid, "continue: item 1 resumed the same Claude session");
    assert!(m.log(&id, &run.items[0].id).iter().any(|l| l["text"].as_str().unwrap_or("").contains("Resumed session")), "continue: log shows the resumed session");
    assert!(docs.join("A one/A one.html").exists() && docs.join("C three/C three.html").exists(), "outputs: one folder per notebook");
    assert!(run.items[1].error.as_deref().unwrap_or("").contains("simulated failure"), "failure: Claude's stderr is in the error");

    // 2. retry failed: B fails again (same input), the others stay done
    m.action(&id, "retryFailed").await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    let run = until(&m, &id, |r| r.state == "failed" || r.state == "done", 30).await;
    assert!(statuses(&run) == "done,failed,done" && run.items[1].attempts == 2 && run.items[0].attempts == 2 && run.items[2].attempts == 1, "retry failed: only the failed item ran again");

    // 3. stop → "app restart" (new manager from disk) → continue
    assert_eq!(run.items[0].output.as_deref(), Some(s(&docs.join("A one").join("A one.html")).as_str()), "item output points into its folder");
    for n in ["A one", "C three"] {
        std::fs::remove_dir_all(docs.join(n)).unwrap();
    }
    let id2 = m.create(req(vec![files[0].clone(), files[2].clone()], vec!["A one", "C three"]));
    until(&m, &id2, |r| r.items[0].session_id.is_some(), 20).await;
    m.action(&id2, "stop").await.unwrap();
    until(&m, &id2, |r| r.items[0].status == "stopped", 20).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    m = RunManager::new(host()); // what the app sees after a relaunch
    let run2 = get(&m, &id2);
    assert!(run2.state == "stopped" && run2.items[0].status == "stopped", "restart: stopped run reloaded from disk");
    m.action(&id2, "resume").await.unwrap();
    let run2 = until(&m, &id2, |r| r.state == "done", 30).await;
    assert!(run2.items[0].attempts == 2 && statuses(&run2) == "done,done", "restart: continued after relaunch and finished");
    assert_eq!(run2.items[0].output.as_deref(), Some(s(&docs.join("A one").join("A one.html")).as_str()), "restart: the freed folder name is reused");

    // 3b. a name whose folder already exists gets " (2)" instead of mixing notebooks
    let mut r = req(vec![files[0].clone()], vec!["A one"]);
    r.title = "A one".into();
    let id2b = m.create(r);
    let run2b = until(&m, &id2b, |r| r.state == "done", 30).await;
    assert_eq!(run2b.items[0].output.as_deref(), Some(s(&docs.join("A one (2)").join("A one (2).html")).as_str()), "taken folder → \"A one (2)\"");
    m.action(&id2b, "remove").await.unwrap();

    // 4. skip the running item, then retry it alone
    let id3 = m.create(req(vec![files[0].clone(), files[2].clone()], vec!["A one", "C three"]));
    let run3 = until(&m, &id3, |r| r.items[0].status == "running", 20).await;
    m.item_action(&id3, &run3.items[0].id, "skip").await.unwrap();
    let run3 = until(&m, &id3, |r| r.state == "done" || r.state == "failed", 30).await;
    assert_eq!(statuses(&run3), "skipped,done", "skip: item 1 skipped, item 2 done");
    m.item_action(&id3, &run3.items[0].id, "retry").await.unwrap();
    let run3 = until(&m, &id3, |r| r.items[0].status == "done" && r.state == "done", 30).await;
    assert_eq!(run3.state, "done", "retry item: the skipped item ran on its own and the run completed");

    // 5. start over wipes progress; delete removes run + working folders
    m.action(&id3, "restart").await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    let run3 = until(&m, &id3, |r| r.state == "done", 30).await;
    let starts = m.log(&id3, &run3.items[1].id).iter().filter(|l| l["text"].as_str().unwrap_or("").starts_with("━━")).count();
    assert!(run3.items.iter().all(|x| x.attempts == 1) && starts == 1, "start over: fresh attempts, old working folder and log wiped");
    let dirs: Vec<String> = run3.items.iter().filter_map(|x| x.work_dir.clone()).collect();
    m.action(&id3, "remove").await.unwrap();
    assert!(m.list().iter().all(|r| r.id != id3) && dirs.iter().all(|d| !Path::new(d).exists()), "delete: run and its working folders removed");
    let saved: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(base.join("data/runs.json")).unwrap()).unwrap();
    assert_eq!(saved.len(), 2, "runs.json keeps the other runs");

    // 6. a run in a project saves into the project's folder (resolved when the item starts)
    let mut r = req(vec![files[2].clone()], vec!["C three"]);
    r.title = "C three".into();
    r.project_id = Some("p1".into());
    let id4 = m.create(r);
    let run4 = until(&m, &id4, |r| r.state == "done", 30).await;
    assert_eq!(run4.items[0].output.as_deref(), Some(s(&base.join("Project One").join("C three").join("C three.html")).as_str()), "project run: notebook saved in the project folder");

    // 6b. a notebook moved elsewhere: the run follows it (live), and stale paths are repaired from the library
    let old = run4.items[0].output.clone().unwrap();
    let moved = base.join("moved.html");
    std::fs::write(&moved, "x").unwrap();
    m.relocate(&old, &s(&moved));
    assert_eq!(get(&m, &id4).items[0].output.as_deref(), Some(s(&moved).as_str()), "relocate: the run points to the moved file");
    m.relocate(&s(&moved), &s(&base.join("gone.html")));
    m.repair_outputs(|_, _| Some(s(&moved)));
    assert_eq!(get(&m, &id4).items[0].output.as_deref(), Some(s(&moved).as_str()), "repair: a missing output takes the library's path");

    // 7. Deep Brief format: its own guide and template, the output is the brief (no diagram drawing under Node)
    let mut r = req(vec![files[0].clone()], vec!["Brief one"]);
    r.title = "Brief one".into();
    r.format = Some("brief".into());
    let id5 = m.create(r);
    let run5 = until(&m, &id5, |r| r.state == "done" || r.state == "failed", 30).await;
    assert_eq!(run5.state, "done", "brief run finished: {:?}", run5.items[0].error);
    let html = std::fs::read_to_string(run5.items[0].output.as_ref().unwrap()).unwrap();
    assert!(html.contains("class=\"rail\"") && html.contains("href=\"#s2\"") && html.contains("PHẦN I · Base") && !html.contains("{{"), "brief: navigation built from the sections, template filled");
    assert!(std::fs::read_to_string(Path::new(run5.items[0].work_dir.as_ref().unwrap()).join("GUIDE.md")).unwrap().contains("Deep Brief"), "brief: the Deep Brief guide was given to the AI");
    assert!(run5.items[0].slides == Some(3) && run5.items[0].articles == Some(1), "brief: 3 sections, 1 diagram counted");

    // 8. WBS Map: reads the workbook itself; a wrong row range comes back as an error and is fixed
    let wbs = docs.join("RoomBook badwbs.xlsx");
    let made = std::process::Command::new("node")
        .current_dir(root())
        .args(["-e", &format!("import('./scripts/wbs-fixture.mjs').then((m) => m.makeWbsXlsx({}))", serde_json::to_string(&s(&wbs)).unwrap())])
        .status()
        .unwrap();
    assert!(made.success());
    let mut r = req(vec![s(&wbs)], vec![]);
    r.mode = "merge".into();
    r.title = "RoomBook map".into();
    r.titles = None;
    r.format = Some("wbs".into());
    let id6 = m.create(r);
    let run6 = until(&m, &id6, |r| r.state == "done" || r.state == "failed", 30).await;
    assert_eq!(run6.state, "done", "wbs run finished: {:?}", run6.items[0].error);
    let work = Path::new(run6.items[0].work_dir.as_ref().unwrap());
    assert!(std::fs::read_to_string(work.join("GUIDE.md")).unwrap().contains("WBS Map") && work.join("EXAMPLE.json").exists(), "wbs: its guide and example were given to the AI");
    assert!(m.log(&id6, &run6.items[0].id).iter().any(|l| l["text"].as_str().unwrap_or("").contains("dòng tổng")), "wbs: the totals mismatch went back to the AI");
    let html = std::fs::read_to_string(run6.items[0].output.as_ref().unwrap()).unwrap();
    assert!(html.contains("RoomBook map") && html.contains("id=\"dmap\"") && html.contains(">136<") && !html.contains("{{") && !html.contains("Stale draft row"), "wbs: page built from the sheet (136 h), hidden draft ignored");
    assert!(run6.items[0].slides == Some(4) && run6.items[0].articles == Some(8), "wbs: 4 modules, 8 items counted");

    // 9. Office input: text made by the engine, images pulled out, both named in the prompt
    let pptx = docs.join("Deck.pptx");
    let made = std::process::Command::new("node")
        .current_dir(root())
        .args(["-e", &format!(
            "const Z=require('jszip');const z=new Z();z.file('ppt/slides/slide1.xml','<p:sld><a:p><a:r><a:t>Hello &amp; welcome</a:t></a:r></a:p></p:sld>');z.file('ppt/media/image1.png','PNG');z.generateAsync({{type:'nodebuffer'}}).then(b=>require('fs').writeFileSync({},b))",
            serde_json::to_string(&s(&pptx)).unwrap()
        )])
        .status()
        .unwrap();
    assert!(made.success());
    let mut r = req(vec![s(&pptx)], vec![]);
    r.mode = "merge".into();
    r.title = "Deck".into();
    let id7 = m.create(r);
    let run7 = until(&m, &id7, |r| r.state == "done" || r.state == "failed", 30).await;
    assert_eq!(run7.state, "done", "pptx run finished: {:?}", run7.items[0].error);
    let work = Path::new(run7.items[0].work_dir.as_ref().unwrap());
    let md = std::fs::read_to_string(work.join("input-text").join("01-Deck.md")).unwrap();
    assert!(md.starts_with("# Deck.pptx\n\n## Slide 1") && md.contains("- Hello & welcome"), "pptx: slide text extracted: {md}");
    assert!(work.join("input-media").join("01-Deck").join("image1.png").exists(), "pptx: embedded image extracted");
    assert!(m.log(&id7, &run7.items[0].id).iter().any(|l| l["text"].as_str().unwrap_or("").contains("Deck.pptx")), "pptx: extraction logged");
}
