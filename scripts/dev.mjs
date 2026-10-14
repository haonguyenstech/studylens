// Dev mode with hot reload: `npm run dev`
// - renderer (src/renderer) and assets: copied to dist on save; the window reloads,
//   and a CSS-only change is swapped in place so the page keeps its state
// - main/preload/shared (TypeScript): `tsc --watch` recompiles, then Electron restarts
// Closing the app window ends the dev session.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, statSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = (n) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${n}.cmd` : n);
const say = (s) => console.log(`\x1b[36m[dev]\x1b[0m ${s}`);

// 1. One full build so dist/ is complete before Electron starts.
const first = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });
if (first.status !== 0) process.exit(first.status ?? 1);
spawnSync(process.execPath, [path.join(root, "scripts", "copy-assets.mjs")], { cwd: root, stdio: "inherit" });

// 2. Electron, restartable.
let app = null, restarting = false;
function startApp() {
  app = spawn(bin("electron"), ["."], { cwd: root, stdio: "inherit", env: { ...process.env, STUDYLENS_DEV: "1" }, shell: process.platform === "win32" });
  app.on("exit", () => {
    if (restarting) { restarting = false; startApp(); return; }
    say("app closed, stopping dev mode");
    tsc.kill();
    process.exit(0);
  });
}
function restartApp() {
  if (!app || app.exitCode !== null) return startApp();
  say("main process changed, restarting the app…");
  restarting = true;
  app.kill();
}

// 3. TypeScript watcher for main/preload/shared: restart after each clean compile.
const tsc = spawn(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], { cwd: root });
let tscReady = false;
tsc.stdout.on("data", (d) => {
  const out = String(d);
  const m = /Found (\d+) errors?/.exec(out);
  if (!m) return;
  if (m[1] !== "0") { process.stdout.write(out); say("TypeScript errors, keeping the running app"); return; }
  if (!tscReady) { tscReady = true; return; }   // the watcher's initial compile
  restartApp();
});

// 4. Renderer and assets: copy the changed file; the running app reloads itself (see devReload in main).
function mirror(srcDir, outDir, skip = () => false) {
  let timer = null;
  const pending = new Set();
  watch(srcDir, { recursive: true }, (_ev, file) => {
    if (!file || skip(file)) return;
    pending.add(file);
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const f of pending) {
        const from = path.join(srcDir, f);
        if (!existsSync(from)) continue;
        mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
        if (statSync(from).isDirectory()) cpSync(from, path.join(outDir, f), { recursive: true });   // a new folder (e.g. fonts/)
        else copyFileSync(from, path.join(outDir, f));
        say(`updated ${path.relative(root, from)}`);
      }
      pending.clear();
    }, 60);
  });
}
mirror(path.join(root, "src", "renderer"), path.join(root, "dist", "renderer"), (f) => f.endsWith(".ts"));
mirror(path.join(root, "assets"), path.join(root, "dist", "assets"));

startApp();
say("watching src/ and assets/ — edit and save; close the window to stop");
