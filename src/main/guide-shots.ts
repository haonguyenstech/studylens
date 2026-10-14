// Dev: STUDYLENS_SHOOT=<dir> STUDYLENS_GUIDE=1 renders the README guide's screenshots: each step's UI state
// with its parts outlined in red and numbered, the numbers matching the guide's tables. Demo data only.
// Run with STUDYLENS_FAKE_CLAUDE=scripts/fake-claude.mjs (the run steps need a run) and STUDYLENS_THEME=dark.
import { app, BrowserWindow } from "electron";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Injected into the page: __mark(selector, n) outlines an element and puts a numbered badge next to it.
const MARK = `
window.__mark = (sel, n, side) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el) { console.error("guide: no element " + sel); return; }
  const r = el.getBoundingClientRect();
  // an open modal dialog sits in the top layer: draw inside it, or the marks end up behind it
  const host = document.querySelector("dialog[open]") || document.body;
  // fixed boxes are relative to the viewport unless the host (a transformed dialog) makes its own: measure it
  const probe = document.createElement("div");
  Object.assign(probe.style, { position: "fixed", left: "0", top: "0", width: "0", height: "0" });
  host.append(probe);
  const h = probe.getBoundingClientRect();
  probe.remove();
  const add = (st) => { const d = document.createElement("div"); d.className = "__tut"; Object.assign(d.style, { position: "fixed", zIndex: 2147483647, pointerEvents: "none" }, st); host.append(d); return d; };
  add({ left: r.left - 5 - h.left + "px", top: r.top - 5 - h.top + "px", width: r.width + 10 + "px", height: r.height + 10 + "px",
    border: "3px solid #ff3b30", borderRadius: "12px", boxShadow: "0 0 0 4px rgba(255,59,48,.22)", boxSizing: "border-box" });
  const b = add({ width: "30px", height: "30px", borderRadius: "50%", background: "#ff3b30", color: "#fff", display: "grid", placeItems: "center",
    font: "700 16px/1 -apple-system, system-ui, sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,.35)" });
  b.textContent = n;
  // default: outside on the left, centred; "t" top-left corner, "r" top-right corner, "b" bottom-left corner
  side = side || (r.left - h.left >= 44 ? "l" : "t");
  let x = r.left - 44, y = r.top + Math.min(r.height, 60) / 2 - 15;
  if (side === "t") { x = r.left - 20; y = r.top - 20; }
  if (side === "r") { x = r.right - 10; y = r.top - 20; }
  if (side === "b") { x = r.left + 10; y = r.bottom - 8; }
  b.style.left = Math.min(innerWidth - 34, Math.max(4, x)) - h.left + "px";
  b.style.top = Math.min(innerHeight - 34, Math.max(4, y)) - h.top + "px";
};
window.__clear = () => document.querySelectorAll(".__tut").forEach((n) => n.remove());
// scroll the nearest scrolling box only (scrollIntoView also scrolls the window and shifts the whole app)
window.__scrollTo = (sel, pad = 16) => {
  const el = document.querySelector(sel);
  let sc = el.parentElement;
  while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
  if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - pad;
};
// demo screenshots must not show this machine: home folder, the fake Claude's path and version
window.__mask = () => {
  const fix = (v) => v.replace(/\\/(private\\/)?tmp\\/StudyLens\\/projects/g, "/Users/you/Documents/StudyLens").replace(/\\/(private\\/)?tmp\\/StudyLens/g, "/Users/you/Downloads")
    .replace(/\\/Users\\/[^/\\s]+\\/coding\\/electron\\/studylens\\/scripts\\/fake-claude\\.mjs/g, "/Users/you/.local/bin/claude")
    .replace(/\\/Users\\/(?!you\\b)[^/\\s]+/g, "/Users/you").replace(/9\\.9\\.9/g, "2.1.0");
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll("input").forEach((i) => { const v = fix(i.value); if (v !== i.value) i.value = v; });
};
0`;

