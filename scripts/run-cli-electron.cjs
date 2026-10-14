// Run one notebook end to end with the real Claude, inside Electron so Deep Brief diagrams get drawn:
//   npx electron scripts/run-cli-electron.cjs <file...> [--brief | --wbs] [--model sonnet] [--fast] [--out dir]
const { app } = require("electron");
const { mkdirSync } = require("node:fs");
const path = require("node:path"), os = require("node:os");
const { Job } = require("../dist/main/pipeline.js");
const { findClaude } = require("../dist/main/claude.js");
const { renderMermaid } = require("../dist/main/diagrams.js");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith(".cjs")) + 1);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ""; };
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 1), true) : false; };
  const model = opt("--model"), outputDir = opt("--out"), brief = flag("--brief"), wbs = flag("--wbs"), fast = flag("--fast");
  const info = await findClaude("");
  if (!info.found) { console.error(info.error); app.exit(1); return; }
  const workDir = path.join(os.tmpdir(), "studylens-cli", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(workDir, { recursive: true });
  const t0 = Date.now();
  const ts = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  console.log("workDir", workDir);
  let code = 0;
  const job = new Job({ files: args.map((a) => path.resolve(a)), title: "", model, research: !fast, lang: "Tiếng Việt", outputDir, format: brief ? "brief" : wbs ? "wbs" : "tap" },
    info.path, path.resolve(__dirname, "..", "dist", "assets"), workDir, (e) => {
      if (e.kind === "log") console.log(ts(), e.tone ?? "", e.text);
      else if (e.kind === "stage") console.log(ts(), "==", e.text);
      else if (e.kind === "done") console.log(ts(), "DONE", e.output, e.slides, brief ? "sections" : wbs ? "modules" : "slides", e.articles, brief ? "diagrams" : wbs ? "items" : "articles", "$" + e.costUsd.toFixed(2));
      else if (e.kind === "fail") { console.log(ts(), "FAIL", e.message); code = 1; }
    }, undefined, renderMermaid);
  await job.run();
  app.exit(code);
});
