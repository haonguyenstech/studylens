import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from "electron";
import { pathToFileURL } from "node:url";
import { Lang, setLang, t } from "./i18n";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ItemAction, Run, RunAction, RunRequest, Settings } from "../shared/types";
import { findClaude } from "./claude";
import { ACCEPTED } from "./convert";
import { Library, LibraryError } from "./library";
import { RunManager } from "./runs";
import { renderMermaid } from "./diagrams";
import { inOwnFolder } from "./paths";
import { checkForUpdate, installUpdate, UpdateInfo } from "./updater";
import { shootGuide } from "./guide-shots";

app.setName("StudyLens");
// In-app preview: notebooks and source files are served as slpreview://f/<absolute path>, own origin (not the app's).
protocol.registerSchemesAsPrivileged([{ scheme: "slpreview", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
// Screenshot/test runs keep their own settings and history, away from the real ones.
if (process.env.STUDYLENS_SHOOT) {
  mkdirSync(path.join(process.env.STUDYLENS_SHOOT, "userdata"), { recursive: true });
  app.setPath("userData", path.join(process.env.STUDYLENS_SHOOT, "userdata"));
}
// Dev: STUDYLENS_THEME=light|dark forces the theme (used with STUDYLENS_SHOOT).
const forcedTheme = process.env.STUDYLENS_THEME === "light" || process.env.STUDYLENS_THEME === "dark" ? process.env.STUDYLENS_THEME : null;
// Light / dark / follow the system: the renderer's prefers-color-scheme follows nativeTheme.
function applyTheme(theme?: Settings["theme"]) {
  nativeTheme.themeSource = forcedTheme ?? (theme === "light" || theme === "dark" ? theme : "system");
}
const isMac = process.platform === "darwin";
const assetsDir = path.join(__dirname, "..", "assets");
const userFile = (f: string) => path.join(app.getPath("userData"), f);
const jobsDir = () => userFile("jobs");

// ---------- Settings ----------
const DEFAULTS: Settings = { claudePath: "", model: "", research: true, lang: "Tiếng Việt", outputDir: "", uiLang: "" };

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}
const loadSettings = (): Settings => ({ ...DEFAULTS, ...readJson<Partial<Settings>>(userFile("settings.json"), {}) });
// UI language: what the user picked, else the system language (Vietnamese system → vi, anything else → en).
const uiLangOf = (s: Settings): Lang => (s.uiLang === "vi" || s.uiLang === "en" ? s.uiLang : app.getLocale().toLowerCase().startsWith("vi") ? "vi" : "en");
function saveSettings(patch: Partial<Settings>): Settings {
  const s = { ...loadSettings(), ...patch };
  writeJson(userFile("settings.json"), s);
  return s;
}

// ---------- Library: projects and the notebooks made so far ----------
const library = new Library(app.getPath("userData"), (p) => shell.trashItem(p), () => win?.webContents.send("history:changed"),
  (from, to) => runs.relocate(from, to));
const projectsRoot = () => loadSettings().projectsRoot || path.join(app.getPath("documents"), "StudyLens");
// A run writing into a project: its folder must not move until the run is done.
function guardProject(id: string | undefined) {
  const r = runs.activeRun();
  if (id && r?.projectId === id) throw new Error(t("lib.busy"));
}
const libErr = (e: unknown) => {
  if (e instanceof LibraryError) return new Error(t(`lib.${e.code}`));
  return e as Error;
};
async function lib<T>(fn: () => T | Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { throw libErr(e); }
}

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "StudyLens",
    // macOS: the native corner here is only ~10pt, too tight for an inset sidebar, so the window is
    // transparent and the page draws its own 26pt corner (traffic lights and shadow stay native).
    backgroundColor: isMac ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#1E1E1E" : "#F2F2F4",
    transparent: isMac,
    show: false,
    ...(isMac ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 22, y: 22 } } : {}),
    webPreferences: { preload: path.join(__dirname, "..", "preload", "index.js"), contextIsolation: true, sandbox: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { platform: process.platform } });
  const shoot = process.env.STUDYLENS_SHOOT;
  if (shoot) {
    win.webContents.on("console-message", (_e, level, message) => { if (level >= 2) console.log(`[renderer] ${message}`); });
    win.webContents.once("did-finish-load", () => (process.env.STUDYLENS_GUIDE ? shootGuide(win!, shoot) : shootStates(shoot)));
  }
  else if (!process.env.STUDYLENS_HIDDEN) win.once("ready-to-show", () => win?.show());   // HIDDEN: dev self-test without a window
  // The shadow of a transparent window is traced from its pixels; refresh it once the page has painted and after resizes.
  if (isMac) {
    const reshadow = () => setTimeout(() => win?.invalidateShadow(), 60);
    win.webContents.on("did-finish-load", reshadow);
    win.on("resize", reshadow);
  }
  if (process.env.STUDYLENS_DEV) devReload(win);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  // A link followed inside the preview opens in the browser instead of replacing the preview.
  win.webContents.on("will-frame-navigate", (e) => {
    if (e.isMainFrame || e.url.startsWith("slpreview:") || e.url.startsWith("about:")) return;
    e.preventDefault();
    if (/^https?:|^mailto:/.test(e.url)) shell.openExternal(e.url);
  });
  win.on("closed", () => { win = null; });
}

