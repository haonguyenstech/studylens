// Mermaid → SVG for the Deep Brief format. Mermaid needs a real browser to measure text, so the
// sources are drawn in a hidden window; the SVGs are inlined into the notebook (works offline).
import { BrowserWindow } from "electron";
import path from "node:path";

export type Drawn = { svg?: string; error?: string };

export async function renderMermaid(codes: string[]): Promise<Drawn[]> {
  if (!codes.length) return [];
  const w = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { offscreen: false, sandbox: true, contextIsolation: true } });
  try {
    await w.loadFile(path.join(__dirname, "..", "vendor", "diagrams.html"));
    return await w.webContents.executeJavaScript(`window.renderAll(${JSON.stringify(codes)})`);
  } finally {
    w.destroy();
  }
}
