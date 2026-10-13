// StudyLens UI. Sidebar: notebooks and runs. Pages: "new" (files + options → Process), "run" (live
// progress, controls and log of one run, current or past) and "detail" (one notebook).
(function () {
  const api = window.api;
  const $ = (id) => document.getElementById(id);
  const ACCEPT = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "md", "markdown", "txt", "html", "htm", "csv", "json", "docx", "pptx", "xlsx"];

  if (new URLSearchParams(location.search).get("platform") === "darwin") document.body.classList.add("mac");

  // ---------- Icons (SF Symbols look, 1.7 stroke) ----------
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
    spark: '<path d="M12 4c.5 4.6 2.4 7.5 7 8-4.6.5-6.5 3.4-7 8-.5-4.6-2.4-7.5-7-8 4.6-.5 6.5-3.4 7-8Z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
    lens: '<path d="M6 3.5h7.5A1.5 1.5 0 0 1 15 5v3"/><path d="M4.5 5v13.5A1.5 1.5 0 0 0 6 20h5"/><path d="M8 8h4M8 11.5h2.5"/><circle cx="15.5" cy="15" r="4"/><path d="m18.5 18 2.5 2.5"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    open: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>',
    redo: '<path d="M20 11a8 8 0 1 0-2.3 5.6"/><path d="M20 4v7h-7"/>',
    trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    work: '<path d="M4 7.5h16v11H4z"/><path d="M9 7.5V5h6v2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
    restart: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    merge: '<rect x="3" y="3.5" width="6" height="7" rx="1.3"/><rect x="3" y="13.5" width="6" height="7" rx="1.3"/><path d="M9 7h2.2a1.8 1.8 0 0 1 1.8 1.8V15.2a1.8 1.8 0 0 1-1.8 1.8H9M13 12h1.5"/><rect x="15" y="7.5" width="6" height="9" rx="1.3"/>',
    split: '<rect x="3.5" y="5" width="7" height="14" rx="1.5"/><rect x="13.5" y="5" width="7" height="14" rx="1.5"/>',
    pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none"/>',
    play: '<path d="M8 5.8v12.4a1 1 0 0 0 1.5.86l10-6.2a1 1 0 0 0 0-1.72l-10-6.2A1 1 0 0 0 8 5.8Z" fill="currentColor" stroke="none"/>',
    skip: '<path d="M6 6.5v11l8-5.5Z" fill="currentColor" stroke="none"/><path d="M17.5 6v12"/>',
    list: '<path d="M8.5 7h11M8.5 12h11M8.5 17h11"/><circle cx="4.8" cy="7" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17" r=".9" fill="currentColor"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 16v2.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    warn: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  function paintIcons(root) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      if (el.dataset.painted) return;
      el.dataset.painted = "1";
      el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    });
  }
  paintIcons(document);

  // ---------- i18n ----------
  let lang = "vi";
  // A key with a ".one" variant uses it when the count (n, or slides) is 1.
  const plural = (key, vars) => ((vars.n === 1 || vars.slides === 1) && I18N[lang][key + ".one"] != null ? key + ".one" : key);
  const t = (key, vars = {}) => String((I18N[lang] && I18N[lang][plural(key, vars)]) ?? I18N.vi[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  const loc = () => (lang === "en" ? "en-US" : "vi-VN");
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  }

  // ---------- State ----------
  let files = [];          // [{path, name, ext, size, status, title?, titleEdited?}]
  let settings = null;
  let claudeOk = false;
  let history = [];
  let runs = [];           // every run, newest first (from main, live via onRun)
  let sideTab = "notes";
  let page = "new", selected = null;
  const running = false;   // the setup page itself is never locked; runs live on their own page
  const busyRun = () => runs.find((r) => r.state === "running");

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const extOf = (p) => (p.split(".").pop() || "").toLowerCase();
  const nameOf = (p) => p.split(/[\\/]/).pop();
  const fmtSize = (n) => (n == null ? "" : n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const fmtDur = (s) => (s >= 3600 ? Math.floor(s / 3600) + "h " : "") + Math.floor((s % 3600) / 60) + ":" + String(s % 60).padStart(2, "0");
  const TINTS = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF453A", "#FF9F0A", "#E5B000", "#30D158", "#00C7BE", "#40C8E0"];
  const tintFor = (s) => TINTS[[...s].reduce((a, c) => (a + c.codePointAt(0)) | 0, 0) % TINTS.length];
  function initials(name) {
    const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const two = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
    return two || "?";
  }
  function tileHTML(title, cls = "") {
    const c = tintFor(title);
    return `<span class="tile ${cls}" style="background:linear-gradient(160deg, ${c}, color-mix(in srgb, ${c} 70%, #000))">${esc(initials(title))}</span>`;
  }
  function ago(iso) {
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return t("ago.now");
    if (s < 3600) return t("ago.min", { n: Math.floor(s / 60) });
    if (s < 86400) return t("ago.hour", { n: Math.floor(s / 3600) });
    if (s < 7 * 86400) return t("ago.day", { n: Math.floor(s / 86400) });
    return d.toLocaleDateString(loc());
  }

  // ---------- Pages ----------
  function show(p, id) {
    const changed = p !== page || (id || null) !== selected;
    page = p; selected = id || null;
    if (changed) {
      const el = $(p === "new" ? "page-new" : p === "run" ? "page-run" : "page-detail");
      el.classList.remove("enter");
      void el.offsetWidth;
      el.classList.add("enter");
      clearTimeout(show.t);
      show.t = setTimeout(() => el.classList.remove("enter"), 700);
    }
    $("page-new").hidden = p !== "new";
    $("page-detail").hidden = p !== "detail";
    $("page-run").hidden = p !== "run";
    $("nav-new").classList.toggle("on", p === "new");
    if (p === "new") { $("page-title").textContent = t("page.new"); $("page-sub").textContent = ""; renderActiveRun(); renderRecentRuns(); }
    if (p === "run" && sideTab !== "runs") { sideTab = "runs"; setSeg("side-tab", "runs"); }
    renderHistory();
    if (p === "detail") renderDetail();
    if (p === "run") renderRun(changed);
  }
  $("nav-new").addEventListener("click", () => show("new"));
  $("btn-new-top").addEventListener("click", () => show("new"));

  // ---------- Sidebar ----------
  async function loadHistory() {
    history = await api.listHistory();
    renderHistory();
    historyLoaded = true;
    if (page === "detail") renderDetail();
  }
  const knownIds = new Set();
  let historyLoaded = false;
  function setTab(tab) {
    sideTab = tab;
    setSeg("side-tab", tab);
    renderHistory();
  }
  $("side-tab").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b.dataset.v !== sideTab) setTab(b.dataset.v);
  });
  function renderHistory() {
    if (sideTab === "runs") return renderRunList();
    $("history-empty").textContent = t("nav.empty");
    const q = $("q").value.trim().toLowerCase();
    const list = history.filter((h) => !q || h.title.toLowerCase().includes(q) || h.files.some((f) => nameOf(f).toLowerCase().includes(q)));
    const box = $("history");
    box.textContent = "";
    for (const h of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "side-item" + (page === "detail" && selected === h.id ? " on" : "");
      b.dataset.id = h.id;
      if (!knownIds.has(h.id)) {
        b.classList.add(historyLoaded ? "fresh" : "enter");
        b.style.setProperty("--i", box.children.length);
        knownIds.add(h.id);
        b.addEventListener("animationend", (e) => { if (e.animationName === "sideIn") b.classList.remove("enter"); });
      }
      const sub = h.status === "done" ? t("d.sub", { ago: ago(h.startedAt), slides: h.slides, articles: h.articles }) : t("d.subFail", { ago: ago(h.startedAt) });
      const st = h.status === "failed" ? "failed" : h.exists ? "" : "gone";
      b.innerHTML = `${tileHTML(h.title)}<span class="txt"><b></b><small></small></span><span class="st ${st}"></span>`;
      b.querySelector("b").textContent = h.title;
      b.querySelector("small").textContent = sub;
      b.title = h.output || h.error || "";
      b.addEventListener("click", () => show("detail", h.id));
      box.appendChild(b);
    }
    $("history-empty").hidden = history.length > 0;
  }
  // Runs tab: state icon, progress, last change.
  const doneCount = (r) => r.items.filter((x) => x.status === "done").length;
  function stateIcon(state) {
    return state === "running" ? '<span class="r-spin"></span>' : icon({ paused: "pause", stopped: "stop", done: "check", failed: "x" }[state]);
  }
  function renderRunList() {
    const q = $("q").value.trim().toLowerCase();
    const list = runs.filter((r) => !q || r.title.toLowerCase().includes(q) || r.items.some((x) => x.title.toLowerCase().includes(q)));
    const box = $("history");
    box.textContent = "";
    for (const r of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "side-item run-row s-" + r.state + (page === "run" && selected === r.id ? " on" : "");
      b.dataset.id = r.id;
      const n = r.items.length, d = doneCount(r);
      b.innerHTML = `<span class="tile run-tile s-${r.state}">${stateIcon(r.state)}</span><span class="txt"><b></b><small></small><span class="mini-bar"><i style="--p:${n ? d / n : 0}"></i></span></span>`;
      b.querySelector("b").textContent = r.title;
      b.querySelector("small").textContent = `${t("rs." + r.state)} · ${t("r.progress", { done: d, n })} · ${ago(new Date(r.updatedAt).toISOString())}`;
      b.addEventListener("click", () => show("run", r.id));
      box.appendChild(b);
    }
    $("history-empty").textContent = t("nav.emptyRuns");
    $("history-empty").hidden = runs.length > 0;
  }
  $("q").addEventListener("input", renderHistory);

  // ---------- Detail ----------
  function renderDetail() {
    const h = history.find((x) => x.id === selected);
    if (!h) { show("new"); return; }
    $("page-title").textContent = h.title;
    $("page-sub").textContent = h.status === "done" ? (h.exists ? t("d.created", { ago: ago(h.startedAt) }) : t("d.gone")) : t("d.failed");
    $("d-tile").outerHTML = tileHTML(h.title, "big").replace('class="tile big"', 'class="tile big" id="d-tile"');
    $("d-title").textContent = h.title;
    $("d-sub").textContent = h.output || h.workDir;
    const acts = $("d-actions");
    acts.textContent = "";
    const add = (label, ic, fn, cls = "", disabled = false) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn " + cls; b.disabled = disabled;
      b.innerHTML = icon(ic) + `<span>${esc(label)}</span>`;
      b.addEventListener("click", fn);
      acts.appendChild(b);
    };
    if (h.status === "done") {
      add(t("run.open"), "open", () => api.openPath(h.output), "prominent", !h.exists);
      add(revealLabel(), "folder", () => api.revealPath(h.output), "", !h.exists);
    } else {
      add(t("run.workDir"), "work", () => api.openPath(h.workDir));
    }
    if (h.runId && runs.some((r) => r.id === h.runId)) add(t("ar.view"), "list", () => show("run", h.runId));
    add(t("run.retry"), "redo", () => rerun(h));
    add(t("d.remove"), "trash", () => confirmRemove(h), "danger");

    const stats = h.status === "done"
      ? [[t("d.slides"), h.slides], [t("d.articles"), h.articles], [t("d.time"), fmtDur(h.seconds)], [t("d.cost"), "$" + (h.costUsd || 0).toFixed(2)]]
      : [[t("d.status"), t("d.error")], [t("d.time"), fmtDur(h.seconds)], [t("d.files"), h.files.length], [t("d.model"), h.options.model || t("d.defaultModel")]];
    $("d-stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v"${typeof v === "number" ? ` data-count="${v}"` : ""}>${esc(typeof v === "number" ? 0 : v)}</div></div>`).join("");
    countUp($("d-stats"));
    $("d-error-card").hidden = !h.error;
    $("d-error").textContent = h.error || "";
    $("d-files-count").textContent = t("files.count", { n: h.files.length });
    $("d-files").innerHTML = h.files.map((f) => `<li title="${esc(f)}">${docGlyph(extOf(f))}<span class="name"><b>${esc(nameOf(f))}</b><small>${esc(f.replace(/[\\/][^\\/]*$/, ""))}</small></span></li>`).join("");
    const o = h.options;
    $("d-opts").innerHTML = [
      [t("d.model"), o.model || t("d.defaultModel")],
      [t("d.optLang"), o.lang],
      [t("d.optResearch"), o.research ? t("d.yes") : t("d.no")],
      [t("d.optSaveTo"), o.outputDir || t("opts.sameDir")],
      [t("d.optStarted"), new Date(h.startedAt).toLocaleString(loc())],
    ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  }
  // Numbers in the stat cards count up from 0 (ease-out, ~0.7 s).
  function countUp(root) {
    const els = [...root.querySelectorAll("[data-count]")];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { els.forEach((e) => (e.textContent = e.dataset.count)); return; }
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
      els.forEach((e) => (e.textContent = Math.round(+e.dataset.count * ease).toLocaleString(loc())));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function rerun(h) {
    files = [];
    renderFiles();
    addPaths(h.files);
    titleAuto = !h.options.title;
    $("o-title").value = h.options.title || "";
    setSeg("o-lang", h.options.lang || "Tiếng Việt");
    $("o-research").checked = !!h.options.research;
    show("new");
  }
  // One confirm dialog for every destructive action.
  function confirmDialog(title, text, okLabel, onOk) {
    $("cf-title").textContent = title;
    $("cf-text").textContent = text;
    $("cf-ok").textContent = okLabel;
    const dlg = $("dlg-confirm");
    dlg.returnValue = "";
    dlg.onclose = () => { if (dlg.returnValue === "ok") onOk(); };
    dlg.showModal();
  }
  // Dialogs play a short exit animation before closing (form submit, Esc and backdrop clicks included).
  function closeDialog(dlg, value = "") {
    if (!dlg.open || dlg.classList.contains("closing")) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return dlg.close(value);
    dlg.classList.add("closing");
    dlg.addEventListener("animationend", () => { dlg.classList.remove("closing"); dlg.close(value); }, { once: true });
  }
  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(dlg, "cancel"); });
    dlg.addEventListener("submit", (e) => { e.preventDefault(); closeDialog(dlg, e.submitter?.value || ""); });
  });
  function confirmRemove(h) {
    confirmDialog(t("cf.title"), t("cf.text", { title: h.title }), t("cf.ok"), async () => {
      await api.removeHistory(h.id);
      show("new");
      const row = document.querySelector(`.side-item[data-id="${CSS.escape(h.id)}"]`);
      if (!row) return loadHistory();
      row.classList.add("leave");
      row.addEventListener("animationend", () => { knownIds.delete(h.id); loadHistory(); }, { once: true });
    });
  }
  // Restart: straight away when idle; a run in progress would be cancelled, so ask first.
  $("btn-restart").addEventListener("click", () => {
    if (!busyRun()) return api.restart();
    confirmDialog(t("app.restartTitle"), t("app.restartBusy"), t("app.restartOk"), () => api.restart());
  });

  // ---------- AI engine status (shown in Settings; the main screen only says "AI ready / not connected") ----------
  let aiInfo = null;   // null = checking
  const revealLabel = () => t(navigator.platform.startsWith("Mac") ? "run.reveal" : "run.revealWin");
  function paintAI() {
    const st = aiInfo == null ? "checking" : aiInfo.found ? "ok" : "bad";
    const side = $("ai-state");
    const cls = st === "checking" ? "is-checking" : st;   // not ".checking": that class is the file-row shimmer bar
    side.className = "ai-state " + cls;
    side.querySelector(".lbl").textContent = st === "checking" ? "" : t(st === "ok" ? "nav.aiOk" : "nav.aiBad");
    side.setAttribute("aria-label", t(st === "ok" ? "nav.aiOk" : st === "bad" ? "nav.aiBad" : "nav.aiChecking"));
    const pill = $("eng-status");
    pill.className = "status-pill " + cls;
    pill.querySelector(".lbl").textContent = st === "checking" ? "" : t(st === "ok" ? "set.ok" : "set.bad");
    pill.setAttribute("aria-label", t(st === "ok" ? "set.ok" : st === "bad" ? "set.bad" : "set.checking"));
    $("eng-check").classList.toggle("busy", st === "checking");
    $("eng-version").textContent = aiInfo?.version ? aiInfo.version.replace(/\s*\(Claude Code\)/, "") : "—";
    $("eng-path").textContent = aiInfo?.path || "—";
    $("eng-err").hidden = st !== "bad";
    $("eng-err").textContent = aiInfo?.error || "";
    $("eng-check").disabled = st === "checking";
  }
  async function checkAI() {
    aiInfo = null;
    paintAI();
    const [info] = await Promise.all([api.claudeInfo(), new Promise((r) => setTimeout(r, 400))]);
    aiInfo = info;
    claudeOk = info.found;
    paintAI();
    refresh();
  }
  const dlgSet = $("dlg-settings");
  $("btn-settings").addEventListener("click", () => dlgSet.showModal());
  $("no-ai").addEventListener("click", () => $("btn-settings").click());
  $("set-close").addEventListener("click", () => closeDialog(dlgSet));
  dlgSet.addEventListener("click", (e) => { if (e.target === dlgSet) closeDialog(dlgSet); });   // click on the backdrop
  $("eng-check").addEventListener("click", checkAI);
  // Interface language: the header switch and the one in Settings are the same setting.
  for (const id of ["hdr-lang"]) {
    $(id).addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || b.dataset.v === lang) return;
      settings = await api.saveSettings({ uiLang: b.dataset.v });
      setLang(settings.uiLang);
    });
  }
  function setLang(l) {
    const swap = booted && (l === "en" ? "en" : "vi") !== lang;
    lang = l === "en" ? "en" : "vi";
    if (swap) {
      const a = document.querySelector(".app");
      a.classList.remove("lang-swap");
      void a.offsetWidth;
      a.classList.add("lang-swap");
      setTimeout(() => a.classList.remove("lang-swap"), 350);
    }
    setSeg("hdr-lang", lang);
    applyI18n();
    paintAI();
    paintUpdate();
    showDir();
    setDropTitle();
    renderFiles();
    show(page, selected);
  }

  // ---------- Files ----------
  // Rows are keyed by path so only rows that were just added animate in; each new
  // file is checked on disk (exists + real size) and gets a check mark when it passes.
  const rows = new Map();
  const docGlyph = (ext) => `<span class="fdoc" data-k="${esc(ext)}"><b>${esc(ext.slice(0, 4))}</b></span>`;

  async function addPaths(list, at) {
    const bad = [], added = [];
    for (const it of list) {
      const p = typeof it === "string" ? it : it.path;
      if (!p) continue;
      const ext = extOf(p);
      if (!ACCEPT.includes(ext)) { bad.push(nameOf(p)); continue; }
      if (files.some((f) => f.path === p)) continue;
      const f = { path: p, name: nameOf(p), ext, size: typeof it === "string" ? null : it.size, status: "checking", fresh: true };
      files.push(f); added.push(f);
    }
    if (bad.length) alert(t("files.unsupported", { names: bad.join(", ") }));
    if (!added.length) return;
    land(at);
    renderFiles();
    const stats = await api.statFiles(added.map((f) => f.path));
    await new Promise((r) => setTimeout(r, 350));   // let the row finish sliding in before the check pops
    for (const st of stats) {
      const f = files.find((x) => x.path === st.path);
      if (!f) continue;
      f.status = st.ok ? "ok" : "missing";
      if (st.ok) f.size = st.size;
      fillRow(rows.get(f.path), f);
    }
    refresh();
  }

  function fillRow(li, f) {
    if (!li) return;
    const meta = f.status === "checking" ? `<span class="checking"></span>`
      : f.status === "missing" ? esc(t("files.unreadable"))
      : `<span class="ok">${icon("check")}</span>${esc(fmtSize(f.size))} · ${esc(f.ext.toUpperCase())}`;
    li.querySelector(".name small").className = f.status === "missing" ? "bad" : "";
    li.querySelector(".name small").innerHTML = meta;
  }

  function makeRow(f) {
    const li = document.createElement("li");
    li.innerHTML = `${docGlyph(f.ext)}<span class="name"><b></b><small></small></span><span></span><button class="rm" type="button" aria-label="${esc(t("files.remove"))}">${icon("x")}</button>`;
    li.querySelector(".name b").textContent = f.name;
    li.title = f.path;
    li.querySelector(".rm").addEventListener("click", () => removeFile(f.path));
    li.addEventListener("dragstart", (e) => { li.classList.add("dragging"); e.dataTransfer.setData("text/x-path", f.path); e.dataTransfer.effectAllowed = "move"; });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/x-path")) e.preventDefault(); });
    li.addEventListener("drop", (e) => {
      const from = e.dataTransfer.getData("text/x-path");
      if (!from || from === f.path) return;
      e.preventDefault(); e.stopPropagation();
      const a = files.findIndex((x) => x.path === from);
      const [m] = files.splice(a, 1);
      files.splice(files.findIndex((x) => x.path === f.path), 0, m);
      renderFiles();
    });
    li.addEventListener("animationend", (e) => { if (e.animationName === "rowIn") li.classList.remove("enter"); });
    rows.set(f.path, li);
    return li;
  }

  function removeFile(path) {
    const li = rows.get(path);
    const done = () => { files = files.filter((f) => f.path !== path); rows.delete(path); li?.remove(); renderFiles(); };
    if (!li || matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    li.classList.add("leave");
    li.addEventListener("animationend", done, { once: true });
  }

  // ---------- Auto notebook name from the file names ----------
  // Stays automatic until the user types their own name; clearing the field turns it back on.
  let titleAuto = true;
  function cleanName(p) {
    let n = nameOf(p).replace(/\.[^.]+$/, "");
    try { n = decodeURIComponent(n); } catch { /* keep as is */ }
    return n.replace(/[+_]+/g, " ").replace(/\s+/g, " ").replace(/\s*-\s*/g, " - ").trim();
  }
  function autoTitle() {
    const names = files.map((f) => cleanName(f.path)).filter(Boolean);
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    // Same series ("… Section 1", "… Section 15"): shared words + the differing tails.
    const words = names.map((n) => n.split(" "));
    let k = 0;
    while (words.every((w) => k < w.length - 1 && w[k].toLowerCase() === words[0][k].toLowerCase())) k++;
    const tails = words.map((w) => w.slice(k).join(" "));
    const head = words[0].slice(0, k).join(" ").replace(/[\s\-–·:]+$/, "");
    if (k >= 2 && tails.every((tl) => tl.split(" ").length <= 3)) return `${head} ${tails.join(", ")}`.slice(0, 90);
    // Long tails that still start with a short marker ("1 …", "2 - …"): keep just the markers.
    const marks = tails.map((tl) => tl.split(" ")[0]);
    if (k >= 2 && marks.every((m) => /^[\p{L}\p{N}.]{1,4}$/u.test(m))) return `${head} ${marks.join(", ")}`.slice(0, 90);
    if (k >= 2) return head;
    return t("opts.moreDocs", { name: names[0], n: names.length - 1 });
  }
  // Output mode with 2+ files: "merge" = one notebook, "separate" = one notebook per file.
  let outMode = "merge";
  const separate = () => outMode === "separate" && files.length >= 2;
  // One notebook per file: one name field per file, filled from its file name and editable.
  function renderNames() {
    const ol = $("names");
    const on = separate();
    ol.hidden = !on;
    $("o-title").hidden = on;
    $("name-label").textContent = t(on ? "opts.names" : "opts.name");
    if (!on) return;
    const keep = new Map([...ol.children].map((li) => [li.dataset.path, li]));
    files.forEach((f, i) => {
      if (!f.titleEdited) f.title = cleanName(f.path);
      let li = keep.get(f.path);
      if (!li) {
        li = document.createElement("li");
        li.dataset.path = f.path;
        li.innerHTML = `<span class="n-idx"></span>${docGlyph(f.ext)}<input type="text">`;
        const inp = li.querySelector("input");
        inp.addEventListener("input", () => {
          f.titleEdited = inp.value.trim() !== "";
          f.title = f.titleEdited ? inp.value : cleanName(f.path);
          li.classList.toggle("edited", f.titleEdited);
        });
        inp.addEventListener("blur", () => { if (!f.titleEdited) inp.value = f.title; });
        li.classList.add("enter");
        li.style.setProperty("--i", i);
      }
      li.querySelector(".n-idx").textContent = i + 1;
      const inp = li.querySelector("input");
      inp.setAttribute("aria-label", t("opts.names") + " " + (i + 1));
      inp.placeholder = cleanName(f.path);
      if (document.activeElement !== inp) inp.value = f.title;
      li.classList.toggle("edited", !!f.titleEdited);
      ol.appendChild(li);
      keep.delete(f.path);
    });
    keep.forEach((li) => li.remove());
    $("title-auto").hidden = false;
  }
  function applyAutoTitle() {
    const input = $("o-title");
    renderNames();
    if (separate()) return;
    if (!titleAuto) return;
    const next = autoTitle();
    $("title-auto").hidden = !next;
    if (input.value === next) return;
    input.value = next;
    input.classList.remove("filled");
    void input.offsetWidth;
    if (next) input.classList.add("filled");
  }
  $("o-title").addEventListener("input", (e) => {
    titleAuto = e.target.value.trim() === "";
    $("title-auto").hidden = true;
    if (titleAuto) applyAutoTitle();
  });

  function renderFiles() {
    const ol = $("files");
    for (const [p, li] of rows) if (!files.some((f) => f.path === p)) { li.remove(); rows.delete(p); }
    let n = 0;
    for (const f of files) {
      let li = rows.get(f.path);
      if (!li) {
        li = makeRow(f);
        if (f.fresh) { li.classList.add("enter", "fresh"); li.style.setProperty("--i", n++); }
      }
      li.draggable = !running;
      li.querySelector(".rm").disabled = running;
      fillRow(li, f);
      ol.appendChild(li);          // appendChild moves existing rows into the current order
      f.fresh = false;
    }
    ol.hidden = !files.length;
    $("files-hint").hidden = files.length < 2;
    $("files-hint").textContent = t(separate() ? "files.hintSeparate" : "files.hint");
    $("out-mode").hidden = files.length < 2;
    $("files-count").textContent = files.length ? t("files.count", { n: files.length }) : "";
    $("card-files").classList.toggle("has-files", files.length > 0);
    applyAutoTitle();
    setDropTitle();
    refresh();
  }

  const drop = $("drop");
  const title = drop.querySelector(".drop-title");
  // Size the dashed edge in pixels: Chromium does not re-lay out a % sized <rect> when the zone shrinks.
  const antRect = drop.querySelector(".ants rect");
  new ResizeObserver(() => {
    const w = drop.clientWidth, h = drop.clientHeight;
    const r = parseFloat(getComputedStyle(drop).borderTopLeftRadius) || 10;
    Object.entries({ x: 0.75, y: 0.75, width: Math.max(0, w - 1.5), height: Math.max(0, h - 1.5), rx: r - 0.5 }).forEach(([k, v]) => antRect.setAttribute(k, v));
  }).observe(drop);
  function setDropTitle() {
    title.textContent = t(drop.classList.contains("over") ? "files.dropOver" : files.length ? "files.dropMore" : "files.dropIdle");
  }
  // Landing feedback: a ring spreads from where the files were dropped (or the centre).
  function land(at) {
    const r = drop.getBoundingClientRect();
    const x = at && at.x >= r.left && at.x <= r.right ? at.x - r.left : r.width / 2;
    const y = at && at.y >= r.top && at.y <= r.bottom ? at.y - r.top : r.height / 2;
    const ripple = drop.querySelector(".ripple");
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    drop.classList.remove("landed");
    void drop.offsetWidth;
    drop.classList.add("landed");
    clearTimeout(land.t);
    land.t = setTimeout(() => drop.classList.remove("landed"), 750);
  }
  const pick = async () => { if (!running) addPaths(await api.pickFiles()); };
  drop.addEventListener("click", pick);
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  document.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || running) return;
    e.preventDefault();
    dragDepth++;
    if (page !== "new") show("new");
    drop.classList.add("over");
    setDropTitle();
  });
  document.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove("over"); setDropTitle(); }
  });
  document.addEventListener("drop", (e) => {
    dragDepth = 0;
    drop.classList.remove("over");
    setDropTitle();
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    if (running) return;
    addPaths([...e.dataTransfer.files].map((f) => ({ path: api.pathForFile(f), size: f.size })), { x: e.clientX, y: e.clientY });
  });

  // ---------- Options ----------
  function setSeg(id, v) {
    $(id).querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-checked", String(b.dataset.v === v)); b.setAttribute("role", "radio"); });
    placeThumb($(id));
  }
  // The selected segment is a pill drawn behind the buttons (.seg::before) that slides to the new option.
  function placeThumb(seg, instant) {
    const on = seg.querySelector("button.on");
    if (instant) seg.classList.add("no-anim");
    if (!on || !on.offsetWidth) seg.style.setProperty("--o", on ? "1" : "0");
    if (on && on.offsetWidth) {
      seg.style.setProperty("--x", on.offsetLeft + "px");
      seg.style.setProperty("--w", on.offsetWidth + "px");
      seg.style.setProperty("--o", "1");
    }
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => seg.classList.remove("no-anim")));
  }
  // Re-measure without animating when a segment's size changes (window resize, dialog opening, language swap).
  const segObserver = new ResizeObserver((entries) => entries.forEach((e) => placeThumb(e.target, true)));
  document.querySelectorAll(".seg").forEach((s) => segObserver.observe(s));
  const segVal = (id) => $(id).querySelector("button.on")?.dataset.v ?? "";
  $("o-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || running || b.dataset.v === outMode) return;
    outMode = b.dataset.v;
    setSeg("o-mode", outMode);
    api.saveSettings({ outMode });
    renderFiles();
  });
  for (const [id, key] of [["o-lang", "lang"]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || running) return;
      setSeg(id, b.dataset.v);
      api.saveSettings({ [key]: b.dataset.v });
    });
  }
  function showDir() {
    $("o-dir").textContent = settings.outputDir || t("opts.sameDir");
    $("o-dir").title = settings.outputDir || "";
    $("o-dir-reset").hidden = !settings.outputDir;
  }
  $("o-dir-pick").addEventListener("click", async () => {
    const d = await api.pickDir();
    if (d) { settings = await api.saveSettings({ outputDir: d }); showDir(); }
  });
  $("o-dir-reset").addEventListener("click", async () => { settings = await api.saveSettings({ outputDir: "" }); showDir(); });
  $("o-research").addEventListener("change", (e) => api.saveSettings({ research: e.target.checked }));

  function refresh() {
    const busy = !!busyRun();
    $("go").disabled = busy || !claudeOk || !files.length || files.some((f) => f.status === "checking");
    $("go").title = busy ? t("run.busy") : "";
    $("no-ai").hidden = claudeOk || aiInfo == null;
  }

  // ---------- Runs ----------
  // Main owns the runs (persisted, resumable); this page only renders the snapshots it sends
  // (onRun) and the live ticks (activity line, log lines).
  const STEPS = ["prepare", "write", "check", "assemble"];
  let viewLogItem = null;      // item whose log the run page shows
  let logOpen = true;
  const activity = new Map();  // itemId → latest "AI is writing…" line
  const fmtMs = (ms) => fmtDur(Math.max(0, Math.round(ms / 1000)));
  const itemElapsed = (it) => it.elapsedMs + (it.activeSince ? Date.now() - it.activeSince : 0);
  const runElapsed = (r) => r.items.reduce((a, it) => a + itemElapsed(it), 0);
  const runCost = (r) => r.items.reduce((a, it) => a + (it.costUsd || 0), 0);
  const money = (v) => "$" + (v || 0).toFixed(2);
  const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  const stepIndex = (it) => Math.max(0, STEPS.indexOf(it.stage === "fix" ? "check" : it.stage || "prepare"));
  function runProgress(r) {
    // Finished items count fully; an item in progress counts by the step it reached.
    let p = 0;
    for (const it of r.items) {
      if (it.status === "done" || it.status === "failed" || it.status === "skipped") p += 1;
      else if (it.status !== "waiting") p += stepIndex(it) / STEPS.length;
    }
    return r.items.length ? p / r.items.length : 0;
  }
  function itemMeta(it) {
    if (it.status === "done") return `${t("q.meta", { slides: it.slides, articles: it.articles })} · ${fmtMs(it.elapsedMs)} · ${money(it.costUsd)}`;
    if (it.status === "failed") return it.error || "";
    if (it.status === "waiting") return t("r.waitingNote");
    if (!it.elapsedMs && !it.activeSince) return "";
    return `${fmtMs(itemElapsed(it))} · ${money(it.costUsd)}${it.attempts > 1 ? " · " + t("r.attempt", { n: it.attempts }) : ""}`;
  }

  async function refreshRuns() { runs = await api.listRuns(); updateRunsBadge(); }
  function updateRunsBadge() {
    const live = runs.filter((r) => r.state === "running" || r.state === "paused").length;
    $("runs-badge").hidden = !live;
    $("runs-badge").textContent = live;
  }

  // Setup page: the run in progress (or paused) as a card under Process.
  function renderActiveRun() {
    const r = runs.find((x) => x.state === "running") || runs.find((x) => x.state === "paused");
    const card = $("active-run");
    card.hidden = !r;
    $("idle").hidden = !!r;
    if (!r) return;
    card.className = "active-run s-" + r.state;
    card.innerHTML = `<span class="tile run-tile s-${r.state}">${stateIcon(r.state)}</span>
      <span class="ar-txt"><small>${esc(t("ar.title"))} · ${esc(t("rs." + r.state))}</small><b></b>
      <span class="mini-bar"><i style="--p:${runProgress(r)}"></i></span><small>${esc(t("r.progress", { done: doneCount(r), n: r.items.length }))}</small></span>
      <span class="ar-go">${esc(t("ar.view"))}${icon("chev")}</span>`;
    card.querySelector("b").textContent = r.title;
    card.onclick = () => show("run", r.id);
  }
  // Setup page: the last few runs, one click away.
  function renderRecentRuns() {
    const active = runs.find((x) => x.state === "running") || runs.find((x) => x.state === "paused");
    const list = runs.filter((r) => r !== active).slice(0, 5);
    $("recent-runs").hidden = !list.length;
    $("card-run").classList.toggle("has-recent", list.length > 0);
    const box = $("rr-list");
    box.textContent = "";
    list.forEach((r, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rr-row";
      b.style.setProperty("--i", i);
      b.innerHTML = `<span class="tile run-tile s-${r.state}">${stateIcon(r.state)}</span><span class="txt"><b></b><small></small></span><span class="rr-st s-${r.state}">${esc(t("rs." + r.state))}</span>`;
      b.querySelector("b").textContent = r.title;
      b.querySelector("small").textContent = `${t("r.progress", { done: doneCount(r), n: r.items.length })} · ${ago(new Date(r.updatedAt).toISOString())}`;
      b.addEventListener("click", () => show("run", r.id));
      box.appendChild(b);
    });
  }
  $("rr-all").addEventListener("click", () => setTab("runs"));

  // Run page: header, overview (progress, stats, controls), one card per notebook, log.
  function renderRun(full) {
    const r = runs.find((x) => x.id === selected);
    const view = $("run-view");
    if (!r) { view.innerHTML = ""; return; }
    $("page-title").textContent = r.title;
    $("page-sub").textContent = t("rs." + r.state);
    if (!viewLogItem || !r.items.some((x) => x.id === viewLogItem)) {
      viewLogItem = (r.items.find((x) => x.status === "running") || [...r.items].reverse().find((x) => x.workDir) || r.items[0]).id;
    }
    const n = r.items.length;
    const model = r.options.model ? r.options.model[0].toUpperCase() + r.options.model.slice(1) : t("d.defaultModel");
    const sub = t("r.sub", {
      files: t("r.files", { n: r.items.reduce((a, x) => a + x.files.length, 0) }),
      mode: t(r.mode === "separate" ? "files.separate" : "files.merge"),
      model,
      at: new Date(r.createdAt).toLocaleString(loc(), { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
    });
    const prog = runProgress(r);
    const keepLog = full ? null : view.querySelector(".r-log");   // keep the log list: scroll position, live lines
    keepLog?.remove();
    view.innerHTML = `
      <div class="r-head">
        <span class="tile big run-tile s-${r.state}">${stateIcon(r.state)}</span>
        <div class="r-title"><h2></h2><span class="r-sub"></span></div>
        <span class="state-badge s-${r.state}">${esc(t("rs." + r.state))}</span>
      </div>
      <div class="card r-over">
        <div class="r-progress"><div class="r-bar s-${r.state}"><i style="--p:${prog}"></i></div><b class="r-pct">${Math.round(prog * 100)}%</b></div>
        <div class="r-stats">
          <div class="stat"><div class="k">${esc(t("r.notebooks"))}</div><div class="v">${doneCount(r)}/${n}</div></div>
          <div class="stat"><div class="k">${esc(t("r.time"))}</div><div class="v" data-elapsed>${fmtMs(runElapsed(r))}</div></div>
          <div class="stat"><div class="k">${esc(t("r.cost"))}</div><div class="v">${money(runCost(r))}</div></div>
        </div>
        <div class="r-controls" id="r-controls"></div>
        <p class="r-hint" id="r-hint" hidden></p>
      </div>
      <div class="r-items" id="r-items"></div>`;
    view.querySelector("h2").textContent = r.title;
    view.querySelector(".r-sub").textContent = sub;
    view.classList.toggle("enter", !!full);
    renderControls(r);
    renderItems(r, full);
    if (keepLog) view.appendChild(keepLog);
    else { view.appendChild(buildLog()); loadLog(r); }
    updateLogHead(r);
  }

  function renderControls(r) {
    const box = $("r-controls");
    const add = (label, ic, fn, cls = "") => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn " + cls;
      b.innerHTML = icon(ic) + `<span>${esc(label)}</span>`;
      b.addEventListener("click", fn);
      box.appendChild(b);
    };
    const act = (a) => () => runAct(r, a);
    const unfinished = r.items.some((x) => !["done", "failed", "skipped"].includes(x.status));
    const retryable = r.items.some((x) => ["failed", "stopped", "skipped"].includes(x.status));
    const outs = r.items.filter((x) => x.status === "done" && x.output);
    if (r.state === "running") {
      add(t("rc.pause"), "pause", act("pause"));
      add(t("rc.stop"), "stop", act("stop"), "danger");
    } else if (r.state === "paused" || r.state === "stopped") {
      if (unfinished) add(t("rc.resume"), "play", act("resume"), "prominent");
      add(t("rc.restart"), "redo", () => confirmRestart(r));
      if (r.state === "paused") add(t("rc.stop"), "stop", act("stop"), "danger");
      else add(t("rc.remove"), "trash", () => confirmRemoveRun(r), "danger");
    } else {
      if (r.state === "failed" && retryable) add(t("rc.retryFailed"), "redo", act("retryFailed"), "prominent");
      if (outs.length === 1) add(t("run.open"), "open", () => api.openPath(outs[0].output), r.state === "done" ? "prominent" : "");
      if (outs.length) add(revealLabel(), "folder", () => api.revealPath(outs[0].output));
      add(t("rc.restart"), "redo", () => confirmRestart(r));
      add(t("rc.remove"), "trash", () => confirmRemoveRun(r), "danger");
    }
    const resumable = (r.state === "paused" || r.state === "stopped") && r.items.some((x) => x.sessionId && ["paused", "stopped"].includes(x.status));
    $("r-hint").hidden = !resumable;
    $("r-hint").textContent = t("r.resumeHint");
  }

  async function runAct(r, a) {
    try { await api.runAction(r.id, a); } catch (e) { alert(cleanErr(e)); }
  }
  async function itemAct(r, it, a) {
    try { await api.itemAction(r.id, it.id, a); } catch (e) { alert(cleanErr(e)); }
  }
  function confirmRestart(r) {
    confirmDialog(t("cf.restartRun"), t("cf.restartRunText", { title: r.title }), t("cf.restartOk"), () => runAct(r, "restart"));
  }
  function confirmRemoveRun(r) {
    confirmDialog(t("cf.removeRun"), t("cf.removeRunText", { title: r.title }), t("cf.ok"), () => runAct(r, "remove"));
  }

  const stepsHTML = (it) => {
    const idx = stepIndex(it);
    return `<ol class="r-steps">${STEPS.map((s, i) => `<li class="${i < idx ? "ok" : i === idx ? (it.status === "running" ? "on" : "halt") : ""}"><span></span>${esc(t("step." + s))}</li>`).join("")}</ol>`;
  };

  function renderItems(r, animate) {
    const box = $("r-items");
    r.items.forEach((it, i) => {
      const el = document.createElement("div");
      el.className = `r-item s-${it.status}${it.id === viewLogItem ? " sel" : ""}${animate ? " enter" : ""}`;
      el.style.setProperty("--i", i);
      el.dataset.id = it.id;
      const live = ["running", "paused", "stopped"].includes(it.status);
      el.innerHTML = `
        <span class="r-idx">${i + 1}</span>${docGlyph(extOf(it.files[0]))}
        <div class="r-main">
          <b class="r-name"></b>
          <small class="r-meta"></small>
          ${live ? stepsHTML(it) : ""}
          ${it.status === "running" ? `<div class="r-act"></div>` : ""}
        </div>
        <span class="q-st">${esc(t("q." + it.status))}</span>
        <div class="r-acts"></div>`;
      el.querySelector(".r-name").textContent = it.status === "done" && it.outputTitle ? it.outputTitle : it.title;
      const meta = el.querySelector(".r-meta");
      meta.textContent = itemMeta(it);
      if (it.status === "failed") meta.title = it.error || "";
      const act = el.querySelector(".r-act");
      if (act) act.textContent = activity.get(it.id) || "";
      const acts = el.querySelector(".r-acts");
      const ib = (ic, label, fn) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "icon-btn r-ib";
        b.title = label; b.setAttribute("aria-label", label);
        b.innerHTML = icon(ic);
        b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
        acts.appendChild(b);
      };
      if (it.status === "done" && it.output) ib("open", t("ia.open"), () => api.openPath(it.output));
      if (["failed", "stopped", "skipped", "done"].includes(it.status) && r.state !== "running") ib("redo", t("ia.retry"), () => itemAct(r, it, "retry"));
      if (["waiting", "running", "paused", "stopped"].includes(it.status) && r.items.length > 1) ib("skip", t("ia.skip"), () => itemAct(r, it, "skip"));
      if (it.workDir) ib("folder", t("ia.folder"), () => api.openPath(it.workDir));
      el.addEventListener("click", () => {
        if (viewLogItem === it.id) return;
        viewLogItem = it.id;
        box.querySelectorAll(".r-item").forEach((x) => x.classList.toggle("sel", x.dataset.id === it.id));
        loadLog(r);
        updateLogHead(r);
      });
      box.appendChild(el);
    });
  }

  function buildLog() {
    const card = document.createElement("div");
    card.className = "card r-log" + (logOpen ? "" : " closed");
    card.innerHTML = `<div class="card-h r-log-h"><b class="r-log-title"></b><button class="btn r-log-tg" type="button"></button></div><ul class="log"></ul>`;
    card.querySelector(".r-log-tg").addEventListener("click", () => {
      logOpen = !logOpen;
      card.classList.toggle("closed", !logOpen);
      updateLogHead(runs.find((x) => x.id === selected));
    });
    return card;
  }
  function updateLogHead(r) {
    const card = $("run-view").querySelector(".r-log");
    if (!card || !r) return;
    const it = r.items.find((x) => x.id === viewLogItem);
    card.querySelector(".r-log-title").textContent = r.items.length > 1 && it ? t("r.logOf", { title: it.title }) : t("r.log");
    card.querySelector(".r-log-tg").textContent = t(logOpen ? "r.hide" : "r.show");
  }
  let logToken = 0;
  async function loadLog(r) {
    const ul = $("run-view").querySelector(".r-log .log");
    if (!ul) return;
    const token = ++logToken;
    const lines = await api.runLog(r.id, viewLogItem);
    if (token !== logToken) return;
    ul.textContent = "";
    if (!lines.length) { ul.innerHTML = `<li class="info static">${esc(t("r.logEmpty"))}</li>`; ul.dataset.empty = "1"; }
    else { delete ul.dataset.empty; lines.forEach((l) => appendLog(ul, l, false)); }
    ul.scrollTop = ul.scrollHeight;
  }
  function appendLog(ul, l, anim = true) {
    if (ul.dataset.empty) { ul.textContent = ""; delete ul.dataset.empty; }
    const stick = ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 30;
    const li = document.createElement("li");
    li.className = (l.tone || "info") + (anim ? "" : " static");
    const ts = document.createElement("span");
    ts.className = "t";
    ts.textContent = new Date(l.at).toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.append(ts, document.createTextNode(l.text));
    ul.appendChild(li);
    if (ul.children.length > 3000) ul.firstChild.remove();
    if (stick) ul.scrollTop = ul.scrollHeight;
  }

  // Process: create a run in main, then follow it on its page.
  $("go").addEventListener("click", async () => {
    if (!files.length || busyRun()) return;
    const sep = separate();
    const req = {
      files: files.map((f) => f.path),
      mode: sep ? "separate" : "merge",
      title: sep ? autoTitle() : $("o-title").value.trim(),
      titles: sep ? files.map((f) => (f.title || "").trim() || cleanName(f.path)) : undefined,
      model: segVal("o-model"),
      research: $("o-research").checked,
      lang: segVal("o-lang") || "Tiếng Việt",
      outputDir: settings.outputDir,
    };
    $("go").disabled = true;
    try {
      const id = await api.startRun(req);
      viewLogItem = null;
      await refreshRuns();
      show("run", id);
    } catch (e) { alert(cleanErr(e)); }
    refresh();
  });

  api.onRun((r) => {
    if (r.removed) {
      runs = runs.filter((x) => x.id !== r.id);
      if (page === "run" && selected === r.id) show("new");
    } else {
      const i = runs.findIndex((x) => x.id === r.id);
      if (i >= 0) runs[i] = r; else runs.unshift(r);
      if (r.state !== "running") for (const it of r.items) activity.delete(it.id);
    }
    updateRunsBadge();
    if (sideTab === "runs") renderRunList();
    if (page === "new") { renderActiveRun(); renderRecentRuns(); }
    if (page === "run" && selected === r.id) renderRun(false);
    refresh();
  });
  api.onTick((tk) => {
    const onScreen = page === "run" && selected === tk.runId;
    if (tk.kind === "activity") {
      activity.set(tk.itemId, tk.text);
      if (onScreen) {
        const el = $("run-view").querySelector(`.r-item[data-id="${CSS.escape(tk.itemId)}"] .r-act`);
        if (el) el.textContent = tk.text;
      }
      return;
    }
    if (onScreen && tk.itemId === viewLogItem) {
      const ul = $("run-view").querySelector(".r-log .log");
      if (ul) appendLog(ul, tk);
    }
  });
  // Time keeps counting on screen for the running item.
  setInterval(() => {
    if (page !== "run") return;
    const r = runs.find((x) => x.id === selected);
    if (!r || r.state !== "running") return;
    const v = $("run-view").querySelector("[data-elapsed]");
    if (v) v.textContent = fmtMs(runElapsed(r));
    const it = r.items.find((x) => x.status === "running");
    const m = it && $("run-view").querySelector(`.r-item[data-id="${CSS.escape(it.id)}"] .r-meta`);
    if (m) m.textContent = itemMeta(it);
  }, 1000);

  api.onHistoryChanged(loadHistory);

  // ---------- Updates ----------
  // Main checks the public releases repo on start and every 6 h; a new version shows a card in the
  // sidebar. Installing quits the app, swaps it and reopens (a running item is stopped, resumable).
  let update = null;           // last UpdateInfo
  let updating = false;
  const dlgUp = $("dlg-update");
  function paintUpdate(state) {
    const st = $("up-status");
    $("up-check").classList.toggle("busy", state === "checking");
    $("up-check").disabled = state === "checking" || updating;
    if (state === "checking") st.textContent = t("up.checking");
    else if (!update) st.textContent = "";
    else if (update.error) st.textContent = t("up.error", { msg: update.error });
    else if (update.available) st.textContent = t("up.available", { v: update.latest });
    else st.textContent = t("up.latest");
    st.className = update?.available ? "up-new" : update?.error ? "up-err" : "";
    $("update-card").hidden = !update?.available;
    if (update?.available) $("uc-title").textContent = t("up.available", { v: update.latest });
  }
  async function checkUpdate() {
    paintUpdate("checking");
    const [info] = await Promise.all([api.checkUpdate(), new Promise((r) => setTimeout(r, 500))]);
    update = info;
    paintUpdate();
    if (info.available) openUpdate();
  }
  function openUpdate() {
    if (!update?.available) return;
    $("ud-title").textContent = "StudyLens " + update.latest;
    $("ud-sub").textContent = t("up.sub", { cur: update.current, date: update.publishedAt ? new Date(update.publishedAt).toLocaleDateString(loc()) : "" });
    $("ud-notes").textContent = (update.notes || "").trim() || t("up.noNotes");
    $("ud-busy").hidden = !busyRun();
    $("ud-progress").hidden = !updating;
    $("ud-err").hidden = true;
    $("ud-go").disabled = updating;
    if (!dlgUp.open) dlgUp.showModal();
  }
  $("up-check").addEventListener("click", checkUpdate);
  $("update-card").addEventListener("click", openUpdate);
  $("ud-later").addEventListener("click", () => closeDialog(dlgUp));
  $("ud-go").addEventListener("click", async () => {
    updating = true;
    $("ud-go").disabled = $("ud-later").disabled = true;
    $("ud-progress").hidden = false;
    $("ud-err").hidden = true;
    try { await api.installUpdate(); }
    catch (e) {
      updating = false;
      $("ud-go").disabled = $("ud-later").disabled = false;
      $("ud-progress").hidden = true;
      $("ud-err").hidden = false;
      $("ud-err").textContent = t("up.failed", { msg: cleanErr(e) });
    }
  });
  api.onUpdate((info) => { update = info; paintUpdate(); });
  api.onUpdateProgress((p) => {
    const pct = p.total ? Math.round((p.received / p.total) * 100) : 0;
    $("ud-bar").style.setProperty("--p", p.phase === "download" ? pct / 100 : 1);
    $("ud-phase").textContent = p.phase === "download" ? t("up.download", { pct }) : t(p.phase === "verify" ? "up.verify" : "up.installing");
  });

  // ---------- Dev hooks for the offscreen screenshot mode (STUDYLENS_SHOOT) ----------
  window.__test = {
    history: () => {
      const now = Date.now(), iso = (m) => new Date(now - m * 60000).toISOString();
      const o = { title: "", model: "sonnet", research: true, lang: "Tiếng Việt", outputDir: "" };
      history = [
        { id: "a", status: "done", title: "Sổ tay System Design", startedAt: iso(42), seconds: 431, files: ["/Users/you/Downloads/System Design - Section 1.pdf", "/Users/you/Downloads/System Design - Section 15.pdf"], options: o, workDir: "/tmp/w", output: "/Users/you/Downloads/Sổ tay System Design.html", slides: 18, articles: 132, costUsd: 7.3, exists: true },
        { id: "b", status: "done", title: "Mạng máy tính — Tuần 3", startedAt: iso(60 * 26), seconds: 512, files: ["/Users/you/Downloads/Week 3 lecture.pptx"], options: o, workDir: "/tmp/w", output: "/Users/you/Downloads/Mạng máy tính — Tuần 3.html", slides: 24, articles: 88, costUsd: 5.1, exists: true },
        { id: "c", status: "failed", title: "Kafka Deep Dive", startedAt: iso(60 * 50), seconds: 95, files: ["/Users/you/Downloads/kafka.pdf"], options: o, workDir: "/tmp/w", error: "AI stopped with code 1: usage limit reached", costUsd: 0 },
        { id: "d", status: "done", title: "Operating Systems Notes", startedAt: iso(60 * 24 * 6), seconds: 640, files: ["/Users/you/Downloads/os-notes.docx"], options: o, workDir: "/tmp/w", output: "/Users/you/old.html", slides: 12, articles: 47, costUsd: 3.9, exists: false },
      ];
      renderHistory();
    },
    add: (list) => addPaths(list),
    over: (on) => { drop.classList.toggle("over", on); setDropTitle(); },
    detail: () => history[0] && show("detail", history[0].id),
    lang: (l) => setLang(l),
    restartConfirm: () => { confirmDialog(t("app.restartTitle"), t("app.restartBusy"), t("app.restartOk"), () => {}); },
    restartNow: () => api.restart(),
    settings: () => dlgSet.showModal(),
    checking: () => { aiInfo = null; paintAI(); },
    closeSettings: () => dlgSet.close(),
    noAi: () => { aiInfo = { found: false, error: t("files.unreadable") }; claudeOk = false; paintAI(); refresh(); },
    // Real runs (with STUDYLENS_FAKE_CLAUDE): pick files, choose the mode, press Process.
    setFiles: async (paths, mode) => {
      files = []; rows.forEach((li) => li.remove()); rows.clear(); renderFiles();
      await addPaths(paths);
      outMode = mode; setSeg("o-mode", outMode); renderFiles();
    },
    process: async (outDir) => {
      settings = { ...settings, outputDir: outDir };
      await checkAI();
      $("go").click();
    },
    run: () => runs.find((r) => r.id === selected) || runs[0],
    act: (a) => runAct(runs.find((r) => r.id === selected), a),
    tab: (tb) => setTab(tb),
    newPage: () => show("new"),
    fakeUpdate: () => { update = { current: "0.1.0", latest: "0.1.1", available: true, publishedAt: new Date().toISOString(), notes: "• Pause and continue runs, even after a restart\n• Each notebook can have its own name\n• Faster startup" }; paintUpdate(); openUpdate(); },
  };

  // ---------- Boot ----------
  let booted = false;
  (async () => {
    settings = await api.getSettings();
    setSeg("o-model", settings.model);
    setSeg("o-lang", settings.lang);
    outMode = settings.outMode === "separate" ? "separate" : "merge";
    setSeg("o-mode", outMode);
    $("o-research").checked = settings.research;
    $("o-model").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || running) return;
      setSeg("o-model", b.dataset.v);
      api.saveSettings({ model: b.dataset.v });
    });
    await refreshRuns();
    $("up-ver").textContent = await api.version();
    setLang(settings.uiLang);
    setSeg("side-tab", sideTab);
    booted = true;
    loadHistory();
    checkAI();
  })();
})();