// Dev mode (`npm run dev` sets STUDYLENS_DEV): when dist/renderer changes, swap CSS in place
// (page keeps its state) or reload the window for HTML/JS. F12 / Cmd+Opt+I opens DevTools.
function devReload(w: BrowserWindow) {
  const dir = path.join(__dirname, "..", "renderer");
  let timer: NodeJS.Timeout | null = null;
  const changed = new Set<string>();
  watch(dir, { recursive: true }, (_e, f) => {
    if (!f) return;
    changed.add(String(f));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const cssOnly = [...changed].every((x) => x.endsWith(".css"));
      changed.clear();
      if (w.isDestroyed()) return;
      if (cssOnly) w.webContents.send("dev:css");
      else w.webContents.reload();
      console.log(`[dev] ${cssOnly ? "css swapped" : "window reloaded"}`);
    }, 120);
  });
  w.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && (input.key === "F12" || (input.key.toLowerCase() === "i" && input.alt && (input.meta || input.control)))) {
      w.webContents.toggleDevTools();
    }
  });
}

// Dev: STUDYLENS_SHOOT=<dir> renders each UI state offscreen to PNG, then quits.
async function shootStates(dir: string) {
  const w = win!;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const js = (code: string) => w.webContents.executeJavaScript(code).catch((e) => console.log(`[shoot] ${code.slice(0, 60)} → ${e.message}`));
  const snap = async (name: string) => { await wait(450); writeFileSync(path.join(dir, name + ".png"), (await w.webContents.capturePage()).toPNG()); };
  mkdirSync(dir, { recursive: true });
  await wait(1200);
  const state = () => js(`(() => { const r = window.__test.run(); return r ? r.state : ""; })()`);
  const until = async (ok: (s: string) => boolean, ms = 30000) => { for (let i = 0; i < ms / 250 && !ok(await state()); i++) await wait(250); };
  await js(`window.__test.history()`);
  await snap("1-empty");
  const pdir = path.join(dir, "projects");
  rmSync(pdir, { recursive: true, force: true });
  await js(`window.__test.createProject("System Design", "#5E5CE6", ${JSON.stringify(pdir)})`);
  await js(`window.__test.createProject("Mạng máy tính", "#30D158", ${JSON.stringify(pdir)})`);
  await wait(300);
  await snap("1c-home");
  await js(`window.__test.useProject("System Design"); window.__test.newPage()`);
  await wait(400);
  await js(`window.__test.over(true)`);
  await wait(350);
  await snap("1b-dragover");
  await js(`window.__test.over(false)`);
  // real files so the on-disk check passes
  const demo = path.join(dir, "demo");
  mkdirSync(demo, { recursive: true });
  const demoFiles = ["System+Design+-+Section+1.pdf", "System+Design+-+Section+15.pdf", "Week 3 lecture.pptx"];
  for (const n of demoFiles) writeFileSync(path.join(demo, n), Buffer.alloc(40000));
  await js(`window.__test.setFiles(${JSON.stringify(demoFiles.map((n) => path.join(demo, n)))}, "merge")`);
  await wait(1200);
  await snap("2-files");
  await js(`window.__test.setFiles(${JSON.stringify(demoFiles.map((n) => path.join(demo, n)))}, "separate")`);
  await wait(1200);
  await snap("2c-separate");
  await js(`document.querySelector('#o-format [data-v="wbs"]').click(); document.getElementById("o-format").scrollIntoView({ block: "center" })`);
  await wait(400);
  await snap("2e-wbs-needs-xlsx");
  await js(`document.querySelector('#o-format [data-v="tap"]').click()`);
  if (process.env.STUDYLENS_FAKE_CLAUDE) {
    // A real run through main: 3 files one per notebook, the 2nd fails on purpose; pause then continue.
    const bdir = path.join(dir, "batch");
    mkdirSync(bdir, { recursive: true });
    const names = ["Week 1 - Intro.pdf", "Week 2 broken scan.pdf", "Week 3 - Caching.pdf"];
    for (const n of names) writeFileSync(path.join(bdir, n), Buffer.alloc(2048));
    await js(`window.__test.setFiles(${JSON.stringify(names.map((n) => path.join(bdir, n)))}, "separate")`);
    await wait(900);
    await snap("2d-in-project");
    await js(`window.__test.process(${JSON.stringify(bdir)})`);
    await wait(1800);
    await snap("3-run-running");
    await js(`window.__test.act("pause")`);
    await until((s) => s === "paused");
    await wait(500);
    await snap("4-run-paused");
    await js(`window.__test.act("resume")`);
    await until((s) => s === "done" || s === "failed", 60000);
    await wait(900);
    await snap("5-run-finished");
    await js(`window.__test.newPage()`);
    await wait(500);
    await snap("6-new-after-run");
    await js(`window.__test.home()`);
    await wait(900);
    await snap("6a-home");
    await js(`window.__test.project("System Design")`);
    await wait(900);
    await snap("6b-project");
    // Tags: two notebooks tagged, the project page filter, the dialog, then a #tag search in the sidebar.
    await js(`(async () => { const h = (await window.api.listHistory()).filter((x) => x.status === "done");
      if (h[0]) await window.api.tagNotebook(h[0].id, ["Caching", "Thi cuối kỳ", "Redis"]);
      if (h[1]) await window.api.tagNotebook(h[1].id, ["Giới thiệu", "Thi cuối kỳ"]);
      await window.__test.reload(); })()`);
    await wait(700);
    await snap("6b2-project-tags");
    await js(`document.querySelector("#pj-tags .tag-chip:not(.all)")?.click()`);
    await wait(500);
    await snap("6b3-project-tag-filter");
    await js(`document.querySelector("#nb-grid .nb-card")?.click()`);
    await wait(700);
    await snap("6b4-detail-tags");
    await js(`document.querySelector("#d-tags .tag-add")?.click()`);
    await wait(400);
    await snap("6b5a-tags-templates");
    await js(`{ const i = document.getElementById("tg-input"); i.value = "ca"; i.dispatchEvent(new Event("input")) }`);
    await snap("6b5-tags-dialog");
    await js(`window.__test.closeDialogs()`);
    await js(`{ const q = document.getElementById("q"); q.value = "#th"; q.dispatchEvent(new Event("input")) }`);
    await wait(400);
    await snap("6b6-search-partial");
    await js(`{ const q = document.getElementById("q"); q.value = "#thi cuoi"; q.dispatchEvent(new Event("input")) }`);
    await wait(400);
    await snap("6b7-search-tag");
    await js(`{ const q = document.getElementById("q"); q.value = ""; q.dispatchEvent(new Event("input")); window.__test.project("System Design") }`);
    await wait(500);
    await js(`window.__test.menu("#nb-grid .nb-card .nb-acts .icon-btn:last-child")`);
    await snap("6c-note-menu");
    await js(`[...document.querySelectorAll(".menu .menu-item")].find((b) => b.textContent.includes("Mạng"))?.click()`);   // move to "Mạng máy tính"
    await wait(900);
    await snap("6d-moved-toast");
    // Quick look: Space on a notebook card, then a source file tab, then close.
    writeFileSync(path.join(bdir, names[0]), await w.webContents.printToPDF({}));   // a real PDF for the source tab
    await js(`(() => { const c = document.querySelector("#nb-grid .nb-card"); c?.focus(); c?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); })()`);
    await wait(1500);
    await snap("6p1-preview-notebook");
    await js(`document.querySelectorAll("#pv-tabs .pv-tab")[1]?.click()`);
    await wait(1200);
    await snap("6p2-preview-source");
    await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await wait(400);
    await snap("6p3-preview-closed");
    await js(`window.__test.newProjectDialog()`);
    await wait(300);
    await js(`document.getElementById("pj-name").value = "Kafka"; document.getElementById("pj-name").dispatchEvent(new Event("input"))`);
    await snap("6e-project-dialog");
    await js(`window.__test.closeDialogs()`);
  }
  await js(`window.__test.reload()`);
  await wait(300);
  await js(`window.__test.detail()`);
  await snap("7-detail");
  await js(`window.__test.settings()`);
  await snap("8-settings");
  if (!forcedTheme) {
    await js(`document.getElementById("set-theme").scrollIntoView({ block: "center" })`);
    for (const m of ["dark", "light", "system"]) {
      await js(`document.querySelector('#set-theme [data-v="${m}"]').click()`);
      await wait(500);
      await snap("8t-theme-" + m);
    }
    await js(`window.__test.closeSettings()`);
    await wait(300);
    await js(`document.getElementById("hdr-theme").click()`);
    await snap("8t-theme-menu");
    await js(`document.querySelector(".menu .menu-item:nth-of-type(3)")?.click()`);   // Dark
    await wait(500);
    await snap("8t-theme-header-dark");
    await js(`document.getElementById("hdr-theme").click()`);
    await js(`document.querySelector(".menu .menu-item")?.click()`);   // back to System
    await wait(300);
    await js(`window.__test.settings()`);
  }
  await js(`window.__test.checking()`);
  await snap("8b-checking");
  await js(`window.__test.lang("en")`);
  await snap("9-settings-en");
  await js(`window.__test.closeSettings()`);
  await snap("10-detail-en");
  await js(`window.__test.noAi(); window.__test.newPage()`);
  await snap("11-new-en-noai");
  await js(`window.__test.lang("vi")`);
  await js(`window.__test.fakeUpdate()`);
  await snap("13-update");
  await js(`document.getElementById("dlg-update").close()`);
  await js(`window.__test.settings()`);
  await snap("14-settings-update");
  await js(`window.__test.closeSettings()`);
  await js(`window.__test.restartConfirm()`);
  await snap("12-restart-confirm");
  // Exercise a real relaunch once: the relaunched instance records a marker and quits.
  const marker = path.join(dir, "relaunched.txt");
  if (process.env.STUDYLENS_TEST_RESTART && !existsSync(marker)) {
    writeFileSync(marker, "before\n");
    await js(`window.__test.restartNow()`);
    return;
  }
  if (existsSync(marker)) writeFileSync(marker, readFileSync(marker, "utf8") + "after relaunch\n");
  app.quit();
}

