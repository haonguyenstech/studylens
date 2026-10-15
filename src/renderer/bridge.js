// window.api: what the UI (app.js) asks of the app, on top of Tauri's invoke/listen.
// Errors come back as plain strings; they are turned into Error objects so the UI can show e.message.
(function () {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const call = (cmd, args) => invoke(cmd, args).catch((e) => { throw new Error(typeof e === "string" ? e : e?.message || String(e)); });
  const on = (name, cb) => { listen(name, (e) => cb(e.payload)); };
  const mac = new URLSearchParams(location.search).get("platform") === "darwin";

  // Windows: a dropped File's path comes from WebView2 (files posted to the app, which reads their paths).
  let dropSeq = 0;
  const dropWaits = new Map();
  if (!mac) listen("drop:paths", ({ payload }) => { dropWaits.get(payload.id)?.(payload.paths); dropWaits.delete(payload.id); });
  function pathsForFiles(files) {
    const wv = window.chrome?.webview;
    if (!wv?.postMessageWithAdditionalObjects || !files.length) return Promise.resolve(files.map(() => ""));
    const id = ++dropSeq;
    return new Promise((resolve) => {
      dropWaits.set(id, resolve);
      wv.postMessageWithAdditionalObjects(`studylens:paths:${id}`, files);
      setTimeout(() => { if (dropWaits.delete(id)) resolve(files.map(() => "")); }, 5000);
    });
  }

  // Title-bar areas (.drag) move the window; double-click zooms it. The WebView ignores
  // -webkit-app-region, so it is done here, with the same .no-drag / button / input exceptions.
  const win = window.__TAURI__.window.getCurrentWindow();
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !e.target.closest?.(".drag")) return;
    if (e.target.closest(".no-drag, button, input, select, textarea, a, [contenteditable]")) return;
    e.preventDefault();
    if (e.detail === 2) win.toggleMaximize();
    else win.startDragging();
  });

  window.api = {
    pickFiles: () => call("files_pick"),
    statFiles: (paths) => call("files_stat", { paths }),
    pickDir: () => call("dir_pick"),
    claudeInfo: () => call("claude_info"),
    getSettings: () => call("settings_get"),
    saveSettings: (patch) => call("settings_save", { patch }),
    startRun: (req) => call("run_start", { req }),
    runAction: (runId, action) => call("run_action", { runId, action }),
    itemAction: (runId, itemId, action) => call("run_item", { runId, itemId, action }),
    listRuns: () => call("run_list"),
    runLog: (runId, itemId) => call("run_log", { runId, itemId }),
    onRun: (cb) => on("run:update", cb),
    onTick: (cb) => on("run:tick", cb),
    listHistory: () => call("history_list"),
    removeHistory: (id) => call("history_remove", { id }),
    onHistoryChanged: (cb) => on("history:changed", () => cb()),
    listProjects: () => call("projects_list"),
    projectsRoot: () => call("projects_root"),
    createProject: (p) => call("projects_create", { name: p.name, color: p.color, parent: p.parent || null }),
    updateProject: (id, patch) => call("projects_update", { id, name: patch.name ?? null, color: patch.color ?? null }),
    removeProject: (id, trash) => call("projects_remove", { id, trash }),
    renameNotebook: (id, title) => call("notebook_rename", { id, title }),
    previewPath: (path) => call("path_preview", { path }),
    moveNotebook: (id, projectId) => call("notebook_move", { id, projectId }),
    tagNotebook: (id, tags) => call("notebook_tags", { id, tags }),
    deleteNotebook: (id, trash) => call("notebook_delete", { id, trash }),
    restart: () => call("app_restart"),
    version: () => call("app_version"),
    checkUpdate: () => call("update_check"),
    installUpdate: () => call("update_install"),
    onUpdate: (cb) => on("update:available", cb),
    onUpdateProgress: (cb) => on("update:progress", cb),
    openPath: (path) => call("path_open", { path }),
    revealPath: (path) => call("path_reveal", { path }),
    pathsForFiles,
    // macOS: files dragged in from Finder, reported by the app with their paths.
    onFileDrag: mac ? (cb) => {
      const at = (p) => ({ x: (p?.x ?? 0) / devicePixelRatio, y: (p?.y ?? 0) / devicePixelRatio });
      listen("tauri://drag-enter", (e) => cb({ type: "enter", paths: e.payload.paths || [], ...at(e.payload.position) }));
      listen("tauri://drag-leave", () => cb({ type: "leave", paths: [] }));
      listen("tauri://drag-drop", (e) => cb({ type: "drop", paths: e.payload.paths || [], ...at(e.payload.position) }));
    } : null,
  };

  // A link clicked inside a previewed notebook opens in the browser (the preview page asks us).
  window.addEventListener("message", (e) => {
    const url = e.data && e.data.studylensOpen;
    if (typeof url === "string" && e.source === document.getElementById("pv-frame")?.contentWindow) invoke("open_external", { url });
  });
})();
