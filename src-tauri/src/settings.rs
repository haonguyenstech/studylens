// settings.json in the data folder. Kept as a JSON object so fields from any version survive.
use crate::util::{read_json, write_json};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

pub type Settings = Map<String, Value>;

fn defaults() -> Settings {
    let Value::Object(d) = json!({ "claudePath": "", "model": "", "research": true, "lang": "Tiếng Việt", "outputDir": "", "uiLang": "" }) else { unreachable!() };
    d
}

pub fn load(data_dir: &Path) -> Settings {
    let mut s = defaults();
    if let Some(saved) = read_json::<Settings>(&data_dir.join("settings.json")) {
        s.extend(saved);
    }
    s
}

pub fn save(data_dir: &Path, patch: Settings) -> Settings {
    let mut s = load(data_dir);
    s.extend(patch);
    let _ = write_json(&data_dir.join("settings.json"), &s, true);
    s
}

pub fn get<'a>(s: &'a Settings, k: &str) -> &'a str {
    s.get(k).and_then(Value::as_str).unwrap_or("")
}

/// UI language: what the user picked, else the system language (Vietnamese system → vi, anything else → en).
pub fn ui_lang(s: &Settings) -> &'static str {
    match get(s, "uiLang") {
        "vi" => "vi",
        "en" => "en",
        _ => {
            let sys = sys_locale::get_locale().unwrap_or_default().to_lowercase();
            if sys.starts_with("vi") { "vi" } else { "en" }
        }
    }
}

/// The settings as the window sees them: uiLang always resolved.
pub fn for_window(mut s: Settings) -> Settings {
    let l = ui_lang(&s);
    s.insert("uiLang".into(), json!(l));
    s
}

/// Where new project folders go: the user's pick, else ~/Documents/StudyLens.
pub fn projects_root(s: &Settings) -> PathBuf {
    match get(s, "projectsRoot") {
        "" => dirs::document_dir().or_else(dirs::home_dir).unwrap_or_default().join("StudyLens"),
        p => PathBuf::from(p),
    }
}
