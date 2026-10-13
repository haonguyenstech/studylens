// Self-update from the public releases repo (the source repo stays private).
// - check: GitHub "latest release" API, no token needed; compares tag vX.Y.Z with app.getVersion()
// - macOS: the build is not code-signed, so Squirrel.Mac can't be used. We download the .zip for
//   this chip, check its sha256 against the asset digest, unpack it with ditto, and a detached
//   shell script swaps the .app bundle after we quit, then reopens it.
// - Windows: download the NSIS installer and run it silently (/S --force-run) after we quit.
import { app, net } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RELEASES_REPO = "haonguyenstech/studylens-releases";

export interface UpdateInfo {
  current: string;
  latest?: string;
  available: boolean;
  notes?: string;
  url?: string;            // release page
  publishedAt?: string;
  error?: string;
}
export type UpdateProgress = { phase: "download" | "verify" | "install"; received?: number; total?: number };

interface Asset { name: string; browser_download_url: string; size: number; digest?: string }
let lastRelease: { tag: string; assets: Asset[] } | null = null;

/** "1.2.10" > "1.2.9"; pre-release suffixes are ignored. */
export function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const pb = b.replace(/^v/, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  try {
    const res = await net.fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "StudyLens" },
    });
    if (res.status === 404) return { current, available: false };   // nothing published yet
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const r = (await res.json()) as { tag_name: string; body?: string; html_url: string; published_at: string; assets: Asset[] };
    lastRelease = { tag: r.tag_name, assets: r.assets };
    const latest = r.tag_name.replace(/^v/, "");
    return { current, latest, available: newer(latest, current) && !!pickAsset(r.assets), notes: r.body || "", url: r.html_url, publishedAt: r.published_at };
  } catch (e) {
    return { current, available: false, error: (e as Error).message };
  }
}

function pickAsset(assets: Asset[]): Asset | undefined {
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return assets.find((a) => a.name.endsWith(`-mac-${arch}.zip`));
  }
  if (process.platform === "win32") return assets.find((a) => /Setup.*\.exe$/i.test(a.name));
  return undefined;
}

async function download(a: Asset, to: string, onProgress: (p: UpdateProgress) => void) {
  const res = await net.fetch(a.browser_download_url, { headers: { "User-Agent": "StudyLens" } });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get("content-length")) || a.size;
  const out = createWriteStream(to);
  const hash = createHash("sha256");
  let received = 0, last = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    received += value.length;
    if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    if (Date.now() - last > 150) { last = Date.now(); onProgress({ phase: "download", received, total }); }
  }
  await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  onProgress({ phase: "verify", received, total });
  const sha = hash.digest("hex");
  if (a.digest?.startsWith("sha256:") && a.digest.slice(7) !== sha) throw new Error("checksum mismatch");
  if (a.size && received !== a.size) throw new Error("incomplete download");
}

/**
 * Download and stage the update, then quit; a helper finishes the install and reopens the app.
 * `relaunch: false` is for tests (install only).
 */
export async function installUpdate(onProgress: (p: UpdateProgress) => void, opts: { relaunch?: boolean } = {}): Promise<void> {
  if (!lastRelease) { const info = await checkForUpdate(); if (!info.available) throw new Error(info.error || "no update"); }
  const asset = pickAsset(lastRelease!.assets);
  if (!asset) throw new Error("no installer for this platform");
  const dir = path.join(app.getPath("temp"), "studylens-update", lastRelease!.tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, asset.name);
  await download(asset, file, onProgress);
  onProgress({ phase: "install" });
  const relaunch = opts.relaunch !== false;

  if (process.platform === "darwin") {
    const unpacked = path.join(dir, "app");
    mkdirSync(unpacked);
    await run("ditto", ["-x", "-k", file, unpacked]);
    const name = readdirSync(unpacked).find((f) => f.endsWith(".app"));
    if (!name) throw new Error("no .app in the update");
    const target = currentBundle();
    if (!target) throw new Error("not running from an .app bundle");
    // Wait for this process to exit, swap the bundle, clear quarantine, reopen.
    const script = path.join(dir, "install.sh");
    writeFileSync(script, `#!/bin/sh
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
rm -rf "${target}.old"
mv "${target}" "${target}.old" && ditto "${path.join(unpacked, name)}" "${target}" && rm -rf "${target}.old" || { rm -rf "${target}"; mv "${target}.old" "${target}"; }
xattr -dr com.apple.quarantine "${target}" 2>/dev/null
${relaunch ? `open "${target}"` : ""}
`, { mode: 0o755 });
    spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    // NSIS: /S = silent, --force-run = start the app when done; the installer waits for us to exit.
    spawn(file, ["/S", ...(relaunch ? ["--force-run"] : [])], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    throw new Error("unsupported platform");
  }
  setTimeout(() => app.quit(), 300);
}

/** /Applications/StudyLens.app when running from a bundle. */
function currentBundle(): string | null {
  const m = /^(.*?\.app)\//.exec(app.getPath("exe"));
  return m && existsSync(m[1]) ? m[1] : null;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}