ipcMain.handle("files:pick", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: t("dlg.pick"),
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: t("dlg.docs"), extensions: ACCEPTED.map((e) => e.slice(1)) },
      { name: t("dlg.all"), extensions: ["*"] },
    ],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("files:stat", (_e, paths: string[]) => Promise.all(paths.map(async (p) => {
  try { const st = await stat(p); return { path: p, ok: st.isFile(), size: st.size }; }
  catch { return { path: p, ok: false, size: 0 }; }
})));
ipcMain.handle("dir:pick", async () => {
  const r = await dialog.showOpenDialog(win!, { title: t("dlg.dir"), properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("claude:info", async () => findClaude(""));
ipcMain.handle("settings:get", () => { const s = loadSettings(); return { ...s, uiLang: uiLangOf(s) }; });
ipcMain.handle("settings:save", (_e, patch: Partial<Settings>) => {
  const s = saveSettings(patch);
  setLang(uiLangOf(s));
  if ("theme" in patch) applyTheme(s.theme);
  return { ...s, uiLang: uiLangOf(s) };
});
ipcMain.handle("history:list", () => library.history());
ipcMain.handle("history:remove", (_e, id: string) => library.removeHistory(id));
ipcMain.handle("projects:list", () => library.projects());
ipcMain.handle("projects:root", () => projectsRoot());
ipcMain.handle("projects:create", (_e, o: { name: string; color: string; parent?: string }) => lib(() => library.createProject({ ...o, parent: o.parent || projectsRoot() })));
ipcMain.handle("projects:update", (_e, id: string, patch: { name?: string; color?: string }) => lib(() => {
  if (patch.name) guardProject(id);
  return library.updateProject(id, patch);
}));
ipcMain.handle("projects:remove", (_e, id: string, trash: boolean) => lib(() => {
  guardProject(id);
  return library.removeProject(id, trash);
}));
ipcMain.handle("notebook:rename", (_e, id: string, title: string) => lib(() => library.renameNotebook(id, title)));
ipcMain.handle("notebook:move", (_e, id: string, projectId: string | null) => lib(() => library.moveNotebook(id, projectId)));
ipcMain.handle("notebook:tags", (_e, id: string, tags: string[]) => lib(() => library.tagNotebook(id, tags)));
ipcMain.handle("notebook:delete", (_e, id: string, trash: boolean) => lib(() => library.deleteNotebook(id, trash)));
// Preview: only what the library knows — a notebook's folder (or its file) and the notebooks' source files.
function previewable(p: string): boolean {
  const want = path.resolve(p);
  const ci = process.platform !== "linux";
  const same = (a: string, b: string) => (ci ? a.toLowerCase() === b.toLowerCase() : a === b);
  const inside = (f: string, dir: string) => (ci ? f.toLowerCase() : f).startsWith((ci ? dir.toLowerCase() : dir) + path.sep);
  return library.history().some((h) =>
    (h.output && (inOwnFolder(h.output) ? inside(want, path.dirname(h.output)) : same(want, h.output))) || h.files.some((f) => same(want, f)));
}
const previewUrl = (p: string) => "slpreview://f" + pathToFileURL(p).pathname;
ipcMain.handle("path:preview", (_e, p: string) => (!existsSync(p) ? "missing" : previewable(p) ? previewUrl(p) : "denied"));
ipcMain.handle("path:open", async (_e, p: string) => (existsSync(p) ? shell.openPath(p) : "missing"));
ipcMain.handle("path:reveal", (_e, p: string) => shell.showItemInFolder(p));

// ---------- Runs ----------
const runs = new RunManager({
  file: userFile,
  jobsDir,
  assetsDir,
  async claude() {
    const info = await findClaude("");
    return info.found && info.path ? { path: info.path, version: info.version ?? "" } : { error: info.error || t("job.noClaude") };
  },
  publish: (run: Run) => win?.webContents.send("run:update", run),
  removed: (id: string) => win?.webContents.send("run:update", { id, removed: true }),
  tick: (tk) => win?.webContents.send("run:tick", tk),
  // Notebooks of a project go into its folder (also when the project was renamed while the run was paused).
  draw: renderMermaid,
  outputDir: (run) => (run.projectId && library.project(run.projectId)?.dir) || run.options.outputDir,
  notebookDone(run, it) {
    library.addHistory({
      id: `${run.id}-${it.id}`, runId: run.id, projectId: run.projectId, status: "done", title: it.outputTitle || it.title,
      startedAt: new Date(it.startedAt ?? run.createdAt).toISOString(), seconds: Math.round(it.elapsedMs / 1000),
      files: it.files, options: { files: it.files, title: it.title, ...run.options }, workDir: it.workDir ?? "",
      output: it.output, slides: it.slides, articles: it.articles, costUsd: it.costUsd,
    });
  },
});

// Runs made before notebooks could move (rename / into a project) may still point to the old place.
runs.repairOutputs((run, it) => library.history().find((h) => h.id === `${run.id}-${it.id}`)?.output);

ipcMain.handle("run:start", async (_e, req: RunRequest) => {
  if (runs.isBusy()) throw new Error(t("job.busy"));
  const missing = req.files.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(t("job.missing", { files: missing.join(", ") }));
  if (req.format === "wbs") {
    const x = (f: string) => /\.xlsx$/i.test(f);
    if (req.mode === "separate" ? !req.files.every(x) : !req.files.some(x)) throw new Error(t("job.wbsXlsx"));
  }
  return runs.create(req).id;
});
ipcMain.handle("run:list", () => runs.list());
ipcMain.handle("run:log", (_e, runId: string, itemId: string) => runs.log(runId, itemId));
ipcMain.handle("run:action", async (_e, runId: string, action: RunAction) => {
  try { await runs.action(runId, action); }
  catch (e) { throw new Error((e as Error).message === "busy" ? t("job.busy") : (e as Error).message); }
});
ipcMain.handle("run:item", async (_e, runId: string, itemId: string, action: ItemAction) => {
  try { await runs.itemAction(runId, itemId, action); }
  catch (e) { throw new Error((e as Error).message === "busy" ? t("job.busy") : (e as Error).message); }
});

// Relaunch the app; a running job (and its claude process tree) is stopped first.
ipcMain.handle("app:restart", () => {
  runs.shutdown();   // the running item becomes "stopped" with its session kept, ready to continue
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(() => {
  protocol.handle("slpreview", (req) => {
    const file = decodeURIComponent(new URL(req.url).pathname);
    const p = process.platform === "win32" ? file.replace(/^\//, "") : file;
    if (!existsSync(p) || !previewable(p)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });
  setLang(uiLangOf(loadSettings()));
  applyTheme(loadSettings().theme);
  nativeTheme.on("updated", () => { if (!isMac) win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#1E1E1E" : "#F2F2F4"); });
  // Test: STUDYLENS_UPDATE_TEST=1 on an older build → check, install without relaunching, quit.
  if (process.env.STUDYLENS_UPDATE_TEST) {
    checkForUpdate().then(async (info) => {
      console.log("[update]", JSON.stringify({ current: info.current, latest: info.latest, available: info.available, error: info.error }));
      if (!info.available) return app.quit();
      await installUpdate((p) => console.log("[update]", p.phase, p.received ?? "", p.total ?? ""), { relaunch: false });
    }).catch((e) => { console.log("[update] failed", e.message); app.quit(); });
    return;
  }
  createWindow();
  // Packaged app: look for a new version shortly after start, then every 6 hours.
  if (app.isPackaged && !process.env.STUDYLENS_SHOOT) {
    setTimeout(autoCheck, 4000);
    setInterval(autoCheck, 6 * 3600 * 1000);
  }
  if (process.env.STUDYLENS_DEV) console.log(`[dev] app started (pid ${process.pid})`);
});
// ---------- Updates ----------
let lastUpdate: UpdateInfo | null = null;
async function autoCheck() {
  lastUpdate = await checkForUpdate();
  if (lastUpdate.available) win?.webContents.send("update:available", lastUpdate);
}
ipcMain.handle("update:check", async () => (lastUpdate = await checkForUpdate()));
ipcMain.handle("update:install", async () => {
  runs.shutdown();   // a running item stops with its session kept; continue it after the update
  await installUpdate((p) => win?.webContents.send("update:progress", p));
});
ipcMain.handle("app:version", () => app.getVersion());

app.on("before-quit", () => runs.shutdown());
app.on("window-all-closed", () => app.quit());
