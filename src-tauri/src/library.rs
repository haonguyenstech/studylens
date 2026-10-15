// The library: projects (folders on disk) and the notebooks made so far (history.json).
// A project's notebooks live inside its folder, one sub-folder each: <project>/<name>/<name>.html.
// Renaming or moving a notebook moves its folder; renaming a project renames its folder when the
// folder still carries the project's name. Nothing here depends on the window, so it can be tested.
//
// Records are kept as JSON objects (not structs) so every field written by any version survives.
use crate::paths::{basename, free_name, in_own_folder, move_path, safe_name};
use crate::util::{now_ms, rand_hex, read_json, write_json};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf, MAIN_SEPARATOR_STR};
use std::sync::Mutex;

pub const COLORS: [&str; 8] = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF9F0A", "#30D158", "#00C7BE", "#8E8E93"];
const LOOSE_KEEP: usize = 200; // notebooks outside a project: only the latest are kept; project notebooks always
const TAGS_MAX: usize = 20;
const TAG_LEN: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LibraryError {
    Exists,
    Missing,
    NotFound,
    Io(String), // a file system error, shown as it is
}

impl LibraryError {
    /// The message for the user: lib.<code> in the UI language, or the system's own text.
    pub fn message(&self) -> String {
        match self {
            LibraryError::Exists => crate::i18n::t("lib.exists", &[]),
            LibraryError::Missing => crate::i18n::t("lib.missing", &[]),
            LibraryError::NotFound => crate::i18n::t("lib.notFound", &[]),
            LibraryError::Io(m) => m.clone(),
        }
    }
}

impl From<std::io::Error> for LibraryError {
    fn from(e: std::io::Error) -> Self {
        LibraryError::Io(e.to_string())
    }
}

pub type Record = Map<String, Value>;
type Callback = Box<dyn Fn() + Send + Sync>;
type Relocated = Box<dyn Fn(&str, &str) + Send + Sync>;

pub struct Library {
    data_dir: PathBuf,
    lock: Mutex<()>,
    changed: Callback,
    relocated: Relocated, // a notebook file moved (runs keep its path too)
}

pub fn s<'a>(r: &'a Record, k: &str) -> Option<&'a str> {
    r.get(k).and_then(Value::as_str).filter(|v| !v.is_empty())
}

fn exists(p: Option<&str>) -> bool {
    p.is_some_and(|p| Path::new(p).exists())
}

fn path_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

impl Library {
    pub fn new(data_dir: PathBuf, changed: Callback, relocated: Relocated) -> Self {
        Library { data_dir, lock: Mutex::new(()), changed, relocated }
    }

