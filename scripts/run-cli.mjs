// Chạy pipeline không cần giao diện, để thử nhanh: node scripts/run-cli.mjs <file...> [--model sonnet] [--fast] [--out dir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const require = createRequire(import.meta.url);
const { Job } = require("../dist/main/pipeline.js");
const { findClaude } = require("../dist/main/claude.js");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ""; };
const model = opt("--model"), outputDir = opt("--out");
const fast = args.includes("--fast") ? (args.splice(args.indexOf("--fast"), 1), true) : false;
const info = await findClaude("");
if (!info.found) { console.error(info.error); process.exit(1); }
const workDir = path.join(os.tmpdir(), "so-tay-cli", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(workDir, { recursive: true });
const t0 = Date.now();
const ts = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const job = new Job({ files: args.map((a) => path.resolve(a)), title: "", model, research: !fast, lang: "Tiếng Việt", outputDir }, info.path, path.resolve("dist/assets"), workDir, (e) => {
  if (e.kind === "log") console.log(ts(), e.tone ?? "", e.text);
  else if (e.kind === "stage") console.log(ts(), "==", e.text);
  else if (e.kind === "done") console.log(ts(), "DONE", e.output, e.slides, "slides", e.articles, "articles", "$" + e.costUsd.toFixed(2));
  else if (e.kind === "fail") { console.log(ts(), "FAIL", e.message, e.workDir); process.exitCode = 1; }
});
console.log("workDir", workDir);
await job.run();
