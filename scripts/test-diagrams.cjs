// Mermaid rendering in a hidden window (needs Electron): npx electron scripts/test-diagrams.cjs
const { app } = require("electron");
const { renderMermaid } = require("../dist/main/diagrams.js");
app.whenReady().then(async () => {
  const codes = [
    "flowchart LR\n  A[Ứng dụng di động] -->|đồng bộ| B(API đám mây)\n  B --> C[(Cơ sở dữ liệu)]",
    "sequenceDiagram\n  participant U as Người dùng\n  participant S as Máy chủ\n  U->>S: Đăng nhập\n  S-->>U: Token",
    "stateDiagram-v2\n  [*] --> Nháp\n  Nháp --> Đã_gửi\n  Đã_gửi --> [*]",
    "flowchart LR\n  A --> (",
    "flowchart LR\n  " + Array.from({ length: 10 }, (_, i) => `s${i}["Bước số ${i + 1} của quy trình"]`).join(" --> "),
  ];
  const r = await renderMermaid(codes);
  let fail = 0;
  const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) fail++; };
  const vb = (svg) => { const m = /viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/.exec(svg); return m ? +m[1] / +m[2] : 0; };
  check(r[4].svg && vb(r[4].svg) < 4.5, `a long left-to-right chain is redrawn top-down (ratio ${vb(r[4].svg || "").toFixed(2)})`);
  check(r.length === 5, "one result per diagram");
  check(r.slice(0, 3).every((x) => x.svg && x.svg.startsWith("<svg") && !x.error), "flowchart, sequence, state drawn");
  check(r[0].svg.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes("Ứng dụng di động"), "Vietnamese labels kept");
  check(!r[0].svg.includes("<foreignObject"), "plain SVG text (no foreignObject)");
  check(r[0].svg.includes('id="dg1"') && r[1].svg.includes('id="dg2"'), "unique ids per diagram");
  check(!r[3].svg && /Parse error|Expecting|error/i.test(r[3].error || ""), `syntax error reported: ${r[3].error}`);
  console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
  app.exit(fail ? 1 : 0);
});