    // ---------- storage ----------
    fn read(&self, f: &str) -> Vec<Record> {
        read_json::<Vec<Value>>(&self.data_dir.join(f))
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| match v { Value::Object(o) => Some(o), _ => None })
            .collect()
    }
    fn load_history(&self) -> Vec<Record> {
        self.read("history.json")
    }
    fn save_history(&self, items: Vec<Record>) {
        let before = self.load_history();
        for h in &items {
            let was = before.iter().find(|b| b.get("id") == h.get("id")).and_then(|b| s(b, "output"));
            if let (Some(was), Some(now)) = (was, s(h, "output")) {
                if was != now {
                    (self.relocated)(was, now);
                }
            }
        }
        let mut loose = 0;
        let kept: Vec<Record> = items
            .into_iter()
            .filter(|h| {
                if s(h, "projectId").is_some() { return true; }
                loose += 1;
                loose <= LOOSE_KEEP
            })
            .collect();
        let _ = write_json(&self.data_dir.join("history.json"), &kept, true);
        (self.changed)();
    }
    fn load_projects(&self) -> Vec<Record> {
        self.read("projects.json")
    }
    fn save_projects(&self, items: &[Record]) {
        let _ = write_json(&self.data_dir.join("projects.json"), &items, true);
        (self.changed)();
    }

    // ---------- notebooks ----------
    pub fn history(&self) -> Vec<Record> {
        let _g = self.lock.lock().unwrap();
        let ids: Vec<String> = self.load_projects().iter().filter_map(|p| s(p, "id").map(String::from)).collect();
        self.load_history()
            .into_iter()
            .map(|mut h| {
                let pid = s(&h, "projectId").map(String::from);
                match pid {
                    Some(p) if ids.contains(&p) => {}
                    _ => { h.remove("projectId"); }
                }
                let ex = exists(s(&h, "output"));
                h.insert("exists".into(), Value::Bool(ex));
                h
            })
            .collect()
    }

    pub fn add_history(&self, mut item: Record) {
        let _g = self.lock.lock().unwrap();
        if let Some(pid) = s(&item, "projectId").map(String::from) {
            if self.find_project(&pid).is_none() {
                item.remove("projectId");
            }
        }
        let id = item.get("id").cloned();
        let mut all = vec![item];
        all.extend(self.load_history().into_iter().filter(|h| h.get("id") != id.as_ref()));
        self.save_history(all);
    }

    pub fn remove_history(&self, id: &str) {
        let _g = self.lock.lock().unwrap();
        let all = self.load_history().into_iter().filter(|h| s(h, "id") != Some(id)).collect();
        self.save_history(all);
    }

    fn notebook(&self, id: &str) -> Result<(Vec<Record>, usize), LibraryError> {
        let all = self.load_history();
        let i = all.iter().position(|h| s(h, "id") == Some(id)).ok_or(LibraryError::NotFound)?;
        Ok((all, i))
    }

    /// New name: the title, and — when the notebook is in its own folder — the folder, the file and the page title.
    pub fn rename_notebook(&self, id: &str, title: &str) -> Result<Record, LibraryError> {
        let _g = self.lock.lock().unwrap();
        let title = title.trim();
        let (mut all, i) = self.notebook(id)?;
        let old_title = s(&all[i], "title").unwrap_or("").to_string();
        if title.is_empty() || title == old_title {
            return Ok(all.swap_remove(i));
        }
        if let Some(out) = s(&all[i], "output").map(PathBuf::from).filter(|p| p.exists()) {
            let html = std::fs::read_to_string(&out)?;
            let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
            std::fs::write(&out, html.replace(&format!("<title>{}</title>", esc(&old_title)), &format!("<title>{}</title>", esc(title))))?;
            if in_own_folder(&out) {
                let folder = out.parent().unwrap().to_path_buf();
                let parent = folder.parent().unwrap().to_path_buf();
                let name = free_name(&parent, &safe_name(title, "so-tay"), Some(&folder));
                if name != basename(&folder, "") {
                    let file = folder.join(format!("{name}.html"));
                    move_path(&out, &file)?;
                    let to = parent.join(&name);
                    move_path(&folder, &to)?;
                    all[i].insert("output".into(), json!(path_str(&to.join(format!("{name}.html")))));
                }
            }
        }
        all[i].insert("title".into(), json!(title));
        let h = all[i].clone();
        self.save_history(all);
        Ok(h)
    }

    /// Into a project: its folder moves into the project's folder. Out of a project: the files stay where they are.
    pub fn move_notebook(&self, id: &str, project_id: Option<&str>) -> Result<Record, LibraryError> {
        let _g = self.lock.lock().unwrap();
        let (mut all, i) = self.notebook(id)?;
        if s(&all[i], "projectId") == project_id {
            return Ok(all.swap_remove(i));
        }
        match project_id {
            Some(pid) => {
                let p = self.find_project(pid).ok_or(LibraryError::NotFound)?;
                let pdir = PathBuf::from(s(&p, "dir").unwrap_or(""));
                if let Some(out) = s(&all[i], "output").map(PathBuf::from).filter(|p| p.exists()) {
                    std::fs::create_dir_all(&pdir)?;
                    if in_own_folder(&out) {
                        let folder = out.parent().unwrap();
                        let name = free_name(&pdir, &basename(folder, ""), None);
                        move_path(folder, &pdir.join(&name))?;
                        let file = pdir.join(&name).join(out.file_name().unwrap());
                        let to = pdir.join(&name).join(format!("{name}.html"));
                        if file != to {
                            move_path(&file, &to)?;
                        }
                        all[i].insert("output".into(), json!(path_str(&to)));
                    } else {
                        // A notebook from before 0.1.1 (a bare .html next to its sources) gets a folder of its own.
                        let name = free_name(&pdir, &safe_name(s(&all[i], "title").unwrap_or(""), "so-tay"), None);
                        std::fs::create_dir(pdir.join(&name))?;
                        let to = pdir.join(&name).join(format!("{name}.html"));
                        move_path(&out, &to)?;
                        all[i].insert("output".into(), json!(path_str(&to)));
                    }
                }
                all[i].insert("projectId".into(), json!(pid));
            }
            None => {
                all[i].remove("projectId");
            }
        }
        let h = all[i].clone();
        self.save_history(all);
        Ok(h)
    }

    /// Replace the notebook's tags: trimmed, "#" dropped, spaces collapsed, duplicates (any case) once.
    pub fn tag_notebook(&self, id: &str, tags: &[String]) -> Result<Record, LibraryError> {
        let _g = self.lock.lock().unwrap();
        let (mut all, i) = self.notebook(id)?;
        let mut seen: Vec<String> = vec![];
        let mut out: Vec<String> = vec![];
        for raw in tags {
            let collapsed = raw.split(|c: char| c.is_whitespace() || c == ',').filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ");
            let no_hash = collapsed.trim().trim_start_matches('#').trim_start();
            let tag = crate::util::js_slice(no_hash, TAG_LEN).trim().to_string();
            if tag.is_empty() || seen.contains(&tag.to_lowercase()) || out.len() >= TAGS_MAX {
                continue;
            }
            seen.push(tag.to_lowercase());
            out.push(tag);
        }
        if out.is_empty() {
            all[i].remove("tags");
        } else {
            all[i].insert("tags".into(), json!(out));
        }
        let h = all[i].clone();
        self.save_history(all);
        Ok(h)
    }

    /// Off the list; with `trash`, its folder (or file) also goes to the Trash.
    pub fn delete_notebook(&self, id: &str, trash: bool) -> Result<(), LibraryError> {
        let _g = self.lock.lock().unwrap();
        let (all, i) = self.notebook(id)?;
        if trash {
            if let Some(out) = s(&all[i], "output").map(PathBuf::from).filter(|p| p.exists()) {
                let target = if in_own_folder(&out) { out.parent().unwrap().to_path_buf() } else { out };
                trash::delete(&target).map_err(|e| LibraryError::Io(e.to_string()))?;
            }
        }
        let rest = self.load_history().into_iter().filter(|h| s(h, "id") != Some(id)).collect();
        self.save_history(rest);
        Ok(())
    }

    // ---------- projects ----------
    pub fn projects(&self) -> Vec<Record> {
        let _g = self.lock.lock().unwrap();
        self.load_projects()
            .into_iter()
            .map(|mut p| {
                let ex = exists(s(&p, "dir"));
                p.insert("exists".into(), Value::Bool(ex));
                p
            })
            .collect()
    }

    fn find_project(&self, id: &str) -> Option<Record> {
        self.load_projects().into_iter().find(|p| s(p, "id") == Some(id))
    }

    pub fn project(&self, id: &str) -> Option<Record> {
        let _g = self.lock.lock().unwrap();
        self.find_project(id)
    }

    pub fn create_project(&self, name: &str, color: Option<&str>, parent: &Path) -> Result<Record, LibraryError> {
        let _g = self.lock.lock().unwrap();
        let name = name.trim();
        if name.is_empty() {
            return Err(LibraryError::Missing);
        }
        let mut all = self.load_projects();
        if all.iter().any(|p| s(p, "name").map(str::to_lowercase) == Some(name.to_lowercase())) {
            return Err(LibraryError::Exists);
        }
        std::fs::create_dir_all(parent)?;
        let dir = parent.join(free_name(parent, &safe_name(name, "Project"), None));
        std::fs::create_dir(&dir)?;
        let now = now_ms();
        let color = match color {
            Some(c) if COLORS.contains(&c) => c,
            _ => COLORS[all.len() % COLORS.len()],
        };
        let p = json!({ "id": rand_hex(5), "name": name, "dir": path_str(&dir), "color": color, "createdAt": now, "updatedAt": now });
        let Value::Object(p) = p else { unreachable!() };
        all.insert(0, p.clone());
        self.save_projects(&all);
        Ok(p)
    }

    /// Rename (and recolor). The folder follows the new name when it still has the old one.
    pub fn update_project(&self, id: &str, name: Option<&str>, color: Option<&str>) -> Result<Record, LibraryError> {
        let _g = self.lock.lock().unwrap();
        let mut all = self.load_projects();
        let i = all.iter().position(|p| s(p, "id") == Some(id)).ok_or(LibraryError::NotFound)?;
        let name = name.map(str::trim).filter(|n| !n.is_empty());
        let old_name = s(&all[i], "name").unwrap_or("").to_string();
        if let Some(name) = name.filter(|n| *n != old_name) {
            if all.iter().enumerate().any(|(j, x)| j != i && s(x, "name").map(str::to_lowercase) == Some(name.to_lowercase())) {
                return Err(LibraryError::Exists);
            }
            let dir = PathBuf::from(s(&all[i], "dir").unwrap_or(""));
            let parent = dir.parent().map(Path::to_path_buf).unwrap_or_default();
            if dir.exists() && basename(&dir, "") == safe_name(&old_name, "Project") {
                let to = parent.join(free_name(&parent, &safe_name(name, "Project"), Some(&dir)));
                if to != dir {
                    move_path(&dir, &to)?;
                    let (from_s, to_s) = (path_str(&dir), path_str(&to));
                    let mut hist = self.load_history();
                    for h in hist.iter_mut() {
                        if let Some(out) = s(h, "output").map(String::from) {
                            if format!("{out}{MAIN_SEPARATOR_STR}").starts_with(&format!("{from_s}{MAIN_SEPARATOR_STR}")) {
                                h.insert("output".into(), json!(format!("{to_s}{}", &out[from_s.len()..])));
                            }
                        }
                    }
                    self.save_history(hist);
                    all[i].insert("dir".into(), json!(to_s));
                }
            }
            all[i].insert("name".into(), json!(name));
        }
        if let Some(c) = color.filter(|c| COLORS.contains(c)) {
            all[i].insert("color".into(), json!(c));
        }
        all[i].insert("updatedAt".into(), json!(now_ms()));
        let p = all[i].clone();
        self.save_projects(&all);
        Ok(p)
    }

    /// Remove a project. Keep its files: its notebooks become loose. `trash`: folder to the Trash, notebooks off the list.
    pub fn remove_project(&self, id: &str, trash: bool) -> Result<(), LibraryError> {
        let _g = self.lock.lock().unwrap();
        let Some(p) = self.find_project(id) else { return Ok(()) };
        if trash {
            if let Some(dir) = s(&p, "dir").map(PathBuf::from).filter(|d| d.exists()) {
                trash::delete(&dir).map_err(|e| LibraryError::Io(e.to_string()))?;
            }
        }
        let mut hist: Vec<Record> = self.load_history().into_iter().filter(|h| !(trash && s(h, "projectId") == Some(id))).collect();
        for h in hist.iter_mut() {
            if s(h, "projectId") == Some(id) {
                h.remove("projectId");
            }
        }
        let rest: Vec<Record> = self.load_projects().into_iter().filter(|x| s(x, "id") != Some(id)).collect();
        self.save_projects(&rest);
        self.save_history(hist);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as M};

    fn lib(dir: &Path) -> (Library, Arc<M<Vec<(String, String)>>>) {
        let moves = Arc::new(M::new(vec![]));
        let m2 = moves.clone();
        let l = Library::new(dir.join("data"), Box::new(|| {}), Box::new(move |a, b| m2.lock().unwrap().push((a.into(), b.into()))));
        (l, moves)
    }

    fn notebook(dir: &Path, name: &str, title: &str) -> String {
        let d = dir.join(name);
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join(format!("{name}.html"));
        std::fs::write(&f, format!("<title>{title}</title><body>x</body>")).unwrap();
        path_str(&f)
    }

    fn rec(v: Value) -> Record {
        let Value::Object(o) = v else { panic!() };
        o
    }

    #[test]
    fn projects_and_notebooks_move_together() {
        let t = tempfile::tempdir().unwrap();
        let (l, moves) = lib(t.path());
        let root = t.path().join("Projects");
        let p = l.create_project("System Design", None, &root).unwrap();
        assert_eq!(s(&p, "color"), Some(COLORS[0]));
        assert!(root.join("System Design").is_dir());
        assert_eq!(l.create_project("system design", None, &root).unwrap_err(), LibraryError::Exists);
        assert_eq!(l.create_project("  ", None, &root).unwrap_err(), LibraryError::Missing);

        let out = notebook(&t.path().join("Downloads"), "Kafka", "Kafka");
        l.add_history(rec(json!({ "id": "r1-a", "status": "done", "title": "Kafka", "files": [], "output": out })));
        let pid = s(&p, "id").unwrap().to_string();
        let h = l.move_notebook("r1-a", Some(&pid)).unwrap();
        let moved = root.join("System Design").join("Kafka").join("Kafka.html");
        assert_eq!(s(&h, "output"), Some(path_str(&moved).as_str()));
        assert!(moved.exists());
        assert_eq!(moves.lock().unwrap().len(), 1);

        // rename the notebook: page title, file and folder follow
        let h = l.rename_notebook("r1-a", "Kafka <Deep> Dive").unwrap();
        let renamed = root.join("System Design").join("Kafka Deep Dive").join("Kafka Deep Dive.html");
        assert_eq!(s(&h, "output"), Some(path_str(&renamed).as_str()));
        assert!(std::fs::read_to_string(&renamed).unwrap().contains("<title>Kafka &lt;Deep&gt; Dive</title>"));

        // rename the project: its folder and the notebook paths follow
        l.update_project(&pid, Some("Distributed"), Some("#FF375F")).unwrap();
        let now = l.history();
        let out = s(&now[0], "output").unwrap();
        assert!(out.contains(&format!("Distributed{MAIN_SEPARATOR_STR}Kafka Deep Dive")), "{out}");
        assert_eq!(now[0].get("exists"), Some(&Value::Bool(true)));
        assert_eq!(s(&l.projects()[0], "color"), Some("#FF375F"));

        // tags: cleaned, deduplicated
        let h = l.tag_notebook("r1-a", &["#Redis".into(), " redis ".into(), "Thi   cuối,kỳ".into(), "".into()]).unwrap();
        assert_eq!(h.get("tags"), Some(&json!(["Redis", "Thi cuối kỳ"])));

        // remove the project but keep files: the notebook becomes loose
        l.remove_project(&pid, false).unwrap();
        assert!(l.projects().is_empty());
        assert!(l.history()[0].get("projectId").is_none());
        assert_eq!(l.move_notebook("nope", None).unwrap_err(), LibraryError::NotFound);
    }

    #[test]
    fn loose_notebooks_are_capped() {
        let t = tempfile::tempdir().unwrap();
        let (l, _) = lib(t.path());
        for i in 0..205 {
            l.add_history(rec(json!({ "id": format!("n{i}"), "title": "x", "files": [] })));
        }
        assert_eq!(l.history().len(), 200);
        assert_eq!(s(&l.history()[0], "id"), Some("n204"));
    }
}
