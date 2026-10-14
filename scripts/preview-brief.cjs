// Build a Deep Brief from a body file and screenshot it (dev tool):
//   npx electron scripts/preview-brief.cjs <body.html> <out-dir> [light|dark]
const { app, BrowserWindow, nativeTheme } = require("electron");
const fs = require("node:fs"), path = require("node:path");
const { checkBrief, assembleBrief } = require("../dist/main/brief.js");
const { renderMermaid } = require("../dist/main/diagrams.js");
const [bodyFile, outDir, theme] = process.argv.slice(-3).filter((a) => !a.endsWith(".cjs"));
app.on("window-all-closed", () => {});   // the hidden diagram window closing must not quit the app
if (theme === "dark" || theme === "light") nativeTheme.themeSource = theme;
app.whenReady().then(async () => {
  const body = fs.readFileSync(bodyFile, "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");
  const parts = { meta: { title: "Preview", mark: "StudyLens · Deep Brief", subtitle: "Bản xem thử từ EXAMPLE.html" }, body };
  const r = await checkBrief(parts, renderMermaid);
  console.log("errors:", r.errors.length ? r.errors : "none", "sections:", r.sections, "diagrams:", r.diagrams);
  const tpl = fs.readFileSync(path.join(__dirname, "..", "assets", "brief", "template.html"), "utf8");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "brief.html");
  fs.writeFileSync(file, assembleBrief(tpl, parts, r.body, "Made with StudyLens · Deep Brief"));
  const w = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  await w.loadFile(fs.realpathSync(file)).catch((e) => console.log("load:", e.message));
  await new Promise((res) => setTimeout(res, 600));
  for (const [name, y] of [["top", 0], ["diagram", 900]]) {
    await w.webContents.executeJavaScript(`scrollTo(0, ${y})`);
    await new Promise((res) => setTimeout(res, 300));
    fs.writeFileSync(path.join(outDir, `${name}-${theme || "system"}.png`), (await w.webContents.capturePage()).toPNG());
  }
  app.exit(0);
});
