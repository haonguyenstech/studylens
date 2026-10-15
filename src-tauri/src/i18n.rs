// Strings shown to the user (log lines, errors, dialogs), in the UI language. Same texts as the
// engine's: both read src/shared/strings.json. Text written for Claude (GUIDE.md, prompts) is not here.
use serde_json::{Map, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

static STRINGS: &str = include_str!("../../src/shared/strings.json");
static EN: AtomicBool = AtomicBool::new(false);

fn dict(en: bool) -> &'static Map<String, Value> {
    static D: OnceLock<(Map<String, Value>, Map<String, Value>)> = OnceLock::new();
    let (vi, en_d) = D.get_or_init(|| {
        let mut all: Map<String, Value> = serde_json::from_str(STRINGS).expect("strings.json");
        let take = |m: &mut Map<String, Value>, k: &str| match m.remove(k) {
            Some(Value::Object(o)) => o,
            _ => Map::new(),
        };
        (take(&mut all, "vi"), take(&mut all, "en"))
    });
    if en { en_d } else { vi }
}

pub fn set_lang(lang: &str) {
    EN.store(lang == "en", Ordering::Relaxed);
}

pub fn lang() -> &'static str {
    if EN.load(Ordering::Relaxed) { "en" } else { "vi" }
}

pub fn is_en() -> bool {
    EN.load(Ordering::Relaxed)
}

/// The text for `key` with {name} placeholders filled; an unknown key comes back as itself.
pub fn t(key: &str, vars: &[(&str, &str)]) -> String {
    let text = dict(is_en()).get(key).and_then(Value::as_str).unwrap_or(key);
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) if after[..close].chars().all(|c| c.is_alphanumeric() || c == '_') && close > 0 => {
                let name = &after[..close];
                match vars.iter().find(|(k, _)| *k == name) {
                    Some((_, v)) => out.push_str(v),
                    None => { out.push('{'); out.push_str(name); out.push('}'); }
                }
                rest = &after[close + 1..];
            }
            _ => { out.push('{'); rest = after; }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_placeholders_in_both_languages() {
        set_lang("vi");
        assert_eq!(t("job.missing", &[("files", "a.pdf")]), "Không thấy file: a.pdf");
        assert_eq!(t("stage.fix", &[("n", "2"), ("round", "1")]), "Sửa 2 lỗi (lần 1/{max})");
        set_lang("en");
        assert!(t("job.missing", &[("files", "a.pdf")]).ends_with("a.pdf"));
        assert_eq!(t("no.such.key", &[]), "no.such.key");
        set_lang("vi");
        // every key has both languages
        assert_eq!(dict(false).len(), dict(true).len());
    }
}
