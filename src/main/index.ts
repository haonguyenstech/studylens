import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { Lang, setLang, t } from "./i18n";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { HistoryItem, ItemAction, Run, RunAction, RunRequest, Settings } from "../shared/types";
import { findClaude } from "./claude";
import { ACCEPTED } from "./convert";
import { RunManager } from "./runs";
import { checkForUpdate, installUpdate, UpdateInfo } from "./updater";

app.setName("StudyLens");
// Screenshot/test runs keep their own settings and history, away from the real ones.
if (process.env.STUDYLENS_SHOOT) {
  mkdirSync(path.join(process.env.STUDYLENS_SHOOT, "userdata"), { recursive: true });
  app.setPath("userData", path.join(process.env.STUDYLENS_SHOOT, "userdata"));
}
// Dev: STUDYLENS_THEME=light|dark forces the theme (used with STUDYLENS_SHOOT).
if (process.env.STUDYLENS_THEME === "light" || process.env.STUDYLENS_THEME === "dark") nativeTheme.themeSource = process.env.STUDYLENS_THEME;
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

// ---------- History: every finished or failed run ----------
const loadHistory = (): HistoryItem[] => readJson<HistoryItem[]>(userFile("history.json"), []);
function saveHistory(items: HistoryItem[]) { writeJson(userFile("history.json"), items.slice(0, 200)); }
function addHistory(item: HistoryItem) {
  saveHistory([item, ...loadHistory().filter((h) => h.id !== item.id)]);
  win?.webContents.send("history:changed");
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
    win.webContents.once("did-finish-load", () => shootStates(shoot));
  }
  else if (!process.env.STUDYLENS_HIDDEN) win.once("ready-to-show", () => win?.show());   // HIDDEN: dev self-test without a window
  // The shadow of a transparent window is traced from its pixels; refresh it once the page has painted and after resizes.
  if (isMac) {
    const reshadow = () => setTimeout(() => win?.invalidateShadow(), 60);
    win.webContents.on("did-finish-load", reshadow);
    win.on("resize", reshadow);
  }
  if (process.env.STUDYLENS_DEV) devReload(win);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
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
  const js = (code: string) => w.webContents.executeJavaScript(code);
  const snap = async (name: string) => { await wait(450); writeFileSync(path.join(dir, name + ".png"), (await w.webContents.capturePage()).toPNG()); };
  mkdirSync(dir, { recursive: true });
  await wait(1200);
  const state = () => js(`(() => { const r = window.__test.run(); return r ? r.state : ""; })()`);
  const until = async (ok: (s: string) => boolean, ms = 30000) => { for (let i = 0; i < ms / 250 && !ok(await state()); i++) await wait(250); };
  await js(`window.__test.history()`);
  await snap("1-empty");
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
  if (process.env.STUDYLENS_FAKE_CLAUDE) {
    // A real run through main: 3 files one per notebook, the 2nd fails on purpose; pause then continue.
    const bdir = path.join(dir, "batch");
    mkdirSync(bdir, { recursive: true });
    const names = ["Week 1 - Intro.pdf", "Week 2 broken scan.pdf", "Week 3 - Caching.pdf"];
    for (const n of names) writeFileSync(path.join(bdir, n), Buffer.alloc(2048));
    await js(`window.__test.setFiles(${JSON.stringify(names.map((n) => path.join(bdir, n)))}, "separate")`);
    await wait(900);
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
  }
  await js(`window.__test.detail()`);
  await snap("7-detail");
  await js(`window.__test.settings()`);
  await snap("8-settings");
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
  return { ...s, uiLang: uiLangOf(s) };
});
ipcMain.handle("history:list", () => loadHistory().map((h) => ({ ...h, exists: h.output ? existsSync(h.output) : false })));
ipcMain.handle("history:remove", (_e, id: string) => { saveHistory(loadHistory().filter((h) => h.id !== id)); });
ipcMain.handle("path:open", (_e, p: string) => shell.openPath(p));
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
  notebookDone(run, it) {
    addHistory({
      id: `${run.id}-${it.id}`, runId: run.id, status: "done", title: it.outputTitle || it.title,
      startedAt: new Date(it.startedAt ?? run.createdAt).toISOString(), seconds: Math.round(it.elapsedMs / 1000),
      files: it.files, options: { files: it.files, title: it.title, ...run.options }, workDir: it.workDir ?? "",
      output: it.output, slides: it.slides, articles: it.articles, costUsd: it.costUsd,
    });
  },
});

ipcMain.handle("run:start", async (_e, req: RunRequest) => {
  if (runs.isBusy()) throw new Error(t("job.busy"));
  const missing = req.files.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(t("job.missing", { files: missing.join(", ") }));
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
  setLang(uiLangOf(loadSettings()));
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
