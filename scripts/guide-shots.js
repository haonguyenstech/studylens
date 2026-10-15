// Screenshot mode for the README guide: each step's UI state with its parts outlined in red and
// numbered, the numbers matching the guide's tables. Demo data only, fake Claude, dark theme:
//   npx tauri build --debug --bundles app
//   STUDYLENS_THEME=dark STUDYLENS_SHOOT=/tmp/StudyLens STUDYLENS_SCRIPT=scripts/guide-shots.js \
//     STUDYLENS_FAKE_CLAUDE=$PWD/scripts/fake-claude.mjs src-tauri/target/debug/bundle/macos/StudyLens.app/Contents/MacOS/studylens
(() => {
  if (window.top !== window) return;

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
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shot = esc(window.__SHOOT_DIR.replace(/^\/private/, "")), proj = new RegExp(`(/private)?${shot}/projects`, "g"), rest = new RegExp(`(/private)?${shot}`, "g");
  const fix = (v) => v.replace(proj, "/Users/you/Documents/StudyLens").replace(rest, "/Users/you/Downloads")
    .replace(/\/Users\/[^/\s]+\/coding\/electron\/studylens\/scripts\/fake-claude\.mjs/g, "/Users/you/.local/bin/claude")
    .replace(/\/Users\/(?!you\b)[^/\s]+/g, "/Users/you").replace(/9\.9\.9/g, "2.1.0");
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll("input").forEach((i) => { const v = fix(i.value); if (v !== i.value) i.value = v; });
};

  const dir = window.__SHOOT_DIR;
  const inv = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const log = (m) => inv("dev_log", { msg: "[guide] " + m });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const J = (...a) => a.join(navigator.platform.startsWith("Win") ? "\\" : "/");
  const $ = (s) => document.querySelector(s);
  const marks = (list) => { window.__clear(); for (const [s, n, side] of list) window.__mark(s, String(n), side || ""); };
  const snap = async (name) => { window.__mask(); await wait(300); await inv("dev_shot", { name }); window.__clear(); log("snap " + name); };
  const write = (path, size, text) => inv("dev_write", { path, size, text });
  const pdf = (title) => {
    const text = `BT /F1 28 Tf 72 760 Td (${title}) Tj ET`;
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    let out = "%PDF-1.4\n";
    const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  };

  addEventListener("load", async () => {
    try {
      for (let i = 0; i < 100 && !window.__test?.ready(); i++) await wait(100);
      const T = window.__test;
      const state = () => T.run()?.state || "";
      const until = async (ok, ms = 60000) => { for (let i = 0; i < ms / 250 && !ok(state()); i++) await wait(250); };
      await wait(1200);
      T.lang("en");

      // 1 · Check the AI engine
      T.settings();
      await wait(1500);   // the engine check
      marks([["#engine", 1], ["#o-model", 2], ["#set-theme", 3]]);
      await snap("g1-settings");
      T.closeSettings();

      // 2 · A project
      const pdir = J(dir, "projects");
      await T.createProject("System Design", "#5E5CE6", pdir);
      await T.createProject("Computer Networks", "#30D158", pdir);
      T.home();
      await wait(500);
      T.newProjectDialog();
      await wait(300);
      $("#pj-name").value = "Distributed Systems";
      $("#pj-name").dispatchEvent(new Event("input"));
      await wait(900);   // the dialog's opening animation moves it
      marks([["#pj-name", 1], ["#pj-colors", 2], ["#pj-where", 3]]);
      await snap("g2-project");
      T.closeDialogs();

      // 3 · Documents and options
      T.useProject("System Design");
      T.newPage();
      await wait(400);
      const demo = J(dir, "demo");
      const demoFiles = ["System Design - Section 1.pdf", "System Design - Section 15.pdf", "Week 3 lecture.pptx"];
      for (const n of demoFiles) await write(J(demo, n), 40000);
      await T.setFiles(demoFiles.map((n) => J(demo, n)), "merge");
      await wait(1200);
      marks([["#drop", 1], ["#files", 2], ["#o-mode", 3, "t"], ["#go", 4]]);
      await snap("g3-documents");
      $('#o-lang [data-v="English"]')?.click();
      $("#o-research").closest("label, .toggle, .row, div").setAttribute("data-g", "research");
      window.__scrollTo("#o-format", 60);
      await wait(400);
      marks([["#o-format", 1], ["#o-title", 2], ["#o-lang", 3], ["[data-g=research]", 4]]);
      await snap("g3-options");

      // WBS Map needs an .xlsx
      await write(J(demo, "RoomBook WBS.xlsx"), 12000);
      await T.setFiles([J(demo, demoFiles[0])], "merge");
      await wait(600);
      $('#o-format [data-v="wbs"]').click();
      window.__scrollTo("#o-format", 160);
      await wait(500);
      marks([['#o-format [data-v="wbs"]', 1, "r"], ["#fmt-warn", 2]]);
      await snap("g3-wbs-warn");
      $('#o-format [data-v="tap"]').click();

      // 4 · A run: one notebook per file, the 2nd fails on purpose (fake Claude)
      const bdir = J(dir, "batch");
      const names = ["Week 1 - Intro.pdf", "Week 2 broken scan.pdf", "Week 3 - Caching.pdf"];
      for (const n of names) await write(J(bdir, n), null, pdf(n.replace(/\.pdf$/, "")));
      await T.setFiles(names.map((n) => J(bdir, n)), "separate");
      await wait(900);
      await T.process(bdir);
      await wait(1800);
      marks([[".r-progress", 1], ["#r-controls", 2], ["#r-items", 3], [".r-log", 4]]);
      await snap("g4-run");
      await wait(500);
      await until((s) => s === "done" || s === "failed");
      await wait(900);
      marks([["#r-items .r-item.s-failed", 1], ["#r-controls", 2]]);
      await snap("g4-failed");

      // 5 · The project page, a notebook, quick look
      const h = (await window.api.listHistory()).filter((x) => x.status === "done");
      if (h[0]) await window.api.tagNotebook(h[0].id, ["Caching", "Final exam", "Redis"]);
      if (h[1]) await window.api.tagNotebook(h[1].id, ["Intro", "Final exam"]);
      await T.reload();
      T.project("System Design");
      await wait(900);
      $("#nb-grid .nb-card .nb-acts").style.opacity = "1";   // shown on hover
      marks([["#nb-grid .nb-card", 1], ["#nb-grid .nb-card .nb-acts", 2, "r"], ["#pj-tags", 3], ["#q", 4, "t"]]);
      await snap("g5-project");
      const card = $("#nb-grid .nb-card");
      card?.focus();
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await wait(1500);
      marks([["#pv-tabs", 1, "b"], ["#pv-open", 2, "b"], ["#pv-close", 3]]);
      await snap("g5-preview");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wait(400);
      $("#nb-grid .nb-card")?.click();
      await wait(800);
      marks([["#d-actions", 1], ["#d-tags", 2], ["#d-stats", 3]]);
      await snap("g5-detail");

      // 6 · Tags and search
      $("#d-tags .tag-add")?.click();
      await wait(400);
      marks([["#tg-field", 1], ["#tg-tpl", 2]]);
      await snap("g6-tags");
      T.closeDialogs();
      const q = $("#q");
      q.value = "#final";
      q.dispatchEvent(new Event("input"));
      await wait(500);
      marks([["#q", 1, "t"], ["#history", 2, "t"]]);
      await snap("g6-search");
      q.value = "";
      q.dispatchEvent(new Event("input"));
      log("done");
    } catch (e) {
      log("FAILED " + (e?.stack || e));
    }
    await inv("dev_quit");
  });
})();
