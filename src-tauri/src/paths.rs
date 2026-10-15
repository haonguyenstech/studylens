// File and folder names for notebooks and projects.
use crate::util::js_slice;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// A title made safe as a file/folder name on macOS and Windows.
pub fn safe_name(title: &str, fallback: &str) -> String {
    static BAD: OnceLock<Regex> = OnceLock::new();
    static SPACE: OnceLock<Regex> = OnceLock::new();
    let s = BAD.get_or_init(|| Regex::new(r#"[\\/:*?"<>|]+"#).unwrap()).replace_all(title, " ");
    let s = SPACE.get_or_init(|| Regex::new(r"\s+").unwrap()).replace_all(&s, " ");
    let s = js_slice(s.trim(), 80).trim().trim_end_matches(['.', ' ']);
    if s.is_empty() { fallback.to_string() } else { s.to_string() }
}

/// "<name>", or "<name> (2)", "<name> (3)"… — the first that is not taken in `dir`.
/// `except`: a path that may keep its name (the item being renamed).
pub fn free_name(dir: &Path, name: &str, except: Option<&Path>) -> String {
    let except = except.map(|p| p.to_string_lossy().to_lowercase());
    let mut n = name.to_string();
    let mut i = 2;
    loop {
        let p = dir.join(&n);
        if !p.exists() || except.as_deref() == Some(p.to_string_lossy().to_lowercase().as_str()) {
            return n;
        }
        n = format!("{name} ({i})");
        i += 1;
    }
}

/// path.basename(p, ext): the last part, without `ext` when it ends with it.
pub fn basename(p: &Path, ext: &str) -> String {
    let b = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    match b.strip_suffix(ext) {
        Some(stem) if !ext.is_empty() && !stem.is_empty() => stem.to_string(),
        _ => b,
    }
}

/// path.extname(p): ".pdf", or "" (also for ".bashrc").
pub fn extname(p: &Path) -> String {
    let b = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    match b.rfind('.') {
        Some(i) if i > 0 => b[i..].to_string(),
        _ => String::new(),
    }
}

/// The notebook lives in its own folder (<name>/<name>.html), as every notebook since 0.1.1 does.
pub fn in_own_folder(output: &Path) -> bool {
    let folder = output.parent().map(|d| basename(d, "")).unwrap_or_default();
    folder == basename(output, ".html")
}

/// rename, or copy + delete when crossing volumes.
pub fn move_path(from: &Path, to: &Path) -> std::io::Result<()> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            copy_all(from, to)?;
            if from.is_dir() { std::fs::remove_dir_all(from) } else { std::fs::remove_file(from) }
        }
        Err(e) => Err(e),
    }
}

fn is_cross_device(e: &std::io::Error) -> bool {
    // EXDEV (18) on macOS/Linux, ERROR_NOT_SAME_DEVICE (17) on Windows
    matches!(e.raw_os_error(), Some(18) if cfg!(unix)) || matches!(e.raw_os_error(), Some(17) if cfg!(windows))
}

pub fn copy_all(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_all(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to).map(|_| ())
    }
}

/// path.resolve(p) without touching the disk: absolute, "." and ".." folded.
pub fn resolve(p: &Path) -> PathBuf {
    let abs = if p.is_absolute() { p.to_path_buf() } else { std::env::current_dir().unwrap_or_default().join(p) };
    let mut out = PathBuf::new();
    for c in abs.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => { out.pop(); }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(safe_name("  a/b: c?  ", "x"), "a b c");
        assert_eq!(safe_name("Notes...", "x"), "Notes");
        assert_eq!(safe_name("???", "so-tay"), "so-tay");
        assert_eq!(safe_name(&"é".repeat(100), "x").chars().count(), 80);
        assert_eq!(extname(Path::new("/a/b.tar.GZ")), ".GZ");
        assert_eq!(extname(Path::new("/a/.bashrc")), "");
        assert_eq!(basename(Path::new("/a/Week 1.html"), ".html"), "Week 1");
        assert!(in_own_folder(Path::new("/p/Kafka/Kafka.html")));
        assert!(!in_own_folder(Path::new("/p/Downloads/Kafka.html")));
    }

    #[test]
    fn free_names() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir(d.path().join("A")).unwrap();
        std::fs::create_dir(d.path().join("A (2)")).unwrap();
        assert_eq!(free_name(d.path(), "A", None), "A (3)");
        assert_eq!(free_name(d.path(), "A", Some(&d.path().join("a"))), "A");
        assert_eq!(free_name(d.path(), "B", None), "B");
    }
}
