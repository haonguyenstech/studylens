// Copies the freshly packed arm64/x64 .app into /Applications (used by `npm run app`).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const dir = [process.arch === "arm64" ? "release/mac-arm64" : "release/mac"].find((d) => existsSync(d));   // the build for this Mac's chip
const name = dir && readdirSync(dir).find((f) => f.endsWith(".app"));
if (!name) { console.error("No .app in release/ — run electron-builder --dir first"); process.exit(1); }
const dest = path.join("/Applications", name);
rmSync(dest, { recursive: true, force: true });
const r = spawnSync("ditto", [path.join(dir, name), dest], { stdio: "inherit" });   // ditto keeps the bundle's symlinks and signature
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Installed ${dest}`);
