// Dò và chạy Claude Code CLI (`claude -p`) ở chế độ headless.
import { spawn, execFile, ChildProcess } from "node:child_process";
import { t } from "./i18n";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaudeInfo } from "../shared/types";

const isWin = process.platform === "win32";

function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout)));
  });
}

// App mở từ Finder không thừa hưởng PATH của shell, nên hỏi login shell và thử các chỗ cài phổ biến.
async function candidates(): Promise<string[]> {
  const home = os.homedir();
  const out: string[] = [];
  if (isWin) {
    const where = await run("where.exe", ["claude"]);
    out.push(...where.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    out.push(
      path.join(home, ".local", "bin", "claude.exe"),
      path.join(appData, "npm", "claude.cmd"),
    );
  } else {
    const shell = process.env.SHELL || "/bin/zsh";
    const viaShell = (await run(shell, ["-ilc", "command -v claude"])).trim().split("\n").pop() || "";
    if (viaShell.startsWith("/")) out.push(viaShell);
    out.push(
      path.join(home, ".local", "bin", "claude"),
      path.join(home, ".claude", "local", "claude"),
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
    );
  }
  return [...new Set(out)].filter((p) => existsSync(p));
}

export async function findClaude(custom: string): Promise<ClaudeInfo> {
  if (process.env.STUDYLENS_FAKE_CLAUDE) custom = process.env.STUDYLENS_FAKE_CLAUDE;   // tests: scripts/fake-claude.mjs
  const list = custom ? [custom] : await candidates();
  if (!list.length) {
    return {
      found: false,
      error: custom
        ? t("claude.noFile", { path: custom })
        : t("claude.notFound"),
    };
  }
  for (const p of list) {
    const v = await versionOf(p);
    if (v) return { found: true, path: p, version: v };
  }
  return { found: false, path: list[0], error: t("claude.noRun", { path: list[0] }) };
}

function versionOf(p: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawnClaude(p, ["--version"]);
    let buf = "";
    child.stdout?.on("data", (d) => (buf += d));
    const t = setTimeout(() => { killTree(child); resolve(""); }, 15000);
    child.on("error", () => { clearTimeout(t); resolve(""); });
    child.on("close", (code) => { clearTimeout(t); resolve(code === 0 ? buf.trim().split("\n")[0] : ""); });
  });
}

// npm cài bản `.cmd` trên Windows; Node không spawn thẳng file .cmd (CVE-2024-27980) nên đi qua cmd.exe.
// Tham số ở đây đều là chữ đơn giản (không dấu cách, không nháy); prompt dài luôn được gửi qua stdin.
export function spawnClaude(bin: string, args: string[], cwd?: string): ChildProcess {
  const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: "studylens" };
  if (isWin && /\.(cmd|bat)$/i.test(bin)) {
    const line = [`"${bin}"`, ...args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(" ");
    return spawn("cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
      cwd, env, windowsHide: true, windowsVerbatimArguments: true, stdio: ["pipe", "pipe", "pipe"],
    });
  }
  return spawn(bin, args, { cwd, env, windowsHide: true, detached: !isWin, stdio: ["pipe", "pipe", "pipe"] });
}

export function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWin) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* đã thoát */ } }
  }
}
