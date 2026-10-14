// Copy file tĩnh (renderer + assets cho Claude) vào dist/
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/renderer", { recursive: true });
cpSync("src/renderer", "dist/renderer", { recursive: true, filter: (p) => !p.endsWith(".ts") });
cpSync("assets", "dist/assets", { recursive: true });
// Diagrams of the Deep Brief format are drawn by Mermaid in a hidden window (src/main/diagrams.ts).
mkdirSync("dist/vendor", { recursive: true });
cpSync("node_modules/mermaid/dist/mermaid.min.js", "dist/vendor/mermaid.min.js");
cpSync("src/vendor/diagrams.html", "dist/vendor/diagrams.html");
console.log("assets copied");
