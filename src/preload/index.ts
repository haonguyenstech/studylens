import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Api } from "../shared/types";

const api: Api = {
  pickFiles: () => ipcRenderer.invoke("files:pick"),
  statFiles: (paths) => ipcRenderer.invoke("files:stat", paths),
  pickDir: () => ipcRenderer.invoke("dir:pick"),
  claudeInfo: () => ipcRenderer.invoke("claude:info"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  startRun: (req) => ipcRenderer.invoke("run:start", req),
  runAction: (runId, action) => ipcRenderer.invoke("run:action", runId, action),
  itemAction: (runId, itemId, action) => ipcRenderer.invoke("run:item", runId, itemId, action),
  listRuns: () => ipcRenderer.invoke("run:list"),
  runLog: (runId, itemId) => ipcRenderer.invoke("run:log", runId, itemId),
  onRun: (cb) => { ipcRenderer.on("run:update", (_e, run) => cb(run)); },
  onTick: (cb) => { ipcRenderer.on("run:tick", (_e, tick) => cb(tick)); },
  listHistory: () => ipcRenderer.invoke("history:list"),
  removeHistory: (id) => ipcRenderer.invoke("history:remove", id),
  onHistoryChanged: (cb) => { ipcRenderer.on("history:changed", () => cb()); },
  restart: () => ipcRenderer.invoke("app:restart"),
  version: () => ipcRenderer.invoke("app:version"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdate: (cb) => { ipcRenderer.on("update:available", (_e, info) => cb(info)); },
  onUpdateProgress: (cb) => { ipcRenderer.on("update:progress", (_e, p) => cb(p)); },
  openPath: (p) => ipcRenderer.invoke("path:open", p),
  revealPath: (p) => ipcRenderer.invoke("path:reveal", p),
  pathForFile: (f) => webUtils.getPathForFile(f),
};

contextBridge.exposeInMainWorld("api", api);

// Dev mode: restyle without reloading, so open dialogs, picked files and progress stay put.
ipcRenderer.on("dev:css", () => {
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => {
    const url = new URL(l.href);
    url.searchParams.set("t", String(Date.now()));
    l.href = url.toString();
  });
});
