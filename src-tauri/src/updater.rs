// Self-update from this repo's GitHub Releases (public).
// - check: GitHub "latest release" API, no token needed; compares tag vX.Y.Z with the app's version
// - macOS: the build is not code-signed, so the system updater can't be used. We download the .zip for
//   this chip, check its sha256 against the asset digest, unpack it with ditto, and a detached shell
//   script swaps the .app bundle after we quit, then reopens it.
// - Windows: download the installer and run it silently after we quit (/S, /R = start the app again).
// The asset names are the ones the Electron versions (≤ 0.2) look for too, so they update into this.
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

pub const RELEASES_REPO: &str = "haonguyenstech/studylens";

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<String>,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>, // release page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    published_at: String,
    assets: Vec<Asset>,
}

static LAST: Mutex<Option<(String, Vec<Asset>)>> = Mutex::new(None);

/// "1.2.10" > "1.2.9"; pre-release suffixes are ignored.
pub fn newer(a: &str, b: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v').split('-').next().unwrap_or("").split('.').map(|x| x.parse().unwrap_or(0)).collect()
    };
    let (pa, pb) = (parts(a), parts(b));
    for i in 0..3 {
        let (x, y) = (pa.get(i).copied().unwrap_or(0), pb.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().user_agent("StudyLens").timeout_connect(std::time::Duration::from_secs(20)).build()
}

/// Blocking: call from a worker thread.
pub fn check(current: &str) -> UpdateInfo {
    let base = UpdateInfo { current: current.into(), ..Default::default() };
    let url = format!("https://api.github.com/repos/{RELEASES_REPO}/releases/latest");
    let res = agent().get(&url).set("Accept", "application/vnd.github+json").call();
    let r: Release = match res {
        Ok(r) => match r.into_json() {
            Ok(r) => r,
            Err(e) => return UpdateInfo { error: Some(e.to_string()), ..base },
        },
        Err(ureq::Error::Status(404, _)) => return base, // nothing published yet
        Err(ureq::Error::Status(code, _)) => return UpdateInfo { error: Some(format!("GitHub {code}")), ..base },
        Err(e) => return UpdateInfo { error: Some(e.to_string()), ..base },
    };
    let latest = r.tag_name.trim_start_matches('v').to_string();
    let available = newer(&latest, current) && pick_asset(&r.assets).is_some();
    *LAST.lock().unwrap() = Some((r.tag_name.clone(), r.assets));
    UpdateInfo { latest: Some(latest), available, notes: Some(r.body.unwrap_or_default()), url: Some(r.html_url), published_at: Some(r.published_at), ..base }
}

fn pick_asset(assets: &[Asset]) -> Option<&Asset> {
    if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
        assets.iter().find(|a| a.name.ends_with(&format!("-mac-{arch}.zip")))
    } else if cfg!(windows) {
        let re = Regex::new(r"(?i)Setup.*\.exe$").unwrap();
        assets.iter().find(|a| re.is_match(&a.name))
    } else {
        None
    }
}

#[derive(Serialize, Clone)]
pub struct Progress {
    pub phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub received: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
}

fn download(a: &Asset, to: &Path, on_progress: &dyn Fn(Progress)) -> Result<(), String> {
    let res = agent().get(&a.browser_download_url).call().map_err(|e| format!("download: {e}"))?;
    let total = res.header("content-length").and_then(|v| v.parse().ok()).unwrap_or(a.size);
    let mut reader = res.into_reader();
    let mut out = std::fs::File::create(to).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let (mut received, mut last) = (0u64, std::time::Instant::now());
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        received += n as u64;
        if last.elapsed().as_millis() > 150 {
            last = std::time::Instant::now();
            on_progress(Progress { phase: "download", received: Some(received), total: Some(total) });
        }
    }
    out.flush().map_err(|e| e.to_string())?;
    on_progress(Progress { phase: "verify", received: Some(received), total: Some(total) });
    let sha: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if let Some(d) = a.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        if d != sha {
            return Err("checksum mismatch".into());
        }
    }
    if a.size > 0 && received != a.size {
        return Err("incomplete download".into());
    }
    Ok(())
}

/// Download and stage the update; a helper finishes the install after the app quits and reopens it.
/// Blocking. The caller quits the app when this returns Ok. `relaunch: false` is for tests (install only).
pub fn install(current: &str, on_progress: &dyn Fn(Progress), relaunch: bool) -> Result<(), String> {
    if LAST.lock().unwrap().is_none() {
        let info = check(current);
        if !info.available {
            return Err(info.error.unwrap_or_else(|| "no update".into()));
        }
    }
    let (tag, assets) = LAST.lock().unwrap().clone().unwrap();
    let asset = pick_asset(&assets).ok_or("no installer for this platform")?.clone();
    let dir = std::env::temp_dir().join("studylens-update").join(&tag);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(&asset.name);
    download(&asset, &file, on_progress)?;
    on_progress(Progress { phase: "install", received: None, total: None });

    #[cfg(target_os = "macos")]
    {
        let unpacked = dir.join("app");
        std::fs::create_dir_all(&unpacked).map_err(|e| e.to_string())?;
        let ok = std::process::Command::new("ditto").args(["-x", "-k"]).arg(&file).arg(&unpacked).status().map_err(|e| e.to_string())?;
        if !ok.success() {
            return Err(format!("ditto exited {}", ok.code().unwrap_or(-1)));
        }
        let name = std::fs::read_dir(&unpacked).map_err(|e| e.to_string())?.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).find(|n| n.ends_with(".app")).ok_or("no .app in the update")?;
        let target = current_bundle().ok_or("not running from an .app bundle")?;
        let target = target.to_string_lossy();
        let new_app = unpacked.join(name);
        // Wait for this process to exit, swap the bundle, clear quarantine, reopen.
        let script = dir.join("install.sh");
        let reopen = if relaunch { format!("open \"{target}\"") } else { String::new() };
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nwhile kill -0 {pid} 2>/dev/null; do sleep 0.2; done\nrm -rf \"{target}.old\"\nmv \"{target}\" \"{target}.old\" && ditto \"{new}\" \"{target}\" && rm -rf \"{target}.old\" || {{ rm -rf \"{target}\"; mv \"{target}.old\" \"{target}\"; }}\nxattr -dr com.apple.quarantine \"{target}\" 2>/dev/null\n{reopen}\n",
                pid = std::process::id(),
                new = new_app.display(),
            ),
        )
        .map_err(|e| e.to_string())?;
        use std::os::unix::process::CommandExt;
        std::process::Command::new("/bin/sh").arg(&script).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).process_group(0).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(windows)]
    {
        // The installer waits for this app to exit (it asks to close a running copy) and, with /R, starts it again.
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        let mut c = std::process::Command::new(&file);
        c.arg("/S");
        if relaunch {
            c.arg("/R");
        }
        c.creation_flags(DETACHED_PROCESS).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("unsupported platform".into())
}

/// /Applications/StudyLens.app when running from a bundle.
#[cfg(target_os = "macos")]
fn current_bundle() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let s = exe.to_string_lossy();
    let i = s.find(".app/")?;
    let p = std::path::PathBuf::from(&s[..i + 4]);
    p.exists().then_some(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert!(newer("1.2.10", "1.2.9"));
        assert!(newer("v0.3.0", "0.2.0"));
        assert!(!newer("0.2.0", "0.2.0"));
        assert!(!newer("0.2.0-beta", "0.2.0"));
        assert!(!newer("0.1.9", "0.2.0"));
    }
}
