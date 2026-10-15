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
    more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    pencil: '<path d="M14.5 5.5 18.5 9.5M4.5 19.5l1-4.5L15.8 4.7a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1L9 18.5Z"/>',
    move: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M9 13.5h6.5M13 11l2.5 2.5L13 16"/>',
    folderPlus: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M12 11v5M9.5 13.5h5"/>',
    chevDown: '<path d="m6 9.5 6 6 6-6"/>',
    out: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M9.5 13.5h5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
    tag: '<path d="M4 4.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-4.6 4.6a1.5 1.5 0 0 1-2.1 0L4.5 11.2V5Z"/><circle cx="8.3" cy="8.3" r="1.3" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"/>',
    moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z"/>',
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>',
    stack: '<rect x="4.5" y="4" width="15" height="16" rx="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
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
  let projects = [];       // [{id, name, dir, color, exists}]
  let newProject = "";     // project the new notebook goes into ("" = none)
  let format = "tap";      // notebook type for the next run: "tap" (Tap to Explain) | "brief" (Deep Brief) | "wbs" (WBS Map)
  const fmtOf = (o) => (o && (o.format === "brief" || o.format === "wbs") ? o.format : "tap");
  // Per format: the words for the two counts a notebook carries (slides/articles in history).
  const FMT_KEYS = { tap: ["d.sub", "d.slides", "d.articles", "q.meta"], brief: ["d.subBrief", "d.sections", "d.diagrams", "q.metaBrief"], wbs: ["d.subWbs", "d.modules", "d.items", "q.metaWbs"] };
  let runs = [];           // every run, newest first (from main, live via onRun)
  let sideTab = "notes";
  let page = "home", selected = null;
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
  // ---------- Tags and search ----------
  // Search ignores case and Vietnamese marks ("ha noi" finds "Hà Nội"). "#word" matches tags only;
  // several words must all match (title, source file names or tags).
  const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  function parseQuery(raw) {
    const words = [], tags = [];
    for (const w of fold(raw).split(/\s+/).filter(Boolean)) {
      if (w.startsWith("#")) { if (w.length > 1) tags.push(w.slice(1)); } else words.push(w);
    }
    return { words, tags, empty: !words.length && !tags.length };
  }
  const tagsOf = (h) => h.tags || [];
  function matchNote(h, Q) {
    if (Q.empty) return true;
    const tags = tagsOf(h).map(fold);
    if (!Q.tags.every((q) => tags.some((x) => x.startsWith(q)))) return false;
    const hay = [h.title, ...h.files.map(nameOf), ...tagsOf(h)].map(fold);
    return Q.words.every((q) => hay.some((x) => x.includes(q)));
  }
  const matchProject = (p, Q) => !Q.empty && !Q.tags.length && Q.words.every((q) => fold(p.name).includes(q));
  /** Every tag in use (optionally among some notebooks), most used first. */
  function allTags(list = history) {
    const n = new Map();
    for (const h of list) for (const tg of tagsOf(h)) {
      const k = fold(tg), e = n.get(k);
      e ? e.n++ : n.set(k, { tag: tg, n: 1 });
    }
    return [...n.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, loc())).map((e) => e.tag);
  }
  const tagHue = (tg) => [...fold(tg)].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
  /** A tag as a chip. `on`: click handler; `x`: show a remove button calling it. */
  function tagChip(tg, { on, x, active, count } = {}) {
    const el = document.createElement(on || x ? "button" : "span");
    if (on || x) el.type = "button";
    el.className = "tag-chip" + (active ? " on" : "") + (x ? " removable" : "");
    el.style.setProperty("--h", tagHue(tg));
    el.innerHTML = `<i>#</i><span></span>` + (count ? `<small>${count}</small>` : "") + (x ? icon("x") : "");
    el.querySelector("span").textContent = tg;
    if (x) { el.title = t("tg.remove", { tag: tg }); el.setAttribute("aria-label", el.title); }
    else if (on) el.title = t("tg.filter", { tag: tg });
    el.addEventListener("click", (e) => { e.stopPropagation(); (x || on)(tg, e); });
    return el;
  }
  /** Put a query in the sidebar search (Library tab) and show what it finds. */
  function searchFor(q) {
    $("q").value = q;
    if (sideTab !== "notes") setTab("notes"); else renderHistory();
    $("q").focus();
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
  // Projects are the top level: home lists them; a new notebook is always made inside one.
  function show(p, id) {
    if (p === "new" && !projOf(newProject)) p = "home";
    const changed = p !== page || (id || null) !== selected;
    page = p; selected = id || null;
    if (changed && !$("preview").hidden) closePreview();
    if (changed) {
      const el = $("page-" + p);
      el.classList.remove("enter");
      void el.offsetWidth;
      el.classList.add("enter");
      clearTimeout(show.t);
      show.t = setTimeout(() => el.classList.remove("enter"), 700);
    }
    $("page-home").hidden = p !== "home";
    $("page-new").hidden = p !== "new";
    $("page-detail").hidden = p !== "detail";
    $("page-run").hidden = p !== "run";
    $("page-project").hidden = p !== "project";
    $("nav-home").classList.toggle("on", p === "home");
    setCrumb(null);
    if (p === "new") {
      const pj = projOf(newProject);
      setCrumb(pj.name, () => show("project", pj.id));
      $("page-title").textContent = t("page.new"); $("page-sub").textContent = "";
      paintSaveHint(); renderActiveRun(); renderRecentRuns();
    }
    if (p === "run" && sideTab !== "runs") { sideTab = "runs"; setSeg("side-tab", "runs"); }
    if ((p === "project" || p === "detail") && sideTab !== "notes") { sideTab = "notes"; setSeg("side-tab", "notes"); }
    renderHistory();
    paintHomeNav();
    if (p === "home") renderHome(changed);
    if (p === "detail") renderDetail();
    if (p === "project") renderProject(changed);
    if (p === "run") renderRun(changed);
  }
  $("nav-home").addEventListener("click", () => show("home"));
  $("btn-new-top").addEventListener("click", () => openProjectDialog());
  // New notebook: only from inside a project.
  function newNotebookIn(pid) { setNewProject(pid); show("new"); }
  // Toolbar breadcrumb: "Project ›" before the page title, back to that project.
  function setCrumb(label, go) {
    const b = $("crumb-parent");
    b.hidden = !label;
    if (!label) return;
    b.innerHTML = `<span></span>${icon("chev")}`;
    b.firstChild.textContent = label;
    b.onclick = go;
  }

  // ---------- Logo: plays once on launch, again when hovered (not while it is still playing) ----------
  const logo = document.querySelector(".brand .logo");
  let logoBusy = true;
  logo.querySelector(".sl-spark").addEventListener("animationend", () => { logoBusy = false; });
  $("brand").addEventListener("mouseenter", () => {
    if (logoBusy) return;
    logoBusy = true;
    logo.classList.remove("play");
    void logo.getBoundingClientRect();
    logo.classList.add("play");
  });

  // ---------- Sidebar ----------
  // Library tab: projects (expandable, with their notebooks), then notebooks outside any project.
  // Notebooks can be dragged onto a project (or onto "Not in a project") to move them.
  async function loadHistory() {
    [history, projects] = await Promise.all([api.listHistory(), api.listProjects()]);
    renderHistory();
    historyLoaded = true;
    if (page === "detail") renderDetail();
    if (page === "project") renderProject(false);
    if (page === "home") renderHome(false);
    if (page === "new") { if (!projOf(newProject)) show("home"); else paintSaveHint(); }
    paintHomeNav();
  }
  function paintHomeNav() {
    $("nav-home-sub").textContent = t("nav.homeSub", { p: projects.length, n: history.length });
  }
  const knownIds = new Set();
  let historyLoaded = false;
  const projOf = (id) => projects.find((p) => p.id === id);
  const notesOf = (pid) => history.filter((h) => h.projectId === pid);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-viewer convenience only */ } },
  };
  const expanded = new Set(store.get("expanded", []));
  function toggleExpand(id, on = !expanded.has(id)) {
    on ? expanded.add(id) : expanded.delete(id);
    store.set("expanded", [...expanded]);
    renderHistory();
  }
  function folderTile(p, cls = "") {
    return `<span class="tile folder-tile ${cls}" style="--c:${esc(p.color)}">${icon("folder")}</span>`;
  }
  function setTab(tab) {
    sideTab = tab;
    setSeg("side-tab", tab);
    renderHistory();
  }
  $("side-tab").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b.dataset.v !== sideTab) setTab(b.dataset.v);
  });
  // A row animates in only the first time it appears; later ones (just made) also flash.
  function animateRow(el, key, i) {
    if (knownIds.has(key)) return;
    el.classList.add(historyLoaded ? "fresh" : "enter");
    el.style.setProperty("--i", i);
    knownIds.add(key);
    el.addEventListener("animationend", (e) => { if (e.animationName === "sideIn") el.classList.remove("enter"); });
  }
  // Drop targets for dragged notebooks (sidebar project rows, the loose group, the project page).
  const NB = "text/x-notebook";
  function dropTarget(el, projectId) {
    el.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes(NB)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-on");
    });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-on"); });
    el.addEventListener("drop", (e) => {
      el.classList.remove("drop-on");
      const id = e.dataTransfer.getData(NB);
      if (!id) return;
      e.preventDefault();
      const h = history.find((x) => x.id === id);
      if (h && (h.projectId || null) !== projectId) moveNotebook(h, projectId);
    });
  }
  function draggableNote(el, h) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData(NB, h.id);
      e.dataTransfer.effectAllowed = "move";
      document.body.classList.add("dragging-note");
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => { document.body.classList.remove("dragging-note"); el.classList.remove("dragging"); });
  }
  function noteSub(h) {
    return h.status === "done" ? t(FMT_KEYS[fmtOf(h.options)][0], { ago: ago(h.startedAt), slides: h.slides, articles: h.articles }) : t("d.subFail", { ago: ago(h.startedAt) });
  }
  function noteRow(h, i, kid) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "side-item note-row" + (kid ? " kid" : "") + (page === "detail" && selected === h.id ? " on" : "");
    b.dataset.id = h.id;
    animateRow(b, h.id, i);
    const st = h.status === "failed" ? "failed" : h.exists ? "" : "gone";
    b.innerHTML = `${tileHTML(h.title, kid ? "sm" : "")}<span class="txt"><b></b><small></small></span><span class="st ${st}"></span>`;
    b.querySelector("b").textContent = h.title;
    b.querySelector("small").textContent = noteSub(h);
    b.title = h.output || h.error || "";
    b.addEventListener("click", () => show("detail", h.id));
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, noteMenu(h)); });
    draggableNote(b, h);
    return b;
  }
  function groupHead(label, add) {
    const d = document.createElement("div");
    d.className = "side-group";
    d.innerHTML = `<span></span>`;
    d.firstChild.textContent = label;
    if (add) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "icon-btn sm"; b.title = add.label; b.setAttribute("aria-label", add.label);
      b.innerHTML = icon("plus");
      b.addEventListener("click", add.run);
      d.appendChild(b);
    }
    return d;
  }
  function renderHistory() {
    if (sideTab === "runs") return renderRunList();
    const raw = $("q").value, Q = parseQuery(raw), q = !Q.empty;
    const hit = (h) => matchNote(h, Q);
    const box = $("history");
    box.textContent = "";
    let n = 0;
    // Typing "#ta…": the tags that start with it, to pick one.
    const partial = /(?:^|\s)#([^\s#]*)$/.exec(raw);
    if (partial) {
      const pre = fold(partial[1]);
      const list = allTags().filter((tg) => fold(tg).startsWith(pre) && fold(tg) !== pre).slice(0, 12);
      if (list.length) {
        box.appendChild(groupHead(t("lib.tags")));
        const wrap = document.createElement("div");
        wrap.className = "tag-chips side-tags";
        for (const tg of list) wrap.appendChild(tagChip(tg, { on: () => searchFor(raw.slice(0, partial.index + partial[0].indexOf("#")) + "#" + tg + " ") }));
        box.appendChild(wrap);
      }
    }
    box.appendChild(groupHead(t("lib.projects"), { label: t("lib.newProject"), run: () => openProjectDialog() }));
    if (!projects.length && !q) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "side-item proj-empty";
      b.innerHTML = `<span class="tile new-tile">${icon("folderPlus")}</span><span class="txt"><b></b><small></small></span>`;
      b.querySelector("b").textContent = t("lib.firstProject");
      b.querySelector("small").textContent = t("lib.firstProjectSub");
      b.addEventListener("click", () => openProjectDialog());
      box.appendChild(b);
    }
    for (const p of projects) {
      const all = notesOf(p.id), hits = all.filter(hit);
      if (q && !matchProject(p, Q) && !hits.length) continue;
      const open = q ? hits.length > 0 : expanded.has(p.id);
      const row = document.createElement("div");
      row.className = "side-item proj-row" + (page === "project" && selected === p.id ? " on" : "") + (open ? " open" : "");
      row.dataset.id = p.id;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      animateRow(row, "p:" + p.id, n++);
      row.innerHTML = `<button class="chev-btn" type="button" aria-label="${esc(t(open ? "lib.collapse" : "lib.expand"))}">${icon("chev")}</button>${folderTile(p)}<span class="txt"><b></b><small></small></span><span class="count"></span>`;
      row.querySelector("b").textContent = p.name;
      row.querySelector("small").textContent = p.exists === false ? t("pj.gone") : t("pj.count", { n: all.length });
      row.querySelector(".count").textContent = all.length || "";
      row.title = p.dir;
      row.querySelector(".chev-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleExpand(p.id); });
      row.addEventListener("click", () => { if (!expanded.has(p.id)) toggleExpand(p.id, true); show("project", p.id); });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") toggleExpand(p.id, e.key === "ArrowRight");
      });
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, projectMenu(p)); });
      dropTarget(row, p.id);
      box.appendChild(row);
      if (!open) continue;
      const kids = q ? hits : all;
      const wrap = document.createElement("div");
      wrap.className = "side-kids";
      kids.forEach((h, i) => wrap.appendChild(noteRow(h, i, true)));
      if (!kids.length) wrap.innerHTML = `<p class="kid-empty">${esc(t("pj.emptyShort"))}</p>`;
      box.appendChild(wrap);
    }
    const loose = history.filter((h) => !h.projectId && hit(h));
    if (loose.length || (!q && history.length && projects.length)) {
      const head = groupHead(t("lib.loose"));
      head.classList.add("loose-head");
      dropTarget(head, null);
      box.appendChild(head);
      loose.forEach((h) => box.appendChild(noteRow(h, n++)));
      if (!loose.length) {
        const p = document.createElement("p");
        p.className = "kid-empty"; p.textContent = t("lib.looseEmpty");
        dropTarget(p, null);
        box.appendChild(p);
      }
    }
    const empty = q && !box.querySelector(".note-row, .proj-row");
    $("history-empty").textContent = t("nav.noMatch");
    $("history-empty").hidden = !empty;
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
    if (!h) { show("home"); return; }
    const hp = projOf(h.projectId);
    setCrumb(hp ? hp.name : t("lib.loose"), () => (hp ? show("project", hp.id) : show("home")));
    $("page-title").textContent = h.title;
    $("page-sub").textContent = t("fmt." + fmtOf(h.options)) + " · " + (h.status === "done" ? (h.exists ? t("d.created", { ago: ago(h.startedAt) }) : t("d.gone")) : t("d.failed"));
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
      add(t("pv.quick"), "eye", () => openPreview(h), "prominent", !h.exists);
      add(t("pv.external"), "open", () => openFile(h.output), "", !h.exists);
      add(revealLabel(), "folder", () => api.revealPath(h.output), "", !h.exists);
    } else {
      add(t("run.workDir"), "work", () => openFile(h.workDir));
      add(t("run.retry"), "redo", (e) => rerun(h, e.currentTarget));
    }
    add(t("nb.more"), "more", (e) => openMenu(e.currentTarget, noteMenu(h, true)));
    const tagBox = $("d-tags");
    tagBox.textContent = "";
    tagBox.className = "d-tags tag-chips";
    tagsOf(h).forEach((tg) => tagBox.appendChild(tagChip(tg, { on: () => searchFor("#" + tg + " ") })));
    const addTg = document.createElement("button");
    addTg.type = "button"; addTg.className = "tag-add";
    addTg.innerHTML = icon(tagsOf(h).length ? "pencil" : "tag") + `<span>${esc(t(tagsOf(h).length ? "nb.tags" : "tg.add"))}</span>`;
    addTg.addEventListener("click", () => openTagsDialog(h));
    tagBox.appendChild(addTg);
    const pj = projOf(h.projectId);
    $("d-project").hidden = !pj;
    if (pj) {
      $("d-project").innerHTML = folderTile(pj, "xs") + `<span>${esc(pj.name)}</span>` + icon("chev");
      $("d-project").title = t("nb.inProject", { name: pj.name });
      $("d-project").onclick = () => show("project", pj.id);
    }

    const stats = h.status === "done"
      ? [[t(FMT_KEYS[fmtOf(h.options)][1]), h.slides], [t(FMT_KEYS[fmtOf(h.options)][2]), h.articles], [t("d.time"), fmtDur(h.seconds)], [t("d.model"), modelName(h.options.model)]]
      : [[t("d.status"), t("d.error")], [t("d.time"), fmtDur(h.seconds)], [t("d.files"), h.files.length], [t("d.model"), modelName(h.options.model)]];
    $("d-stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v"${typeof v === "number" ? ` data-count="${v}"` : ""}>${esc(typeof v === "number" ? 0 : v)}</div></div>`).join("");
    countUp($("d-stats"));
    $("d-error-card").hidden = !h.error;
    $("d-error").textContent = h.error || "";
    $("d-files-count").textContent = t("files.count", { n: h.files.length });
    $("d-files").innerHTML = h.files.map((f) => `<li title="${esc(f)}" tabindex="0" role="button" class="pv-able">${docGlyph(extOf(f))}<span class="name"><b>${esc(nameOf(f))}</b><small>${esc(f.replace(/[\\/][^\\/]*$/, ""))}</small></span><span class="pv-eye">${icon("eye")}</span></li>`).join("");
    $("d-files").querySelectorAll("li").forEach((li, i) => {
      li.addEventListener("click", () => openPreview(h, h.files[i]));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPreview(h, h.files[i]); } });
    });
    const o = h.options;
    $("d-opts").innerHTML = [
      [t("d.model"), o.model || t("d.defaultModel")],
      [t("d.optFormat"), t("fmt." + fmtOf(o))],
      [t("d.optLang"), o.lang],
      [t("d.optResearch"), o.research ? t("d.yes") : t("d.no")],
      [t("d.optSaveTo"), h.output ? h.output.replace(/[\\/][^\\/]*$/, "") : o.outputDir || t("opts.sameDir")],
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
  // Run again inside the notebook's project; a notebook outside any project asks which one first.
  function rerun(h, anchor) {
    if (!projOf(h.projectId)) {
      return openMenu(anchor, [
        { head: t("run.pickProject") },
        ...projects.map((p) => ({ label: p.name, color: p.color, run: () => rerun({ ...h, projectId: p.id }) })),
        { label: t("lib.newProject") + "…", icon: "folderPlus", run: () => openProjectDialog(null, (np) => rerun({ ...h, projectId: np.id })) },
      ]);
    }
    files = [];
    renderFiles();
    addPaths(h.files);
    titleAuto = !h.options.title;
    $("o-title").value = h.options.title || "";
    setSeg("o-lang", h.options.lang || "Tiếng Việt");
    $("o-research").checked = !!h.options.research;
    setFormat(fmtOf(h.options));
    setNewProject(h.projectId);
    show("new");
  }
  // One confirm dialog for every destructive action.
  // `check`: an optional checkbox (e.g. "also move the files to the Trash"); onOk gets its state.
  function confirmDialog(title, text, okLabel, onOk, check) {
    $("cf-title").textContent = title;
    $("cf-text").textContent = text;
    $("cf-ok").textContent = okLabel;
    $("cf-check").hidden = !check;
    $("cf-check-box").checked = false;
    if (check) $("cf-check-text").textContent = check;
    const dlg = $("dlg-confirm");
    dlg.returnValue = "";
    dlg.onclose = () => { if (dlg.returnValue === "ok") onOk($("cf-check-box").checked); };
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
    dlg.addEventListener("submit", (e) => {
      e.preventDefault();
      if (dlg.dataset.manual && e.submitter?.value !== "cancel") return;   // the dialog's own handler decides
      closeDialog(dlg, e.submitter?.value || "");
    });
  });
  // Rows leave the sidebar with a short animation before the list is reloaded.
  function leaveRow(id, then) {
    const row = document.querySelector(`#history [data-id="${CSS.escape(id)}"]`);
    if (!row || matchMedia("(prefers-reduced-motion: reduce)").matches) return then();
    row.classList.add("leave");
    row.addEventListener("animationend", then, { once: true });
  }

  // ---------- Menus (the ⋯ buttons and right-click) ----------
  // items: { label, icon | color, run, danger, disabled, check } · "-" for a line · { head } for a label
  let menuEl = null;
  function closeMenu() {
    if (!menuEl) return;
    const m = menuEl;
    menuEl = null;
    document.removeEventListener("pointerdown", onOutside, true);
    m.classList.add("closing");
    setTimeout(() => m.remove(), 120);
    m._anchor?.focus?.({ preventScroll: true });
  }
  function onOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function openMenu(at, items, opts = {}) {
    closeMenu();
    const m = document.createElement("div");
    m.className = "menu";
    m.setAttribute("role", "menu");
    for (const it of items.filter(Boolean)) {
      if (it === "-") { m.insertAdjacentHTML("beforeend", '<hr class="menu-sep">'); continue; }
      if (it.head) { const h = document.createElement("div"); h.className = "menu-head"; h.textContent = it.head; m.appendChild(h); continue; }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (it.danger ? " danger" : "") + (it.check ? " checked" : "");
      b.setAttribute("role", it.check != null ? "menuitemradio" : "menuitem");
      if (it.check != null) b.setAttribute("aria-checked", String(!!it.check));
      b.disabled = !!it.disabled;
      b.innerHTML = (it.color ? `<span class="menu-dot" style="--c:${esc(it.color)}"></span>` : icon(it.icon || "")) + `<span class="menu-l"></span>` + (it.check ? icon("check") : "");
      b.querySelector(".menu-l").textContent = it.label;
      b.addEventListener("click", () => { closeMenu(); it.run?.(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const el = at instanceof Element ? at : null;
    const r = el ? el.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y, width: 0 };
    if (opts.matchWidth && el) m.style.minWidth = r.width + "px";
    const w = m.offsetWidth, h = m.offsetHeight, gap = el ? 6 : 2;
    let x = opts.alignRight && el ? r.right - w : r.left, y = r.bottom + gap;
    if (y + h > innerHeight - 8) { y = Math.max(8, r.top - h - gap); m.classList.add("up"); }
    x = Math.min(Math.max(8, x), innerWidth - w - 8);
    m.style.left = x + "px"; m.style.top = y + "px";
    m._anchor = el;
    menuEl = m;
    setTimeout(() => document.addEventListener("pointerdown", onOutside, true));
    m.addEventListener("keydown", (e) => {
      const list = [...m.querySelectorAll(".menu-item:not(:disabled)")];
      const i = list.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      if (e.key === "Tab") closeMenu();
    });
    (m.querySelector(".menu-item.checked:not(:disabled)") || m.querySelector(".menu-item:not(:disabled)"))?.focus({ preventScroll: true });
  }
  addEventListener("resize", closeMenu);
  addEventListener("blur", closeMenu);

  // ---------- Notebook actions: rename, move to a project, delete ----------
  function noteMenu(h, fromDetail) {
    const run = h.runId && runs.some((r) => r.id === h.runId);
    const others = projects.filter((p) => p.id !== h.projectId);
    return [
      !fromDetail && h.status === "done" && { label: t("pv.quick"), icon: "eye", run: () => openPreview(h), disabled: !h.exists },
      !fromDetail && h.status === "done" && { label: t("pv.external"), icon: "open", run: () => openFile(h.output), disabled: !h.exists },
      !fromDetail && h.status === "done" && { label: revealLabel(), icon: "folder", run: () => api.revealPath(h.output), disabled: !h.exists },
      !fromDetail && "-",
      { label: t("nb.rename"), icon: "pencil", run: () => renameNotebook(h) },
      { label: t("nb.tags"), icon: "tag", run: () => openTagsDialog(h) },
      { head: t("nb.moveTo") },
      ...others.map((p) => ({ label: p.name, color: p.color, run: () => moveNotebook(h, p.id) })),
      { label: t("lib.newProject") + "…", icon: "folderPlus", run: () => openProjectDialog(null, (np) => moveNotebook(h, np.id)) },
      h.projectId && { label: t("nb.moveOut"), icon: "out", run: () => moveNotebook(h, null) },
      "-",
      fromDetail && h.status === "done" && { label: t("run.retry"), icon: "redo", run: () => rerun(h, $("d-actions").lastElementChild) },
      run && { label: t("nb.viewRun"), icon: "list", run: () => show("run", h.runId) },
      { label: t("nb.delete"), icon: "trash", danger: true, run: () => confirmDeleteNote(h) },
    ];
  }
  const libCall = async (fn) => { try { return await fn(); } catch (e) { alert(cleanErr(e)); return null; } };
  async function renameNotebook(h) {
    const title = await promptDialog({ title: t("nb.renameTitle"), value: h.title, sub: h.exists && h.status === "done" ? t("nb.renameSub") : "", ok: t("nb.renameOk") });
    if (!title || title === h.title) return;
    if (await libCall(() => api.renameNotebook(h.id, title))) { toast(t("nb.renamed", { title })); await loadHistory(); }
  }
  async function moveNotebook(h, projectId) {
    const r = await libCall(() => api.moveNotebook(h.id, projectId));
    if (!r) return;
    if (projectId) { expanded.add(projectId); store.set("expanded", [...expanded]); }
    knownIds.delete(h.id);           // flash the row in its new place
    await loadHistory();
    show("home");
    const p = projOf(projectId);
    toast(p ? t("nb.movedTo", { title: h.title, name: p.name }) : t("nb.movedOut", { title: h.title }), p ? { label: t("nb.goProject"), run: () => show("project", p.id) } : null);
  }
  // Tags dialog: chips + a text field; Enter / comma adds, Backspace on an empty field removes the last.
  const dlgTg = $("dlg-tags");
  let tgList = [];
  function paintTags() {
    const chips = $("tg-chips");
    chips.textContent = "";
    tgList.forEach((tg) => chips.appendChild(tagChip(tg, { x: () => { tgList = tgList.filter((x) => x !== tg); paintTags(); $("tg-input").focus(); } })));
    const typed = fold($("tg-input").value.trim().replace(/^#+/, ""));
    const have = new Set(tgList.map(fold));
    const sug = allTags().filter((tg) => !have.has(fold(tg)) && (!typed || fold(tg).includes(typed))).slice(0, 14);
    $("tg-suggest-wrap").hidden = !sug.length;
    const box = $("tg-suggest");
    box.textContent = "";
    sug.forEach((tg) => box.appendChild(tagChip(tg, { on: () => { addTag(tg); $("tg-input").value = ""; paintTags(); $("tg-input").focus(); } })));
    paintTemplates(typed, new Set([...have, ...sug.map(fold)]));
  }
  // Ready-made tags, by group: shown in the dialog until picked (or already in use above).
  const TAG_TEMPLATES = {
    vi: [
      ["Tiến độ", ["Chưa đọc", "Đang học", "Cần ôn", "Đã nắm"]],
      ["Mục đích", ["Thi giữa kỳ", "Thi cuối kỳ", "Phỏng vấn", "Chứng chỉ", "Thuyết trình", "Dự án"]],
      ["Loại tài liệu", ["Bài giảng", "Sách", "Bài báo", "Tài liệu kỹ thuật", "RFP"]],
      ["Mức độ", ["Cơ bản", "Nâng cao", "Quan trọng"]],
    ],
    en: [
      ["Progress", ["To read", "Studying", "To review", "Mastered"]],
      ["Purpose", ["Midterm", "Final exam", "Interview", "Certification", "Presentation", "Project"]],
      ["Material", ["Lecture", "Book", "Paper", "Tech docs", "RFP"]],
      ["Level", ["Basics", "Advanced", "Important"]],
    ],
  };
  function paintTemplates(typed, skip) {
    const box = $("tg-tpl");
    box.textContent = "";
    for (const [group, tags] of TAG_TEMPLATES[lang] || TAG_TEMPLATES.en) {
      const list = tags.filter((tg) => !skip.has(fold(tg)) && (!typed || fold(tg).includes(typed)));
      if (!list.length) continue;
      const row = document.createElement("div");
      row.className = "tg-tpl-row";
      row.innerHTML = `<span class="tg-tpl-g"></span><span class="tag-chips"></span>`;
      row.firstChild.textContent = group;
      list.forEach((tg) => row.lastChild.appendChild(tagChip(tg, { on: () => { addTag(tg); $("tg-input").value = ""; paintTags(); $("tg-input").focus(); } })));
      row.lastChild.querySelectorAll(".tag-chip").forEach((c) => c.classList.add("tpl"));
      box.appendChild(row);
    }
    if (box.firstChild) box.insertAdjacentHTML("afterbegin", `<span class="tg-suggest-h">${esc(t("tg.tplHead"))}</span>`);
  }
  function addTag(raw) {
    for (const part of String(raw).split(",")) {
      const tg = part.replace(/\s+/g, " ").trim().replace(/^#+\s*/, "").slice(0, 32).trim();
      if (!tg || tgList.length >= 20) continue;
      // Same tag, other case: use the spelling already in the library.
      const known = allTags().find((x) => fold(x) === fold(tg)) || tg;
      if (!tgList.some((x) => fold(x) === fold(tg))) tgList.push(known);
    }
  }
  $("tg-input").addEventListener("keydown", (e) => {
    const inp = e.target;
    if (e.key === "Enter" || (e.key === "," && !e.isComposing)) {
      e.preventDefault();
      if (inp.value.trim()) { addTag(inp.value); inp.value = ""; paintTags(); }
      else if (e.key === "Enter") closeDialog(dlgTg, "ok");
    } else if (e.key === "Backspace" && !inp.value && tgList.length) {
      tgList.pop(); paintTags();
    }
  });
  $("tg-input").addEventListener("input", paintTags);
  $("tg-field").addEventListener("click", (e) => { if (e.target === e.currentTarget || e.target.id === "tg-chips") $("tg-input").focus(); });
  function openTagsDialog(h) {
    tgList = tagsOf(h).slice();
    $("tg-title").textContent = t("tg.title", { title: h.title });
    $("tg-input").value = "";
    paintTags();
    dlgTg.returnValue = "";
    dlgTg.onclose = async () => {
      if (dlgTg.returnValue !== "ok") return;
      if ($("tg-input").value.trim()) addTag($("tg-input").value);
      if (tgList.join("\n") === tagsOf(h).join("\n")) return;
      if (await libCall(() => api.tagNotebook(h.id, tgList))) { toast(t("tg.saved", { title: h.title })); await loadHistory(); }
    };
    dlgTg.showModal();
    $("tg-input").focus();
  }
  function confirmDeleteNote(h) {
    confirmDialog(t("cf.title"), t("cf.text", { title: h.title }), t("cf.ok"), async (trash) => {
      if (page === "detail" && selected === h.id) show(projOf(h.projectId) ? "project" : "home", h.projectId);
      leaveRow(h.id, async () => {
        if (await libCall(() => api.deleteNotebook(h.id, trash)) !== null) toast(t(trash ? "nb.trashed" : "nb.removed", { title: h.title }));
        knownIds.delete(h.id);
        loadHistory();
      });
    }, h.exists ? t("cf.trashNote") : null);
  }

  // ---------- Projects ----------
  function projectMenu(p) {
    return [
      { label: t("pj.newNote"), icon: "spark", run: () => newNotebookIn(p.id) },
      { label: t("pj.openFolder"), icon: "folder", run: () => openFile(p.dir), disabled: p.exists === false },
      "-",
      { label: t("pj.edit"), icon: "pencil", run: () => openProjectDialog(p) },
      { label: t("pj.remove"), icon: "trash", danger: true, run: () => confirmRemoveProject(p) },
    ];
  }
  function confirmRemoveProject(p) {
    const n = notesOf(p.id).length;
    confirmDialog(t("pj.removeTitle", { name: p.name }), t(n ? "pj.removeText" : "pj.removeTextEmpty", { n }), t("cf.ok"), async (trash) => {
      if (page === "project" && selected === p.id) show("home");
      if (page === "new" && newProject === p.id) show("home");
      leaveRow(p.id, async () => {
        if (await libCall(() => api.removeProject(p.id, trash)) !== null) toast(t(trash ? "pj.trashed" : "pj.removed", { name: p.name }));
        if (newProject === p.id) setNewProject("");
        loadHistory();
      });
    }, p.exists !== false ? t("pj.trashToo", { dir: p.dir }) : null);
  }
  // New / edit project: name, color and (new only) the parent folder.
  const COLORS = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF9F0A", "#30D158", "#00C7BE", "#8E8E93"];
  const dlgPj = $("dlg-project");
  dlgPj.dataset.manual = "1";
  let pjEdit = null, pjDone = null, pjColor = COLORS[1], pjParent = "";
  async function openProjectDialog(p = null, onDone = null) {
    pjEdit = p; pjDone = onDone;
    pjColor = p ? p.color : COLORS[projects.length % COLORS.length];
    if (!p) pjParent = settings.projectsRoot || (await api.projectsRoot());
    $("pj-title").textContent = t(p ? "pj.editTitle" : "pj.newTitle");
    $("pj-sub").textContent = p ? p.dir : t("pj.newSub");
    $("pj-ok").textContent = t(p ? "pj.save" : "pj.create");
    $("pj-name").value = p ? p.name : "";
    $("pj-where").hidden = !!p;
    $("pj-err").hidden = true;
    paintPj();
    dlgPj.showModal();
    $("pj-name").focus();
    $("pj-name").select();
  }
  function paintPj() {
    $("pj-tile").style.setProperty("--c", pjColor);
    const box = $("pj-colors");
    box.innerHTML = COLORS.map((c) => `<button type="button" class="swatch${c === pjColor ? " on" : ""}" style="--c:${c}" data-c="${c}" role="radio" aria-checked="${c === pjColor}" aria-label="${c}"></button>`).join("");
    const name = $("pj-name").value.trim().replace(/[\\/:*?"<>|]+/g, " ") || t("pj.namePh");
    const sep = navigator.platform.startsWith("Win") ? "\\" : "/";
    $("pj-dir").textContent = "\u200E" + pjParent + sep + name + "\u200E";
    $("pj-dir").title = pjParent;
    $("pj-ok").disabled = !$("pj-name").value.trim();
  }
  $("pj-colors").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (b) { pjColor = b.dataset.c; paintPj(); }
  });
  $("pj-name").addEventListener("input", () => { $("pj-err").hidden = true; paintPj(); });
  $("pj-dir-pick").addEventListener("click", async () => {
    const d = await api.pickDir();
    if (d) { pjParent = d; settings = await api.saveSettings({ projectsRoot: d }); paintPj(); }
  });
  $("pj-form").addEventListener("submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    const name = $("pj-name").value.trim();
    if (!name) return;
    $("pj-ok").disabled = true;
    try {
      const p = pjEdit ? await api.updateProject(pjEdit.id, { name, color: pjColor }) : await api.createProject({ name, color: pjColor, parent: pjParent });
      closeDialog(dlgPj, "ok");
      if (!pjEdit) { expanded.add(p.id); store.set("expanded", [...expanded]); }
      await loadHistory();
      if (pjDone) pjDone(p);
      else if (!pjEdit) { show("project", p.id); toast(t("pj.created", { name: p.name })); }
    } catch (err) {
      $("pj-err").textContent = cleanErr(err);
      $("pj-err").hidden = false;
      $("pj-name").classList.remove("shake"); void $("pj-name").offsetWidth; $("pj-name").classList.add("shake");
      $("pj-ok").disabled = false;
    }
  });
  // One-line text prompt (rename) → the new text, or null.
  const dlgPr = $("dlg-prompt");
  function promptDialog({ title, value, sub, ok }) {
    $("pr-title").textContent = title;
    $("pr-input").value = value || "";
    $("pr-sub").textContent = sub || "";
    $("pr-sub").hidden = !sub;
    $("pr-ok").textContent = ok;
    dlgPr.returnValue = "";
    dlgPr.showModal();
    $("pr-input").select();
    return new Promise((res) => { dlgPr.onclose = () => res(dlgPr.returnValue === "ok" ? $("pr-input").value.trim() : null); });
  }
  $("pr-input").addEventListener("input", () => { $("pr-ok").disabled = !$("pr-input").value.trim(); });

  // Project page: header, actions, totals, a run in progress, and the notebooks.
  let pjSort = store.get("pjSort", "new");
  let pjTag = null, pjTagOf = null;   // the tag filter on a project page (cleared when another project opens)
  function renderProject(full) {
    const p = projOf(selected);
    const view = $("project-view");
    if (!p) { show("home"); return; }
    setCrumb(t("home.title"), () => show("home"));
    const notes = notesOf(p.id).slice().sort((a, b) => (pjSort === "name" ? a.title.localeCompare(b.title, loc()) : b.startedAt.localeCompare(a.startedAt)));
    const done = notes.filter((h) => h.status === "done");
    const sum = (k) => done.reduce((a, h) => a + (h[k] || 0), 0);
    $("page-title").textContent = p.name;
    $("page-sub").textContent = p.exists === false ? t("pj.gone") : t("pj.count", { n: notes.length });
    view.innerHTML = `
      <div class="d-head">
        ${folderTile(p, "big")}
        <div class="d-title"><h2></h2><button class="path-link" type="button"></button></div>
      </div>
      <div class="d-actions" id="pj-actions"></div>
      <div class="stats">
        <div class="stat"><div class="k">${esc(t("pj.notebooks"))}</div><div class="v" data-count="${notes.length}">0</div></div>
        ${["tap", "brief", "wbs"].map((f) => `<div class="stat"><div class="k">${esc(t("fmt." + f))}</div><div class="v" data-count="${notes.filter((h) => fmtOf(h.options) === f).length}">0</div></div>`).join("")}
      </div>
      <div class="pj-run" id="pj-run" hidden></div>
      <div class="card pj-notes" id="pj-notes">
        <div class="card-h"><b>${esc(t("pj.notebooks"))}</b>
          <div class="seg seg-sort" id="pj-sort" role="radiogroup" ${notes.length > 1 ? "" : "hidden"}>
            <button type="button" data-v="new">${esc(t("pj.sortNew"))}</button><button type="button" data-v="name">${esc(t("pj.sortName"))}</button>
          </div>
        </div>
        <div class="tag-chips pj-tags" id="pj-tags" hidden></div>
        <div class="nb-grid" id="nb-grid"></div>
      </div>`;
    view.querySelector("h2").textContent = p.name;
    const pl = view.querySelector(".path-link");
    pl.textContent = "\u200E" + p.dir + "\u200E";   // LRM: keep the leading "/" in place under direction:rtl
    pl.title = revealLabel();
    pl.disabled = p.exists === false;
    pl.addEventListener("click", () => openFile(p.dir));
    const acts = $("pj-actions");
    const add = (label, ic, fn, cls = "", disabled = false) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn " + cls; b.disabled = disabled;
      b.innerHTML = icon(ic) + `<span>${esc(label)}</span>`;
      b.addEventListener("click", fn);
      acts.appendChild(b);
    };
    add(t("pj.newNote"), "spark", () => newNotebookIn(p.id), "prominent");
    add(t("pj.openFolder"), "folder", () => openFile(p.dir), "", p.exists === false);
    add(t("pj.edit"), "pencil", () => openProjectDialog(p));
    add(t("pj.remove"), "trash", () => confirmRemoveProject(p), "danger");
    if (full) countUp(view.querySelector(".stats"));
    else view.querySelectorAll("[data-count]").forEach((e) => (e.textContent = (+e.dataset.count).toLocaleString(loc())));
    const seg = $("pj-sort");
    segObserver.observe(seg);
    setSeg("pj-sort", pjSort);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.dataset.v === pjSort) return;
      pjSort = b.dataset.v; store.set("pjSort", pjSort);
      setSeg("pj-sort", pjSort);
      notes.sort((a, b2) => (pjSort === "name" ? a.title.localeCompare(b2.title, loc()) : b2.startedAt.localeCompare(a.startedAt)));
      paintGrid(true);
    });
    // Tag filter: "All" plus every tag used in this project; a chip on a card picks it too.
    if (pjTagOf !== p.id) { pjTag = null; pjTagOf = p.id; }
    const tags = allTags(notes);
    if (pjTag && !tags.some((x) => fold(x) === fold(pjTag))) pjTag = null;
    const pickTag = (tg) => { pjTag = tg && pjTag && fold(tg) === fold(pjTag) ? null : tg; paintGrid(true); };
    function paintGrid(animate) {
      const bar = $("pj-tags");
      bar.hidden = !tags.length;
      bar.textContent = "";
      if (tags.length) {
        const all = document.createElement("button");
        all.type = "button"; all.className = "tag-chip all" + (pjTag ? "" : " on");
        all.textContent = t("tg.all");
        all.addEventListener("click", () => pickTag(null));
        bar.appendChild(all);
        tags.forEach((tg) => bar.appendChild(tagChip(tg, { on: pickTag, active: pjTag && fold(tg) === fold(pjTag), count: notes.filter((h) => tagsOf(h).some((x) => fold(x) === fold(tg))).length })));
      }
      const shown = pjTag ? notes.filter((h) => tagsOf(h).some((x) => fold(x) === fold(pjTag))) : notes;
      renderNoteGrid(p, shown, animate, pickTag);
    }
    renderProjectRun(p);
    paintGrid(full);
    dropTarget($("pj-notes"), p.id);
  }
  function renderProjectRun(p) {
    const box = $("pj-run");
    if (!box) return;
    const r = runs.find((x) => x.projectId === p.id && (x.state === "running" || x.state === "paused"));
    box.hidden = !r;
    if (!r) return;
    box.innerHTML = `<button class="active-run s-${r.state}" type="button"><span class="tile run-tile s-${r.state}">${stateIcon(r.state)}</span>
      <span class="ar-txt"><small>${esc(t("ar.title"))} · ${esc(t("rs." + r.state))}</small><b></b>
      <span class="mini-bar"><i style="--p:${runProgress(r)}"></i></span><small>${esc(t("r.progress", { done: doneCount(r), n: r.items.length }))}</small></span>
      <span class="ar-go">${esc(t("ar.view"))}${icon("chev")}</span></button>`;
    box.querySelector("b").textContent = r.title;
    box.firstChild.addEventListener("click", () => show("run", r.id));
  }
  function renderNoteGrid(p, notes, animate, onTag) {
    const grid = $("nb-grid");
    grid.textContent = "";
    grid.classList.toggle("empty", !notes.length);
    if (!notes.length) {
      grid.innerHTML = `<div class="pj-empty"><span class="idle-ico">${icon("stack")}</span><b>${esc(t("pj.empty"))}</b><span>${esc(t("pj.emptyText"))}</span></div>`;
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn prominent";
      b.innerHTML = icon("spark") + `<span>${esc(t("pj.firstNote"))}</span>`;
      b.addEventListener("click", () => newNotebookIn(p.id));
      grid.firstChild.appendChild(b);
      return;
    }
    notes.forEach((h, i) => grid.appendChild(noteCard(h, i, animate, onTag)));
  }
  // A notebook as a card (project page, home): open on double click, ⋯ / right-click for actions, draggable.
  function noteCard(h, i, animate, onTag = (tg) => searchFor("#" + tg + " ")) {
    const c = document.createElement("div");
    c.className = "nb-card" + (animate ? " enter" : "") + (h.status === "failed" ? " failed" : !h.exists ? " gone" : "");
    c.style.setProperty("--i", i);
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.dataset.id = h.id;
    const state = h.status === "failed" ? t("d.failed") : !h.exists ? t("d.gone") : "";
    c.innerHTML = `${tileHTML(h.title)}<span class="nb-txt"><b></b><small></small>${state ? `<em></em>` : ""}</span><span class="fmt-badge ${fmtOf(h.options)}"></span><span class="nb-acts"></span>`;
    c.querySelector(".fmt-badge").textContent = t("fmt." + fmtOf(h.options));
    c.querySelector("b").textContent = h.title;
    c.querySelector("small").textContent = noteSub(h);
    if (state) c.querySelector("em").textContent = state;
    if (tagsOf(h).length) {
      const row = document.createElement("span");
      row.className = "tag-chips nb-tags";
      tagsOf(h).slice(0, 3).forEach((tg) => row.appendChild(tagChip(tg, { on: onTag })));
      if (tagsOf(h).length > 3) row.insertAdjacentHTML("beforeend", `<span class="tag-more">+${tagsOf(h).length - 3}</span>`);
      c.querySelector(".nb-txt").appendChild(row);
    }
    const acts = c.querySelector(".nb-acts");
    const ib = (ic, label, fn, disabled) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "icon-btn"; b.title = label; b.setAttribute("aria-label", label); b.disabled = !!disabled;
      b.innerHTML = icon(ic);
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(e); });
      acts.appendChild(b);
    };
    if (h.status === "done") ib("eye", t("pv.quick"), () => openPreview(h), !h.exists);
    ib("more", t("nb.more"), (e) => openMenu(e.currentTarget, noteMenu(h), { alignRight: true }));
    c.addEventListener("click", () => show("detail", h.id));
    c.addEventListener("keydown", (e) => {
      if (e.target !== c) return;
      if (e.key === "Enter") { e.preventDefault(); c.click(); }
      if (e.key === " ") { e.preventDefault(); if (h.status === "done" && h.exists) openPreview(h); else c.click(); }   // Space: quick look
    });
    c.addEventListener("dblclick", () => { if (h.status === "done" && h.exists) openPreview(h); });
    c.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, noteMenu(h)); });
    draggableNote(c, h);
    return c;
  }

  // ---------- Home: all projects (top level) ----------
  function lastActivity(p) {
    return Math.max(p.updatedAt || 0, ...notesOf(p.id).map((h) => Date.parse(h.startedAt) || 0));
  }
  function renderHome(full) {
    const view = $("home-view");
    const loose = history.filter((h) => !projOf(h.projectId));
    const list = projects.slice().sort((a, b) => lastActivity(b) - lastActivity(a));
    $("page-title").textContent = t("home.title");
    $("page-sub").textContent = t("nav.homeSub", { p: projects.length, n: history.length });
    view.innerHTML = `
      <div class="home-head">
        <div class="d-title"><h2>${esc(t("home.title"))}</h2><span>${esc(t("home.sub"))}</span></div>
        <button class="btn prominent" type="button" id="home-new">${icon("folderPlus")}<span>${esc(t("lib.newProject"))}</span></button>
      </div>
      <div class="pj-run" id="home-run" hidden></div>
      <div class="pj-grid" id="pj-grid"></div>
      <div class="card" id="home-loose" hidden>
        <div class="card-h"><b>${esc(t("lib.loose"))}</b><span class="hint">${esc(t("home.looseHint"))}</span></div>
        <div class="nb-grid" id="loose-grid"></div>
      </div>`;
    $("home-new").addEventListener("click", () => openProjectDialog());
    const grid = $("pj-grid");
    if (!projects.length) {
      grid.classList.add("empty");
      grid.innerHTML = `<div class="pj-empty home-empty"><span class="idle-ico">${icon("folderPlus")}</span><b>${esc(t("home.empty"))}</b><span>${esc(t("home.emptyText"))}</span></div>`;
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn prominent";
      b.innerHTML = icon("folderPlus") + `<span>${esc(t("lib.firstProject"))}</span>`;
      b.addEventListener("click", () => openProjectDialog());
      grid.firstChild.appendChild(b);
    }
    list.forEach((p, i) => {
      const notes = notesOf(p.id);
      const c = document.createElement("div");
      c.className = "pj-card" + (full ? " enter" : "");
      c.style.setProperty("--i", i);
      c.tabIndex = 0;
      c.setAttribute("role", "button");
      c.dataset.id = p.id;
      const recent = notes.slice(0, 3);
      c.innerHTML = `
        <div class="pj-card-h">${folderTile(p)}<span class="pj-card-t"><b></b><small></small></span><button class="icon-btn" type="button">${icon("more")}</button></div>
        <ul class="pj-recent">${recent.map((h) => `<li>${tileHTML(h.title, "xs")}<span></span></li>`).join("") || `<li class="none">${esc(t("pj.emptyShort"))}</li>`}</ul>
        <div class="pj-card-f"><span>${esc(t("pj.count", { n: notes.length }))}</span><span>${esc(lastActivity(p) ? t("pj.updated", { ago: ago(new Date(lastActivity(p)).toISOString()) }) : "")}</span></div>`;
      c.querySelector("b").textContent = p.name;
      c.querySelector("small").textContent = p.exists === false ? t("pj.gone") : "\u200E" + p.dir + "\u200E";
      c.querySelectorAll(".pj-recent li:not(.none) > span:last-child").forEach((sp, k) => (sp.textContent = recent[k].title));
      c.querySelector(".pj-card-h .icon-btn").setAttribute("aria-label", t("nb.more"));
      c.querySelector(".pj-card-h .icon-btn").addEventListener("click", (e) => { e.stopPropagation(); openMenu(e.currentTarget, projectMenu(p), { alignRight: true }); });
      c.addEventListener("click", () => { expanded.add(p.id); store.set("expanded", [...expanded]); show("project", p.id); });
      c.addEventListener("keydown", (e) => { if (e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); c.click(); } });
      c.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, projectMenu(p)); });
      dropTarget(c, p.id);
      grid.appendChild(c);
    });
    if (projects.length) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "pj-card pj-add" + (full ? " enter" : "");
      add.style.setProperty("--i", list.length);
      add.innerHTML = `<span class="tile new-tile">${icon("plus")}</span><b>${esc(t("lib.newProject"))}</b><small>${esc(t("home.newSub"))}</small>`;
      add.addEventListener("click", () => openProjectDialog());
      grid.appendChild(add);
    }
    $("home-loose").hidden = !loose.length;
    loose.forEach((h, i) => $("loose-grid").appendChild(noteCard(h, i, full)));
    renderHomeRun();
  }
  function renderHomeRun() {
    const box = $("home-run");
    if (!box) return;
    const r = runs.find((x) => x.state === "running") || runs.find((x) => x.state === "paused");
    box.hidden = !r;
    if (!r) return;
    const rp = projOf(r.projectId);
    box.innerHTML = `<button class="active-run s-${r.state}" type="button"><span class="tile run-tile s-${r.state}">${stateIcon(r.state)}</span>
      <span class="ar-txt"><small>${esc(t("ar.title"))} · ${esc(t("rs." + r.state))}${rp ? " · " + esc(rp.name) : ""}</small><b></b>
      <span class="mini-bar"><i style="--p:${runProgress(r)}"></i></span><small>${esc(t("r.progress", { done: doneCount(r), n: r.items.length }))}</small></span>
      <span class="ar-go">${esc(t("ar.view"))}${icon("chev")}</span></button>`;
    box.querySelector("b").textContent = r.title;
    box.firstChild.addEventListener("click", () => show("run", r.id));
  }

  // ---------- Toast: short confirmation after an action, with an optional button ----------
  // Open a file or folder; say so when it's gone instead of doing nothing.
  // ---------- Quick look: a notebook (and its source files) inside the app ----------
  // Notebooks run their own script in a sandboxed frame on their own origin (slpreview://); PDFs use
  // Chromium's viewer (which a sandboxed frame would block), images and text show as they are.
  const PV_KIND = { html: "html", htm: "html", pdf: "pdf", png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", svg: "img", txt: "text", md: "text", csv: "text", json: "text" };
  const pv = { h: null, items: [], i: 0, seq: 0 };
  function openPreview(h, start) {
    pv.h = h;
    pv.items = [...(h.status === "done" && h.output ? [{ label: t("pv.notebook"), path: h.output, main: true }] : []), ...h.files.map((f) => ({ label: nameOf(f), path: f }))];
    pv.i = Math.max(0, start ? pv.items.findIndex((x) => x.path === start) : 0);
    $("pv-name").textContent = h.title;
    const box = $("preview");
    if (box.hidden) {
      pv.back = document.activeElement;
      box.hidden = false;
      box.classList.remove("leaving");
      box.classList.add("entering");
      box.addEventListener("animationend", () => box.classList.remove("entering"), { once: true });
    }
    paintPvTabs();
    showPvItem(pv.i);
    $("pv-close").focus({ preventScroll: true });
  }
  function paintPvTabs() {
    const tabs = $("pv-tabs");
    tabs.textContent = "";
    tabs.hidden = pv.items.length < 2;
    pv.items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.role = "tab";
      b.className = "pv-tab" + (i === pv.i ? " on" : "");
      b.setAttribute("aria-selected", String(i === pv.i));
      b.innerHTML = (it.main ? icon("lens") : docGlyph(extOf(it.path))) + `<span class="pv-tab-l"></span>`;
      b.querySelector(".pv-tab-l").textContent = it.label;
      b.title = it.path;
      b.addEventListener("click", () => showPvItem(i));
      tabs.appendChild(b);
    });
  }
  async function showPvItem(i) {
    pv.i = i;
    const it = pv.items[i], seq = ++pv.seq;
    $("pv-tabs").querySelectorAll(".pv-tab").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", String(k === i)); });
    $("pv-tabs").children[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    $("pv-sub").textContent = it.main ? t("fmt." + fmtOf(pv.h.options)) : nameOf(it.path);
    $("pv-open").querySelector("span").textContent = t(it.main || PV_KIND[extOf(it.path)] === "html" ? "pv.external" : "pv.openApp");
    $("pv-open").onclick = () => openFile(it.path);
    $("pv-reveal").title = revealLabel(); $("pv-reveal").setAttribute("aria-label", revealLabel());
    $("pv-reveal").onclick = () => api.revealPath(it.path);
    const frame = $("pv-frame"), msg = $("pv-msg"), kind = PV_KIND[extOf(it.path)];
    const say = (title, sub, withOpen) => {
      frame.hidden = true; frame.src = "about:blank";
      msg.hidden = false;
      msg.innerHTML = `<span class="idle-ico">${docGlyph(extOf(it.path))}</span><b class="pv-msg-t"></b><span class="pv-msg-s"></span>`;
      msg.querySelector(".pv-msg-t").textContent = title;
      msg.querySelector(".pv-msg-s").textContent = sub || "";
      if (withOpen) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn prominent";
        b.innerHTML = icon("open") + `<span>${esc(t("pv.openApp"))}</span>`;
        b.addEventListener("click", () => openFile(it.path));
        msg.appendChild(b);
      }
    };
    $("pv-load").hidden = true;
    if (!kind) return say(t("pv.noPreview", { ext: extOf(it.path).toUpperCase() }), t("pv.noPreviewSub"), true);
    const url = await api.previewPath(it.path);
    if (seq !== pv.seq) return;
    if (url === "missing") return say(t("open.missing"));
    if (url === "denied") return say(t("pv.denied"));
    msg.hidden = true;
    frame.hidden = false;
    if (kind === "html") frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals");
    else frame.removeAttribute("sandbox");
    frame.classList.toggle("pv-doc", kind === "html" || kind === "pdf");
    frame.title = it.label;
    $("pv-load").hidden = false;
    frame.onload = () => { if (seq === pv.seq) $("pv-load").hidden = true; };
    frame.src = url;
  }
  function closePreview() {
    const box = $("preview");
    if (box.hidden || box.classList.contains("leaving")) return;
    pv.seq++;
    const done = () => { box.hidden = true; box.classList.remove("leaving"); $("pv-frame").src = "about:blank"; pv.back?.focus?.({ preventScroll: true }); };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    box.classList.add("leaving");
    box.addEventListener("animationend", done, { once: true });
  }
  $("pv-close").addEventListener("click", closePreview);
  document.addEventListener("keydown", (e) => {
    if ($("preview").hidden || document.querySelector("dialog[open]") || menuEl) return;
    if (e.key === "Escape") { e.preventDefault(); closePreview(); }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.closest?.("#pv-tabs")) {
      e.preventDefault();
      const n = pv.items.length;
      showPvItem((pv.i + (e.key === "ArrowRight" ? 1 : n - 1)) % n);
      $("pv-tabs").children[pv.i]?.focus();
    }
  });
  async function openFile(p) {
    const err = await api.openPath(p);
    if (err) toast(err === "missing" ? t("open.missing") : t("open.failed", { msg: err }), null, "warn");
  }
  function toast(text, action, tone) {
    let box = document.querySelector(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = "toast" + (tone ? " " + tone : "");
    el.innerHTML = `${icon(tone === "warn" ? "warn" : "check")}<span></span>`;
    el.querySelector("span").textContent = text;
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "link-btn"; b.textContent = action.label;
      b.addEventListener("click", () => { action.run(); gone(); });
      el.appendChild(b);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    const gone = () => { el.classList.add("leave"); setTimeout(() => el.remove(), 220); };
    setTimeout(gone, 3600);
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
    $("eng-path").textContent = aiInfo?.path ? "\u200E" + aiInfo.path + "\u200E" : "—";
    $("eng-path").title = aiInfo?.path || "";
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
  async function openSettings() {
    const root = settings.projectsRoot || (await api.projectsRoot());
    $("set-root").textContent = "\u200E" + root + "\u200E";
    $("set-root").title = root;
    if (!dlgSet.open) dlgSet.showModal();
  }
  $("btn-settings").addEventListener("click", openSettings);
  $("set-root-pick").addEventListener("click", async () => {
    const d = await api.pickDir();
    if (d) { settings = await api.saveSettings({ projectsRoot: d }); openSettings(); }
  });
  $("no-ai").addEventListener("click", () => $("btn-settings").click());
  $("set-close").addEventListener("click", () => closeDialog(dlgSet));
  dlgSet.addEventListener("click", (e) => { if (e.target === dlgSet) closeDialog(dlgSet); });   // click on the backdrop
  $("eng-check").addEventListener("click", checkAI);
  // Appearance: system / light / dark (Settings cards and the header button's menu).
  const THEME_ICON = { system: "auto", light: "sun", dark: "moon" };
  const themeOf = () => settings?.theme || "system";
  function paintTheme() {
    const m = themeOf();
    document.querySelectorAll("#set-theme .theme-card").forEach((b) => { b.classList.toggle("on", b.dataset.v === m); b.setAttribute("aria-checked", String(b.dataset.v === m)); });
    const hb = $("hdr-theme");
    hb.innerHTML = icon(THEME_ICON[m]);
    hb.title = t("th.btn", { mode: t("th." + m) });
    hb.setAttribute("aria-label", hb.title);
  }
  async function setTheme(m) {
    if (m === themeOf()) return;
    // A short cross-fade while the colours swap (main switches nativeTheme; CSS follows prefers-color-scheme).
    const root = document.documentElement;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-swap");
      clearTimeout(setTheme.timer);
      setTheme.timer = setTimeout(() => root.classList.remove("theme-swap"), 450);
    }
    settings = await api.saveSettings({ theme: m });
    paintTheme();
  }
  $("set-theme").addEventListener("click", (e) => { const b = e.target.closest(".theme-card"); if (b) setTheme(b.dataset.v); });
  $("hdr-theme").addEventListener("click", (e) => openMenu(e.currentTarget, ["system", "light", "dark"].map((m) => ({ label: t("th." + m), icon: THEME_ICON[m], check: themeOf() === m, run: () => setTheme(m) })), { alignRight: true }));
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
    setDropTitle();
    paintFormat();
    paintTheme();
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
  // Files from the system. Windows: the page's own drag events; the paths come from the app
  // (api.pathsForFiles). macOS: the app reports the drag itself, with the paths (api.onFileDrag).
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  // Files dropped on a project (its page, one of its notebooks, or the new page) start a notebook in it.
  function dropProject() {
    if (page === "new") return newProject;
    if (page === "project") return selected;
    if (page === "detail") return projOf(history.find((h) => h.id === selected)?.projectId)?.id || null;
    return null;
  }
  function filesEnter() {
    if (running) return false;
    const ctx = dropProject();
    if (!ctx) return false;              // home / runs: no project to put the files in
    if (page !== "new") newNotebookIn(ctx);
    drop.classList.add("over");
    setDropTitle();
    return true;
  }
  function filesLeave() {
    dragDepth = 0;
    drop.classList.remove("over");
    setDropTitle();
  }
  if (api.onFileDrag) {
    let inside = false;
    api.onFileDrag((e) => {
      if (e.type === "enter") inside = filesEnter();
      else if (e.type === "leave") { inside = false; filesLeave(); }
      else if (e.type === "drop") {
        const was = inside;
        inside = false;
        filesLeave();
        if (!was || page !== "new" || running || !e.paths.length) return;
        addPaths(e.paths, { x: e.x, y: e.y });
      }
    });
  } else {
    document.addEventListener("dragenter", (e) => {
      if (!hasFiles(e) || !filesEnter()) return;
      e.preventDefault();
      dragDepth++;
    });
    document.addEventListener("dragover", (e) => { if (hasFiles(e) && dropProject()) e.preventDefault(); });
    document.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      if (--dragDepth <= 0) filesLeave();
    });
    document.addEventListener("drop", async (e) => {
      filesLeave();
      if (!e.dataTransfer.files.length || page !== "new") return;
      e.preventDefault();
      if (running) return;
      const list = [...e.dataTransfer.files];
      const at = { x: e.clientX, y: e.clientY };
      const paths = await api.pathsForFiles(list);
      addPaths(list.map((f, i) => ({ path: paths[i], size: f.size })), at);
    });
  }

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
  // Notebook type: two cards; the idle text on the right follows the choice.
  function setFormat(f, save) {
    format = f === "brief" || f === "wbs" ? f : "tap";
    setSeg("o-format", format);
    paintFormat();
    if (save) api.saveSettings({ format });
  }
  function paintFormat() {
    $("idle-text").textContent = t({ tap: "run.idleText", brief: "run.idleTextBrief", wbs: "run.idleTextWbs" }[format]);
    $("idle-small").textContent = t({ tap: "run.idleSmall", brief: "run.idleSmallBrief", wbs: "run.idleSmallWbs" }[format]);
    refresh();
  }
  $("o-format").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b.dataset.v !== format) setFormat(b.dataset.v, true);
  });
  // The project the new notebook goes into (set when entering the new page from a project).
  function setNewProject(id) {
    if ((id || "") !== newProject) { newProject = id || ""; api.saveSettings({ projectId: newProject }); }
    paintSaveHint();
  }
  function paintSaveHint() {
    const p = projOf(newProject);
    if (!p) return;
    const sep = navigator.platform.startsWith("Win") ? "\\" : "/";
    $("o-save-hint").innerHTML = folderTile(p, "xs") + `<span></span>`;
    $("o-save-hint").lastChild.textContent = t("opts.projectSub", { dir: p.dir + sep });
    $("o-save-hint").title = p.dir;
  }
  $("o-research").addEventListener("change", (e) => api.saveSettings({ research: e.target.checked }));

  function refresh() {
    const busy = !!busyRun();
    // WBS Map reads an Excel WBS: one notebook needs an .xlsx among its files; one per file needs all .xlsx.
    const isX = (f) => /\.xlsx$/i.test(f.path);
    const wbsBad = format === "wbs" && files.length ? (separate() ? (files.some((f) => !isX(f)) ? "fmt.wbsEachXlsx" : "") : (!files.some(isX) ? "fmt.wbsNeedXlsx" : "")) : "";
    $("fmt-warn").hidden = !wbsBad;
    if (wbsBad) $("fmt-warn").lastChild.textContent = t(wbsBad);
    $("go").disabled = busy || !claudeOk || !projOf(newProject) || !files.length || files.some((f) => f.status === "checking") || !!wbsBad;
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
  const modelName = (m) => (m ? m[0].toUpperCase() + m.slice(1) : t("d.defaultModel"));
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
  function itemMeta(it, r) {
    if (it.status === "done") return `${t(FMT_KEYS[fmtOf(r?.options)][3], { slides: it.slides, articles: it.articles })} · ${fmtMs(it.elapsedMs)}`;
    if (it.status === "failed") return it.error || "";
    if (it.status === "waiting") return t("r.waitingNote");
    if (!it.elapsedMs && !it.activeSince) return "";
    return `${fmtMs(itemElapsed(it))}${it.attempts > 1 ? " · " + t("r.attempt", { n: it.attempts }) : ""}`;
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
    // Only this project's runs: the new page always belongs to one project.
    const list = runs.filter((r) => r !== active && r.projectId && r.projectId === newProject).slice(0, 5);
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
    const rpj = projOf(r.projectId);
    if (rpj) setCrumb(rpj.name, () => show("project", rpj.id));
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
          <div class="stat"><div class="k">${esc(t("d.model"))}</div><div class="v">${esc(model)}</div></div>
        </div>
        <div class="r-controls" id="r-controls"></div>
        <p class="r-hint" id="r-hint" hidden></p>
      </div>
      <div class="r-items" id="r-items"></div>`;
    view.querySelector("h2").textContent = r.title;
    const rp = projOf(r.projectId);
    const subF = `${t("fmt." + fmtOf(r.options))} · ${sub}`;
    view.querySelector(".r-sub").textContent = rp ? `${rp.name} · ${subF}` : subF;
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
      if (outs.length === 1) add(t("run.open"), "open", () => openFile(outs[0].output), r.state === "done" ? "prominent" : "");
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
      meta.textContent = itemMeta(it, r);
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
      if (it.status === "done" && it.output) ib("open", t("ia.open"), () => openFile(it.output));
      if (["failed", "stopped", "skipped", "done"].includes(it.status) && r.state !== "running") ib("redo", t("ia.retry"), () => itemAct(r, it, "retry"));
      if (["waiting", "running", "paused", "stopped"].includes(it.status) && r.items.length > 1) ib("skip", t("ia.skip"), () => itemAct(r, it, "skip"));
      if (it.workDir) ib("folder", t("ia.folder"), () => openFile(it.workDir));
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
      outputDir: "",
      projectId: newProject || undefined,
      format,
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
      if (page === "run" && selected === r.id) show("home");
    } else {
      const i = runs.findIndex((x) => x.id === r.id);
      if (i >= 0) runs[i] = r; else runs.unshift(r);
      if (r.state !== "running") for (const it of r.items) activity.delete(it.id);
    }
    updateRunsBadge();
    if (sideTab === "runs") renderRunList();
    if (page === "new") { renderActiveRun(); renderRecentRuns(); }
    if (page === "home") renderHomeRun();
    if (page === "run" && selected === r.id) renderRun(false);
    if (page === "project" && r.projectId === selected) renderProjectRun(projOf(selected));
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
    if (m) m.textContent = itemMeta(it, r);
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
    // A new version found: the button installs it instead of checking again.
    $("up-check").querySelector("span").textContent = t(update?.available ? "up.see" : "up.check");
    $("up-check").classList.toggle("prominent", !!update?.available);
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
  $("up-check").addEventListener("click", () => (update?.available ? openUpdate() : checkUpdate()));
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

  // ---------- Dev hooks for the screenshot mode (STUDYLENS_SHOOT, driven by scripts/shoot.js) ----------
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
    settings: () => openSettings(),
    checking: () => { aiInfo = null; paintAI(); },
    closeSettings: () => dlgSet.close(),
    noAi: () => { aiInfo = { found: false, error: t("files.unreadable") }; claudeOk = false; paintAI(); refresh(); },
    // Real runs (with STUDYLENS_FAKE_CLAUDE): pick files, choose the mode, press Process.
    setFiles: async (paths, mode) => {
      files = []; rows.forEach((li) => li.remove()); rows.clear(); renderFiles();
      await addPaths(paths);
      outMode = mode; setSeg("o-mode", outMode); renderFiles();
    },
    createProject: async (name, color, parent) => { const p = await api.createProject({ name, color, parent }); await loadHistory(); return p.id; },
    useProject: (name) => setNewProject(projects.find((x) => x.name === name)?.id || ""),
    process: async (outDir) => {
      settings = { ...settings, outputDir: outDir };
      await checkAI();
      $("go").click();
    },
    run: () => runs.find((r) => r.id === selected) || runs[0],
    act: (a) => runAct(runs.find((r) => r.id === selected), a),
    tab: (tb) => setTab(tb),
    newPage: () => (projOf(newProject) ? show("new") : newNotebookIn(projects[0]?.id)),
    home: () => show("home"),
    project: (name) => { const p = projects.find((x) => x.name === name) || projects[0]; if (p) show("project", p.id); },
    newProjectDialog: () => openProjectDialog(),
    closeDialogs: () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    menu: (sel) => document.querySelector(sel)?.click(),
    reload: () => loadHistory(),
    ready: () => booted,
    fakeUpdate: () => { update = { current: "0.1.0", latest: "0.1.1", available: true, publishedAt: new Date().toISOString(), notes: "• Pause and continue runs, even after a restart\n• Each notebook can have its own name\n• Faster startup" }; paintUpdate(); openUpdate(); },
  };

  // ---------- Boot ----------
  let booted = false;
  (async () => {
    settings = await api.getSettings();
    setSeg("o-model", settings.model);
    setSeg("o-lang", settings.lang);
    outMode = settings.outMode === "separate" ? "separate" : "merge";
    newProject = settings.projectId || "";
    setFormat(settings.format);
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
    await loadHistory();
    checkAI();
  })();
})();
