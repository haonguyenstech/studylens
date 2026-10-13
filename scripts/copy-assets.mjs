// Copy file tĩnh (renderer + assets cho Claude) vào dist/
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/renderer", { recursive: true });
cpSync("src/renderer", "dist/renderer", { recursive: true, filter: (p) => !p.endsWith(".ts") });
cpSync("assets", "dist/assets", { recursive: true });
console.log("assets copied");
