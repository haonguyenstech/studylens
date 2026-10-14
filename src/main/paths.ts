// File and folder names for notebooks and projects.
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

/** A title made safe as a file/folder name on macOS and Windows. */
export function safeName(title: string, fallback = "so-tay"): string {
  return title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim().replace(/[. ]+$/, "") || fallback;
}

/** "<name>", or "<name> (2)", "<name> (3)"… — the first that is not taken in `dir`. */
export function freeName(dir: string, name: string, except?: string): string {
  let n = name;
  for (let i = 2; existsSync(path.join(dir, n)) && path.join(dir, n).toLowerCase() !== except?.toLowerCase(); i++) n = `${name} (${i})`;
  return n;
}

/** The notebook lives in its own folder (<name>/<name>.html), as every notebook since 0.1.1 does. */
export function inOwnFolder(output: string): boolean {
  return path.basename(path.dirname(output)) === path.basename(output, ".html");
}

/** rename, or copy + delete when crossing volumes. */
export function move(from: string, to: string) {
  try { renameSync(from, to); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}
