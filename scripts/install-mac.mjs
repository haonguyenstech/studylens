// Copies the freshly built .app into /Applications (used by `npm run app`).
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const app = "src-tauri/target/release/bundle/macos/StudyLens.app";
if (!existsSync(app)) { console.error(`No ${app} — run \`tauri build --bundles app\` first`); process.exit(1); }
const dest = path.join("/Applications", "StudyLens.app");
rmSync(dest, { recursive: true, force: true });
const r = spawnSync("ditto", [app, dest], { stdio: "inherit" });   // ditto keeps the bundle's symlinks and signature
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Installed ${dest}`);
