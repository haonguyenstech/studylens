#!/usr/bin/env node
// Stand-in for `claude -p` in tests (STUDYLENS_FAKE_CLAUDE=scripts/fake-claude.mjs): speaks the same
// stream-json, writes a tiny valid notebook into out/, and fails on purpose for inputs named *broken*.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

if (process.argv.includes("--version")) { console.log("9.9.9 (Claude Code)"); process.exit(0); }
const say = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const ri = process.argv.indexOf("--resume");
const resumed = ri >= 0 ? process.argv[ri + 1] : "";
const sid = resumed || randomUUID();
const delay = Number(process.env.FAKE_DELAY || 500);
let prompt = "";
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  say({ type: "system", subtype: "init", session_id: sid });
  const input = readdirSync("input")[0] || "doc";
  if (resumed) say({ type: "assistant", session_id: sid, message: { content: [{ type: "text", text: `Resumed session ${sid.slice(0, 8)}: continuing out/.` }] } });
  say({ type: "assistant", session_id: sid, message: { content: [{ type: "tool_use", name: "Read", input: { file_path: `input/${input}` } }] } });
  await wait(delay);
  if (/broken/i.test(input)) { process.stderr.write("simulated failure for " + input); process.exit(1); }
  const title = (/Tên sổ tay người dùng đặt: "([^"]+)"/.exec(prompt) || [, input])[1];
  mkdirSync("out", { recursive: true });
  writeFileSync("out/meta.json", JSON.stringify({ title, sections: [{ id: "sec1", label: title }] }));
  writeFileSync("out/slides.html", `<h2 class="sec-h" id="sec1">${title}</h2>\n<div class="deck-item"><div class="s-no">Slide 1</div><div class="slide"><h3 class="s-title">${title}</h3><div class="s-body"><ul class="b"><li><a class="k" href="#d-one">Line one</a></li></ul></div></div></div>`);
  writeFileSync("out/articles.html", `<article class="d" id="d-one" data-where="Slide 1" data-q="Line one"><div class="easy"><b>Hiểu nhanh</b>Test.</div><div class="ex"><span class="chip">Ví dụ đời thường</span><p>Test.</p></div></article>`);
  say({ type: "assistant", session_id: sid, message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "out/slides.html" } }] } });
  await wait(delay);
  say({ type: "result", subtype: "success", is_error: false, session_id: sid, total_cost_usd: 0.42, num_turns: 3 });
});
