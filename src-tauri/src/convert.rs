// Get the input files ready for Claude: PDF/images/text are copied as they are; DOCX/PPTX/XLSX are
// copied too, with their text (made by the engine) and their embedded images next to them.
use crate::engine::Engine;
use crate::i18n::{lang, t};
use crate::paths::{basename, extname};
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const DIRECT: [&str; 13] = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".md", ".markdown", ".txt", ".html", ".htm", ".csv", ".json"];
pub const OFFICE: [&str; 3] = [".docx", ".pptx", ".xlsx"];

pub fn accepted(ext: &str) -> bool {
    DIRECT.contains(&ext) || OFFICE.contains(&ext)
}

pub struct Prepared {
    pub note: String, // a short description for the prompt
}

#[derive(Deserialize)]
struct OfficeText {
    md: String,
    chars: String,
}

/// A safe file name, distinct for each input: "01-Week_3_lecture".
fn slot(i: usize, file: &Path) -> (String, String) {
    static BAD: OnceLock<Regex> = OnceLock::new();
    let ext = extname(file).to_lowercase();
    let stem = basename(file, &extname(file));
    let base = BAD.get_or_init(|| Regex::new(r"[^\p{L}\p{N}._-]+").unwrap()).replace_all(&stem, "_");
    let base = crate::util::js_slice(&base, 60);
    let base = if base.is_empty() { "file" } else { base };
    (format!("{:02}-{base}", i + 1), ext)
}

fn rel(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

pub async fn prepare_inputs(files: &[String], work_dir: &Path, engine: &Engine, log: &(dyn Fn(String) + Sync)) -> Result<Vec<Prepared>, String> {
    for d in ["input", "input-text", "input-media"] {
        std::fs::create_dir_all(work_dir.join(d)).map_err(|e| e.to_string())?;
    }
    let mut out = vec![];
    for (i, f) in files.iter().enumerate() {
        let src = Path::new(f);
        let (name, ext) = slot(i, src);
        if !accepted(&ext) {
            return Err(t("conv.unsupported", &[("ext", &ext), ("name", &basename(src, ""))]));
        }
        let copied = Path::new("input").join(format!("{name}{ext}"));
        std::fs::copy(src, work_dir.join(&copied)).map_err(|e| e.to_string())?;
        if OFFICE.contains(&ext.as_str()) {
            let full = work_dir.join(&copied);
            engine.allow_read([full.clone()]);
            let text: OfficeText = engine.call("officeText", json!({ "path": rel(&full), "ext": ext, "uiLang": lang() })).await?;
            let text_rel = Path::new("input-text").join(format!("{name}.md"));
            std::fs::write(work_dir.join(&text_rel), format!("# {}\n\n{}", basename(src, ""), text.md)).map_err(|e| e.to_string())?;
            let media = extract_media(src, &work_dir.join("input-media").join(&name)).unwrap_or_default();
            log(t("conv.extracted", &[("name", &basename(src, "")), ("chars", &text.chars), ("images", &media.to_string())]));
            let imgs = if media > 0 { format!(", ảnh ở input-media/{name}/") } else { String::new() };
            out.push(Prepared { note: format!("{} (đã trích text ở {}{imgs})", rel(&copied), rel(&text_rel)) });
        } else {
            out.push(Prepared { note: rel(&copied) });
        }
    }
    Ok(out)
}

/// The images inside an Office file (…/media/*.png|jpg|gif|webp) into `dir`; how many.
fn extract_media(file: &Path, dir: &PathBuf) -> std::io::Result<usize> {
    static MEDIA: OnceLock<Regex> = OnceLock::new();
    let re = MEDIA.get_or_init(|| Regex::new(r"(?i)/media/[^/]+\.(png|jpe?g|gif|webp)$").unwrap());
    let mut zip = zip::ZipArchive::new(std::fs::File::open(file)?).map_err(std::io::Error::other)?;
    let mut n = 0;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(std::io::Error::other)?;
        let name = entry.name().to_string();
        if !re.is_match(&name) {
            continue;
        }
        if n == 0 {
            std::fs::create_dir_all(dir)?;
        }
        let mut buf = vec![];
        entry.read_to_end(&mut buf)?;
        let base = name.rsplit('/').next().unwrap_or(&name);
        std::fs::write(dir.join(base), buf)?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slots() {
        assert_eq!(slot(0, Path::new("/a/Week 3 lecture.PPTX")), ("01-Week_3_lecture".into(), ".pptx".into()));
        assert_eq!(slot(9, Path::new("/a/Sổ tay (v2).pdf")), ("10-Sổ_tay_v2_".into(), ".pdf".into()));
        assert_eq!(slot(1, Path::new("/a/!!!.txt")), ("02-_".into(), ".txt".into()));
    }
}
