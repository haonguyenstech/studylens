// In-app preview: notebooks and source files are served under their own origin (slpreview), not the
// app's, and only what the library knows: a notebook's folder (or its file) and the notebooks' source files.
use crate::library::{s, Record};
use crate::paths::{in_own_folder, resolve};
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use std::path::{Path, PathBuf};
use tauri::http::{header, Response, StatusCode};

pub const SCHEME: &str = "slpreview";

pub fn previewable(p: &Path, history: &[Record]) -> bool {
    let want = resolve(p);
    let ci = !cfg!(target_os = "linux");
    let norm = |x: &Path| {
        let s = x.to_string_lossy().into_owned();
        if ci { s.to_lowercase() } else { s }
    };
    let want_s = norm(&want);
    let same = |b: &str| want_s == norm(&resolve(Path::new(b)));
    let inside = |dir: &Path| want_s.starts_with(&format!("{}{}", norm(&resolve(dir)), std::path::MAIN_SEPARATOR));
    history.iter().any(|h| {
        let out_ok = s(h, "output").is_some_and(|o| {
            let o = Path::new(o);
            if in_own_folder(o) { inside(o.parent().unwrap()) } else { same(&o.to_string_lossy()) }
        });
        out_ok || h.get("files").and_then(|f| f.as_array()).is_some_and(|fs| fs.iter().filter_map(|f| f.as_str()).any(same))
    })
}

// Like a file: URL's path: letters, digits and -._~/: kept, the rest percent-encoded.
const PATH: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'.').remove(b'_').remove(b'~').remove(b'/').remove(b':');

/// The URL the preview frame loads for `p`. Windows' WebView2 reaches custom schemes as http://<scheme>.localhost.
pub fn url(p: &Path) -> String {
    let mut path = p.to_string_lossy().replace('\\', "/");
    if !path.starts_with('/') {
        path.insert(0, '/');
    }
    let enc = utf8_percent_encode(&path, PATH).to_string();
    if cfg!(windows) { format!("http://{SCHEME}.localhost{enc}") } else { format!("{SCHEME}://f{enc}") }
}

/// The file a request asks for.
pub fn file_of(uri_path: &str) -> PathBuf {
    let decoded = percent_decode_str(uri_path).decode_utf8_lossy().into_owned();
    if cfg!(windows) { PathBuf::from(decoded.trim_start_matches('/').replace('/', "\\")) } else { PathBuf::from(decoded) }
}

fn mime(p: &Path) -> &'static str {
    match crate::paths::extname(p).to_lowercase().as_str() {
        ".html" | ".htm" => "text/html; charset=utf-8",
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".css" => "text/css; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".txt" | ".md" | ".markdown" | ".csv" | ".json" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

// Links followed inside a previewed page open in the browser instead of replacing the preview
// (the page asks the app window, which owns the "open in browser" call).
const LINKS: &str = "<script>(()=>{document.addEventListener('click',e=>{const a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;const u=a.href;if(!/^(https?:|mailto:)/i.test(u)||u.startsWith(location.origin))return;e.preventDefault();parent.postMessage({studylensOpen:u},'*')},true)})()</script>";

pub fn respond(file: &Path, allowed: bool) -> Response<Vec<u8>> {
    let not_found = || Response::builder().status(StatusCode::NOT_FOUND).header(header::CONTENT_TYPE, "text/plain").body(b"Not found".to_vec()).unwrap();
    if !allowed || !file.is_file() {
        return not_found();
    }
    let Ok(mut body) = std::fs::read(file) else { return not_found() };
    let ty = mime(file);
    if ty.starts_with("text/html") {
        body.extend_from_slice(LINKS.as_bytes());
    }
    Response::builder().header(header::CONTENT_TYPE, ty).header(header::CACHE_CONTROL, "no-store").body(body).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn urls_round_trip() {
        let p = if cfg!(windows) { PathBuf::from(r"C:\Users\x\Sổ tay #1.html") } else { PathBuf::from("/Users/x/Sổ tay #1.html") };
        let u = url(&p);
        assert!(!u.contains(' ') && !u.contains('#'), "{u}");
        let path = u.split_once(".localhost").map(|x| x.1).or_else(|| u.strip_prefix("slpreview://f")).unwrap();
        assert_eq!(file_of(path), p);
    }

    #[test]
    fn only_library_files() {
        let d = tempfile::tempdir().unwrap();
        let nb = d.path().join("Kafka").join("Kafka.html");
        let src = d.path().join("src.pdf");
        let h = json!({ "output": nb.to_string_lossy(), "files": [src.to_string_lossy()] }).as_object().unwrap().clone();
        let hist = vec![h];
        assert!(previewable(&nb, &hist));
        assert!(previewable(&d.path().join("Kafka").join("img").join("a.png"), &hist));
        assert!(previewable(&src, &hist));
        assert!(!previewable(&d.path().join("other.pdf"), &hist));
        assert!(!previewable(&d.path().join("Kafka").join("..").join("other.pdf"), &hist));
    }
}
