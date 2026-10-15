// Build the web side into dist/:
// - dist/renderer: the app window (src/renderer) + the engine bundle (src/engine → engine.js) +
//   Mermaid for the Deep Brief diagrams (vendor/). Tauri serves this folder.
// - dist/engine.cjs: the same engine for Node (tests, and the Rust tests' stand-in for the window).
// `--watch` (used by `npm run dev`): rebuild on save; Tauri's dev server reloads the window.
import { cpSync, mkdirSync, rmSync, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const live = process.argv.includes("--watch");
const say = (s) => console.log(`\x1b[36m[build]\x1b[0m ${s}`);

if (!live) {
  const tsc = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });
  if (tsc.status !== 0) process.exit(tsc.status ?? 1);
}

rmSync(path.join(dist, "renderer"), { recursive: true, force: true });
const copyRenderer = () => cpSync(path.join(root, "src", "renderer"), path.join(dist, "renderer"), { recursive: true });
copyRenderer();
mkdirSync(path.join(dist, "renderer", "vendor"), { recursive: true });
cpSync(path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js"), path.join(dist, "renderer", "vendor", "mermaid.min.js"));

const common = { bundle: true, target: "es2022", logLevel: "warning", legalComments: "none" };
const builds = [
  { ...common, entryPoints: [path.join(root, "src", "engine", "browser.ts")], outfile: path.join(dist, "renderer", "engine.js"), platform: "browser", format: "iife", minify: !live },
  { ...common, entryPoints: [path.join(root, "src", "engine", "node.ts")], outfile: path.join(dist, "engine.cjs"), platform: "node", format: "cjs" },
];

if (live) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  let timer = null;
  watch(path.join(root, "src", "renderer"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => { copyRenderer(); say("renderer updated"); }, 60);
  });
  say("watching src/renderer and src/engine");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  say("dist/ ready");
}
