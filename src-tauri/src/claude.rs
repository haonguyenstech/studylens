// Find and run the Claude Code CLI (`claude -p`) headless.
use crate::i18n::t;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};

#[derive(Serialize, Clone, Debug, Default)]
pub struct ClaudeInfo {
    pub found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A command that shows no console window on Windows.
pub fn quiet(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c.kill_on_drop(false);
    c
}

/// Run and take stdout; "" on error, non-zero exit or timeout.
async fn output(mut cmd: Command, timeout: Duration) -> String {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
    match tokio::time::timeout(timeout, cmd.output()).await {
        Ok(Ok(o)) if o.status.success() => String::from_utf8_lossy(&o.stdout).into_owned(),
        _ => String::new(),
    }
}

// An app opened from Finder does not inherit the shell's PATH, so ask a login shell and try the usual places.
async fn candidates() -> Vec<String> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut out: Vec<String> = vec![];
    if cfg!(windows) {
        let mut c = quiet("where.exe");
        c.arg("claude");
        let found = output(c, Duration::from_secs(15)).await;
        out.extend(found.lines().map(str::trim).filter(|s| !s.is_empty()).map(String::from));
        let app_data = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"));
        out.push(home.join(".local").join("bin").join("claude.exe").to_string_lossy().into_owned());
        out.push(app_data.join("npm").join("claude.cmd").to_string_lossy().into_owned());
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let mut c = quiet(shell);
        c.args(["-ilc", "command -v claude"]);
        let via_shell = output(c, Duration::from_secs(15)).await;
        let last = via_shell.trim().lines().last().unwrap_or("").to_string();
        if last.starts_with('/') {
            out.push(last);
        }
        for p in [home.join(".local/bin/claude"), home.join(".claude/local/claude")] {
            out.push(p.to_string_lossy().into_owned());
        }
        out.push("/opt/homebrew/bin/claude".into());
        out.push("/usr/local/bin/claude".into());
    }
    let mut seen = vec![];
    out.into_iter().filter(|p| !seen.contains(p) && { seen.push(p.clone()); true }).filter(|p| Path::new(p).exists()).collect()
}

pub async fn find_claude(custom: &str) -> ClaudeInfo {
    let fake = std::env::var("STUDYLENS_FAKE_CLAUDE").unwrap_or_default(); // tests: scripts/fake-claude.mjs
    let custom = if fake.is_empty() { custom.to_string() } else { fake };
    let list = if custom.is_empty() { candidates().await } else { vec![custom.clone()] };
    if list.is_empty() {
        let error = if custom.is_empty() { t("claude.notFound", &[]) } else { t("claude.noFile", &[("path", &custom)]) };
        return ClaudeInfo { found: false, error: Some(error), ..Default::default() };
    }
    for p in &list {
        if let Some(v) = version_of(p).await {
            return ClaudeInfo { found: true, path: Some(p.clone()), version: Some(v), error: None };
        }
    }
    ClaudeInfo { found: false, path: Some(list[0].clone()), version: None, error: Some(t("claude.noRun", &[("path", &list[0])])) }
}

async fn version_of(bin: &str) -> Option<String> {
    let mut child = spawn_claude(bin, &["--version".into()], None).ok()?;
    drop(child.stdin.take());
    let mut stdout = child.stdout.take()?;
    let pid = child.id();
    let work = async {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf).await;
        let status = child.wait().await.ok()?;
        status.success().then(|| buf.trim().lines().next().unwrap_or("").to_string())
    };
    match tokio::time::timeout(Duration::from_secs(15), work).await {
        Ok(v) => v,
        Err(_) => {
            if let Some(pid) = pid { kill_tree(pid); }
            None
        }
    }
}

/// Start `claude` with piped stdio. npm installs a `.cmd` on Windows, which can't be spawned directly,
/// so it goes through cmd.exe. Arguments here are simple words; the long prompt always goes on stdin.
/// On macOS/Linux the child leads its own process group, so stopping it also stops what it started.
pub fn spawn_claude(bin: &str, args: &[String], cwd: Option<&Path>) -> std::io::Result<Child> {
    let lower = bin.to_lowercase();
    let mut cmd = if cfg!(windows) && (lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        let quote = |a: &str| if a.contains(|c: char| c.is_whitespace() || c == '"') { format!("\"{}\"", a.replace('"', "\\\"")) } else { a.to_string() };
        let line = std::iter::once(format!("\"{bin}\"")).chain(args.iter().map(|a| quote(a))).collect::<Vec<_>>().join(" ");
        let mut c = quiet("cmd.exe");
        #[cfg(windows)]
        c.raw_arg(format!("/d /s /c \"{line}\""));
        #[cfg(not(windows))]
        c.arg(line);
        c
    } else {
        let mut c = quiet(bin);
        c.args(args);
        c
    };
    cmd.env("CLAUDE_CODE_ENTRYPOINT", "studylens").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    #[cfg(unix)]
    cmd.process_group(0);
    cmd.spawn()
}

/// Stop a process and everything it started.
pub fn kill_tree(pid: u32) {
    #[cfg(unix)]
    unsafe {
        if libc::kill(-(pid as i32), libc::SIGTERM) != 0 {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
    #[cfg(windows)]
    {
        let mut c = std::process::Command::new("taskkill");
        use std::os::windows::process::CommandExt;
        c.args(["/pid", &pid.to_string(), "/T", "/F"]).creation_flags(CREATE_NO_WINDOW);
        let _ = c.spawn();
    }
}
