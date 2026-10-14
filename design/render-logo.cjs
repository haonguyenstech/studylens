// Render design/logo.svg to PNGs: npx electron design/render-logo.cjs
//   build/icon.png        1024, the mark with a margin so it sits like other Dock icons (the mark has no tile)
//   src/renderer/icon.png  256, edge to edge, for the app's own screens
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), path = require("node:path");
app.on("window-all-closed", () => {});
async function shot(svg, size, pad) {
  const w = new BrowserWindow({ show: false, width: 1024, height: 1024, transparent: true, frame: false, backgroundColor: "#00000000", useContentSize: true });
  const inner = svg.replace(/width="1024" height="1024"/, `width="${1024 - 2 * pad}" height="${1024 - 2 * pad}"`);
  await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0;background:transparent"><div style="padding:${pad}px;width:1024px;height:1024px;box-sizing:border-box">${inner}</div></body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  w.destroy();
  return img.resize({ width: size, height: size, quality: "best" }).toPNG();
}
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "logo.svg"), "utf8");
  const root = path.join(__dirname, "..");
  fs.writeFileSync(path.join(root, "build/icon.png"), await shot(svg, 1024, 110));
  fs.writeFileSync(path.join(root, "src/renderer/icon.png"), await shot(svg, 256, 0));
  console.log("wrote build/icon.png, src/renderer/icon.png");
  app.exit(0);
});
