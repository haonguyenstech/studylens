// Calls into the engine (src/engine): the checks and page assembly of the notebook formats, the text
// of Office files and the Mermaid diagrams. In the app the engine runs in the window (an
// "engine:call" event out, the engine_reply command back); in the tests it runs under Node.
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{oneshot, watch};

/// Sends one call: (id, method, args).
pub type Transport = Box<dyn Fn(u64, &str, Value) + Send + Sync>;

pub struct Engine {
    send: Transport,
    next: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    ready: watch::Sender<bool>,
    readable: Mutex<HashSet<PathBuf>>, // files the engine may read (the job's sources)
}

impl Engine {
    pub fn new(send: Transport, ready: bool) -> Arc<Self> {
        Arc::new(Engine { send, next: AtomicU64::new(1), pending: Mutex::new(HashMap::new()), ready: watch::Sender::new(ready), readable: Mutex::new(HashSet::new()) })
    }

    /// The window (re)loaded the engine: calls sent to the page that went away will never be answered.
    pub fn set_ready(&self) {
        for (_, tx) in self.pending.lock().unwrap().drain() {
            let _ = tx.send(Err("the app window reloaded".into()));
        }
        self.ready.send_replace(true);
    }

    pub fn reply(&self, id: u64, ok: bool, value: Value) {
        if let Some(tx) = self.pending.lock().unwrap().remove(&id) {
            let _ = tx.send(if ok { Ok(value) } else { Err(value.as_str().unwrap_or("engine error").to_string()) });
        }
    }

    pub async fn call<T: DeserializeOwned>(&self, method: &str, args: Value) -> Result<T, String> {
        let mut ready = self.ready.subscribe();
        if tokio::time::timeout(Duration::from_secs(60), ready.wait_for(|r| *r)).await.is_err() {
            return Err("the app window is not ready".into());
        }
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        (self.send)(id, method, args);
        let res = tokio::time::timeout(Duration::from_secs(15 * 60), rx).await;
        self.pending.lock().unwrap().remove(&id);
        match res {
            Ok(Ok(Ok(v))) => serde_json::from_value(v).map_err(|e| e.to_string()),
            Ok(Ok(Err(e))) => Err(e),
            _ => Err("the app window did not answer".into()),
        }
    }

    pub fn allow_read(&self, paths: impl IntoIterator<Item = PathBuf>) {
        self.readable.lock().unwrap().extend(paths);
    }

    /// Bytes of a file the current job handed to the engine; anything else is refused.
    pub fn read(&self, path: &Path) -> Result<Vec<u8>, String> {
        if !self.readable.lock().unwrap().contains(path) {
            return Err(format!("not readable: {}", path.display()));
        }
        std::fs::read(path).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
/// The engine as a Node process (`node dist/engine.cjs --serve`): for tests and dev tools.
pub fn node_engine(engine_js: &Path) -> std::io::Result<Arc<Engine>> {
    use std::io::{BufRead, BufReader, Write};
    let mut child = std::process::Command::new("node")
        .arg(engine_js)
        .arg("--serve")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()?;
    let stdin = Mutex::new(child.stdin.take().unwrap());
    let stdout = child.stdout.take().unwrap();
    let engine = Engine::new(
        Box::new(move |id, method, args| {
            let line = serde_json::json!({ "id": id, "method": method, "args": args }).to_string();
            let mut w = stdin.lock().unwrap();
            let _ = writeln!(w, "{line}");
            let _ = w.flush();
        }),
        true,
    );
    let weak = Arc::downgrade(&engine);
    std::thread::spawn(move || {
        let _child = child; // lives as long as the reader
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            let Some(e) = weak.upgrade() else { break };
            e.reply(v["id"].as_u64().unwrap_or(0), v["ok"].as_bool().unwrap_or(false), v["value"].clone());
        }
    });
    Ok(engine)
}
