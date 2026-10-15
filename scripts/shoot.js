// Screenshot mode: walks the app through its main states and saves a PNG of each, with real runs
// through the Rust side (fake Claude) and the engine in the window (Mermaid diagrams drawn here).
//   npx tauri build --debug --bundles app
//   STUDYLENS_SHOOT=/tmp/shots STUDYLENS_SCRIPT=scripts/shoot.js STUDYLENS_FAKE_CLAUDE=$PWD/scripts/fake-claude.mjs \
//     src-tauri/target/debug/bundle/macos/StudyLens.app/Contents/MacOS/studylens
// The app keeps its data in <shots>/userdata. Progress and failures print in the terminal ("[page] [shoot] …").
(() => {
  if (window.top !== window) return;
  const dir = window.__SHOOT_DIR;
  const inv = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const log = (m) => inv("dev_log", { msg: "[shoot] " + m });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = async (name) => { await wait(450); await inv("dev_shot", { name }); log("snap " + name); };
  const J = (...a) => a.join(navigator.platform.startsWith("Win") ? "\\" : "/");
  const $ = (s) => document.querySelector(s);

  // A one-page PDF saying `title` (so the source preview has something real to show).
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
      const until = async (ok, ms = 30000) => { for (let i = 0; i < ms / 250 && !ok(state()); i++) await wait(250); };
      await wait(800);
      await snap("01-empty");

      const pdir = J(dir, "projects");
      await T.createProject("System Design", "#5E5CE6", pdir);
      await T.createProject("Mạng máy tính", "#30D158", pdir);
      await wait(300);
      await snap("02-home");

      // A run of three, one notebook each; the 2nd fails on purpose; pause, then continue.
      T.useProject("System Design");
      T.newPage();
      await wait(400);
      const bdir = J(dir, "batch");
      const names = ["Week 1 - Intro.pdf", "Week 2 broken scan.pdf", "Week 3 - Caching.pdf"];
      for (const n of names) await inv("dev_write", { path: J(bdir, n), text: pdf(n.replace(/\.pdf$/, "")) });
      await T.setFiles(names.map((n) => J(bdir, n)), "separate");
      await wait(900);
      await snap("03-files");
      await T.process(bdir);
      await wait(1800);
      await snap("04-running");
      await T.act("pause");
      await until((s) => s === "paused");
      await wait(400);
      await snap("05-paused");
      await T.act("resume");
      await until((s) => s === "done" || s === "failed", 60000);
      await wait(800);
      await snap("06-finished");
      log(`batch run: ${state()} · ${T.run().items.map((i) => i.status).join(",")}`);

      // Deep Brief: the diagram is drawn by Mermaid in this window.
      T.newPage();
      await wait(400);
      $('#o-format [data-v="brief"]').click();
      await inv("dev_write", { path: J(bdir, "Brief doc.pdf"), text: pdf("Brief doc") });
      await T.setFiles([J(bdir, "Brief doc.pdf")], "merge");
      await wait(600);
      await T.process(bdir);
      await wait(1000);
      await until((s) => s === "done" || s === "failed", 60000);
      await wait(800);
      const b = T.run().items[0];
      log(`brief run: ${state()} · ${b.error || "ok"} · diagrams ${b.articles} · ${b.output}`);
      await snap("07-brief-done");
      $('#o-format [data-v="tap"]')?.click();

      // The project page, then quick look: the notebook, then its source PDF.
      T.project("System Design");
      await wait(900);
      await snap("08-project");
      const card = $("#nb-grid .nb-card");
      card?.focus();
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await wait(1800);
      await snap("09-preview-notebook");
      document.querySelectorAll("#pv-tabs .pv-tab")[1]?.click();
      await wait(1500);
      await snap("10-preview-source");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wait(500);

      // Settings, themes, English.
      T.settings();
      await wait(500);
      await snap("11-settings");
      $('#set-theme [data-v="dark"]')?.click();
      await wait(600);
      await snap("12-dark");
      $('#set-theme [data-v="light"]')?.click();
      await wait(600);
      await snap("13-light");
      T.lang("en");
      await wait(400);
      await snap("14-settings-en");
      T.closeSettings();
      T.home();
      await wait(600);
      await snap("15-home-en");
      $('#set-theme [data-v="system"]')?.click();
      log("done");
    } catch (e) {
      log("FAILED " + (e?.stack || e));
    }
    await inv("dev_quit");
  });
})();