export async function shootGuide(w: BrowserWindow, dir: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const js = (code: string) => w.webContents.executeJavaScript(code).catch((e) => console.log(`[guide] ${code.slice(0, 60)} → ${e.message}`));
  const marks = (list: [string, number, string?][]) => js(`window.__clear(); ${list.map(([s, n, side]) => `window.__mark(${JSON.stringify(s)}, "${n}", ${JSON.stringify(side ?? "")})`).join("; ")}; 0`);
  const snap = async (name: string) => {
    await js(`window.__mask()`);
    await wait(300);
    writeFileSync(path.join(dir, name + ".png"), (await w.webContents.capturePage()).toPNG());
    await js(`window.__clear()`);
  };
  const state = () => js(`(() => { const r = window.__test.run(); return r ? r.state : ""; })()`);
  const until = async (ok: (s: string) => boolean, ms = 60000) => { for (let i = 0; i < ms / 250 && !ok(await state()); i++) await wait(250); };
  mkdirSync(dir, { recursive: true });
  await wait(1200);
  await js(MARK);
  await js(`window.__test.lang("en")`);

  // 1 · Check the AI engine
  await js(`window.__test.settings()`);
  await wait(1500);   // the engine check
  await marks([["#engine", 1], ["#o-model", 2], ["#set-theme", 3]]);
  await snap("g1-settings");
  await js(`window.__test.closeSettings()`);

  // 2 · A project
  const pdir = path.join(dir, "projects");
  rmSync(pdir, { recursive: true, force: true });
  await js(`window.__test.createProject("System Design", "#5E5CE6", ${JSON.stringify(pdir)})`);
  await js(`window.__test.createProject("Computer Networks", "#30D158", ${JSON.stringify(pdir)})`);
  await js(`window.__test.home()`);
  await wait(500);
  await js(`window.__test.newProjectDialog()`);
  await wait(300);
  await js(`document.getElementById("pj-name").value = "Distributed Systems"; document.getElementById("pj-name").dispatchEvent(new Event("input"))`);
  await wait(900);   // the dialog's opening animation moves it
  await marks([["#pj-name", 1], ["#pj-colors", 2], ["#pj-where", 3]]);
  await snap("g2-project");
  await js(`window.__test.closeDialogs()`);

  // 3 · Documents and options
  await js(`window.__test.useProject("System Design"); window.__test.newPage()`);
  await wait(400);
  const demo = path.join(dir, "demo");
  mkdirSync(demo, { recursive: true });
  const demoFiles = ["System Design - Section 1.pdf", "System Design - Section 15.pdf", "Week 3 lecture.pptx"];
  for (const n of demoFiles) writeFileSync(path.join(demo, n), Buffer.alloc(40000));
  await js(`window.__test.setFiles(${JSON.stringify(demoFiles.map((n) => path.join(demo, n)))}, "merge")`);
  await wait(1200);
  await marks([["#drop", 1], ["#files", 2], ["#o-mode", 3, "t"], ["#go", 4]]);
  await snap("g3-documents");
  await js(`document.querySelector('#o-lang [data-v="English"]')?.click(); document.getElementById("o-research").closest("label, .toggle, .row, div").setAttribute("data-g", "research"); window.__scrollTo("#o-format", 60)`);
  await wait(400);
  await marks([["#o-format", 1], ["#o-title", 2], ["#o-lang", 3], ["[data-g=research]", 4]]);
  await snap("g3-options");

  // WBS Map needs an .xlsx
  const xlsx = path.join(demo, "RoomBook WBS.xlsx");
  writeFileSync(xlsx, Buffer.alloc(12000));
  await js(`window.__test.setFiles([${JSON.stringify(path.join(demo, demoFiles[0]))}], "merge")`);
  await wait(600);
  await js(`document.querySelector('#o-format [data-v="wbs"]').click(); window.__scrollTo("#o-format", 160)`);
  await wait(500);
  await marks([['#o-format [data-v="wbs"]', 1, "r"], ["#fmt-warn", 2]]);
  await snap("g3-wbs-warn");
  await js(`document.querySelector('#o-format [data-v="tap"]').click()`);

  // 4 · A run: one notebook per file, the 2nd fails on purpose (fake Claude)
  const bdir = path.join(dir, "batch");
  mkdirSync(bdir, { recursive: true });
  const names = ["Week 1 - Intro.pdf", "Week 2 broken scan.pdf", "Week 3 - Caching.pdf"];
  for (const n of names) writeFileSync(path.join(bdir, n), Buffer.alloc(2048));
  await js(`window.__test.setFiles(${JSON.stringify(names.map((n) => path.join(bdir, n)))}, "separate")`);
  await wait(900);
  await js(`window.__test.process(${JSON.stringify(bdir)})`);
  await wait(1800);
  await marks([[".r-progress", 1], ["#r-controls", 2], ["#r-items", 3], [".r-log", 4]]);
  await snap("g4-run");
  await until((s) => s === "done" || s === "failed");
  await wait(900);
  await marks([['#r-items .r-item.s-failed', 1], ["#r-controls", 2]]);
  await snap("g4-failed");

  // 5 · The project page, a notebook, quick look
  await js(`(async () => { const h = (await window.api.listHistory()).filter((x) => x.status === "done");
    if (h[0]) await window.api.tagNotebook(h[0].id, ["Caching", "Final exam", "Redis"]);
    if (h[1]) await window.api.tagNotebook(h[1].id, ["Intro", "Final exam"]);
    await window.__test.reload(); })()`);
  await js(`window.__test.project("System Design")`);
  await wait(900);
  await js(`document.querySelector("#nb-grid .nb-card .nb-acts").style.opacity = "1"`);   // shown on hover
  await marks([["#nb-grid .nb-card", 1], ["#nb-grid .nb-card .nb-acts", 2, "r"], ["#pj-tags", 3], ["#q", 4, "t"]]);
  await snap("g5-project");
  writeFileSync(path.join(bdir, names[0]), await w.webContents.printToPDF({}));   // a real PDF for the source tab
  await js(`(() => { const c = document.querySelector("#nb-grid .nb-card"); c?.focus(); c?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); })()`);
  await wait(1500);
  await marks([["#pv-tabs", 1, "b"], ["#pv-open", 2, "b"], ["#pv-close", 3]]);
  await snap("g5-preview");
  await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await wait(400);
  await js(`document.querySelector("#nb-grid .nb-card")?.click()`);
  await wait(800);
  await marks([["#d-actions", 1], ["#d-tags", 2], ["#d-stats", 3]]);
  await snap("g5-detail");

  // 6 · Tags and search
  await js(`document.querySelector("#d-tags .tag-add")?.click()`);
  await wait(400);
  await marks([["#tg-field", 1], ["#tg-tpl", 2]]);
  await snap("g6-tags");
  await js(`window.__test.closeDialogs()`);
  await js(`{ const q = document.getElementById("q"); q.value = "#final"; q.dispatchEvent(new Event("input")) }`);
  await wait(500);
  await marks([["#q", 1, "t"], ["#history", 2, "t"]]);
  await snap("g6-search");
  await js(`{ const q = document.getElementById("q"); q.value = ""; q.dispatchEvent(new Event("input")) }`);
  app.quit();
}
