// Build the installers into release/, under the names the releases (and the updater) use:
//   node scripts/pack.mjs mac   → StudyLens-<v>-mac-arm64.dmg/.zip and StudyLens-<v>-mac-x64.dmg/.zip
//   node scripts/pack.mjs win   → StudyLens-Setup-<v>.exe (cross-built on macOS: cargo-xwin + NSIS, see README)
// The .zip holds StudyLens.app; it is what the macOS self-update downloads.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const out = path.join(root, "release");
const target = path.join(root, "src-tauri", "target");
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const tauri = path.join(root, "node_modules", ".bin", "tauri");
mkdirSync(out, { recursive: true });

const which = process.argv[2];
if (which === "mac") {
  for (const [triple, arch] of [["aarch64-apple-darwin", "arm64"], ["x86_64-apple-darwin", "x64"]]) {
    run(tauri, ["build", "--target", triple, "--bundles", "app,dmg"]);
    const bundle = path.join(target, triple, "release", "bundle");
    const dmg = readdirSync(path.join(bundle, "dmg")).find((f) => f.endsWith(".dmg") && f.includes(version));
    copyFileSync(path.join(bundle, "dmg", dmg), path.join(out, `StudyLens-${version}-mac-${arch}.dmg`));
    const zip = path.join(out, `StudyLens-${version}-mac-${arch}.zip`);
    rmSync(zip, { force: true });
    run("ditto", ["-c", "-k", "--keepParent", path.join(bundle, "macos", "StudyLens.app"), zip]);   // keeps the bundle's symlinks and signature
  }
} else if (which === "win") {
  const llvm = ["/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin"].find((d) => existsSync(d));
  const env = process.platform === "darwin" && llvm ? { PATH: `${llvm}:${process.env.PATH}` } : {};
  const cross = process.platform !== "win32" ? ["--runner", "cargo-xwin"] : [];
  run(tauri, ["build", ...cross, "--target", "x86_64-pc-windows-msvc", "--bundles", "nsis"], env);
  const dir = path.join(target, "x86_64-pc-windows-msvc", "release", "bundle", "nsis");
  const exe = readdirSync(dir).find((f) => f.endsWith("-setup.exe") && f.includes(version));
  copyFileSync(path.join(dir, exe), path.join(out, `StudyLens-Setup-${version}.exe`));
} else {
  console.error("usage: node scripts/pack.mjs mac|win");
  process.exit(1);
}
console.log(`release/ ready for ${which}`);
