// Mermaid → SVG for the Deep Brief format. Mermaid needs a real page to measure text, so the sources
// are drawn in a hidden, off-screen frame (vendor/diagrams.html, its own page so the app's CSS can't
// change the measurements); the SVGs are inlined into the notebook (works offline).
export type Drawn = { svg?: string; error?: string };

type DiagramWindow = Window & { renderAll(codes: string[]): Promise<Drawn[]> };

export async function renderMermaid(codes: string[]): Promise<Drawn[]> {
  if (!codes.length) return [];
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Laid out at full size (a hidden or zero-size frame would measure text as 0), just off screen.
  frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1400px;height:900px;border:0;pointer-events:none";
  try {
    const win = await new Promise<DiagramWindow>((resolve, reject) => {
      frame.onload = () => {
        const w = frame.contentWindow as DiagramWindow | null;
        if (w && typeof w.renderAll === "function") resolve(w); else reject(new Error("diagram page did not load"));
      };
      frame.onerror = () => reject(new Error("diagram page did not load"));
      frame.src = "vendor/diagrams.html";
      document.body.appendChild(frame);
    });
    return await win.renderAll(codes);
  } finally {
    frame.remove();
  }
}
