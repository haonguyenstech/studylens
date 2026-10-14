// The library: projects (folders on disk) and the notebooks made so far (history.json).
// A project's notebooks live inside its folder, one sub-folder each: <project>/<name>/<name>.html.
// Renaming or moving a notebook moves its folder; renaming a project renames its folder when the
// folder still carries the project's name. Nothing here depends on Electron, so it can be tested.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HistoryItem, Project } from "../shared/types";
import { freeName, inOwnFolder, move, safeName } from "./paths";

export const COLORS = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF9F0A", "#30D158", "#00C7BE", "#8E8E93"];
const LOOSE_KEEP = 200;
const TAGS_MAX = 20, TAG_LEN = 32;   // notebooks outside a project: only the latest are kept; project notebooks always

export class LibraryError extends Error {
  constructor(public code: "exists" | "busy" | "missing" | "notFound", message = code) { super(message); }
}

export class Library {
  constructor(
    private dataDir: string,
    private trash: (p: string) => Promise<void>,
    private changed: () => void = () => {},
    private relocated: (from: string, to: string) => void = () => {},   // a notebook file moved (runs keep its path too)
  ) {}

  // ---------- storage ----------
  private read<T>(f: string): T[] {
    try { return JSON.parse(readFileSync(path.join(this.dataDir, f), "utf8")); } catch { return []; }
  }
  private write(f: string, data: unknown) {
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(path.join(this.dataDir, f), JSON.stringify(data, null, 2));
  }
  private loadHistory = () => this.read<HistoryItem>("history.json");
  private saveHistory(items: HistoryItem[]) {
    const before = new Map(this.loadHistory().map((h) => [h.id, h.output]));
    for (const h of items) {
      const was = before.get(h.id);
      if (was && h.output && was !== h.output) this.relocated(was, h.output);
    }
    let loose = 0;
    this.write("history.json", items.filter((h) => h.projectId || ++loose <= LOOSE_KEEP));
    this.changed();
  }
  private loadProjects = () => this.read<Project>("projects.json");
  private saveProjects(items: Project[]) { this.write("projects.json", items); this.changed(); }

  // ---------- notebooks ----------
  history(): HistoryItem[] {
    const ids = new Set(this.loadProjects().map((p) => p.id));
    return this.loadHistory().map((h) => ({
      ...h,
      projectId: h.projectId && ids.has(h.projectId) ? h.projectId : undefined,
      exists: h.output ? existsSync(h.output) : false,
    }));
  }
  addHistory(item: HistoryItem) {
    if (item.projectId && !this.project(item.projectId)) delete item.projectId;
    this.saveHistory([item, ...this.loadHistory().filter((h) => h.id !== item.id)]);
  }
  removeHistory(id: string) { this.saveHistory(this.loadHistory().filter((h) => h.id !== id)); }

  private notebook(id: string): [HistoryItem[], HistoryItem] {
    const all = this.loadHistory();
    const h = all.find((x) => x.id === id);
    if (!h) throw new LibraryError("notFound");
    return [all, h];
  }

  /** New name: the title, and — when the notebook is in its own folder — the folder, the file and the page title. */
  renameNotebook(id: string, title: string): HistoryItem {
    title = title.trim();
    const [all, h] = this.notebook(id);
    if (!title || title === h.title) return h;
    if (h.output && existsSync(h.output)) {
      const html = readFileSync(h.output, "utf8");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      writeFileSync(h.output, html.split(`<title>${esc(h.title)}</title>`).join(`<title>${esc(title)}</title>`));
      if (inOwnFolder(h.output)) {
        const folder = path.dirname(h.output), parent = path.dirname(folder);
        const name = freeName(parent, safeName(title), folder);
        if (name !== path.basename(folder)) {
          const file = path.join(folder, `${name}.html`);
          move(h.output, file);
          const to = path.join(parent, name);
          move(folder, to);
          h.output = path.join(to, `${name}.html`);
        }
      }
    }
    h.title = title;
    this.saveHistory(all);
    return h;
  }

  /** Into a project: its folder moves into the project's folder. Out of a project: the files stay where they are. */
  moveNotebook(id: string, projectId: string | null): HistoryItem {
    const [all, h] = this.notebook(id);
    if ((h.projectId || null) === projectId) return h;
    if (projectId) {
      const p = this.project(projectId);
      if (!p) throw new LibraryError("notFound");
      if (h.output && existsSync(h.output)) {
        mkdirSync(p.dir, { recursive: true });
        if (inOwnFolder(h.output)) {
          const folder = path.dirname(h.output);
          const name = freeName(p.dir, path.basename(folder));
          move(folder, path.join(p.dir, name));
          const file = path.join(p.dir, name, path.basename(h.output));
          h.output = path.join(p.dir, name, `${name}.html`);
          if (file !== h.output) move(file, h.output);
        } else {
          // A notebook from before 0.1.1 (a bare .html next to its sources) gets a folder of its own.
          const name = freeName(p.dir, safeName(h.title));
          mkdirSync(path.join(p.dir, name));
          const to = path.join(p.dir, name, `${name}.html`);
          move(h.output, to);
          h.output = to;
        }
      }
      h.projectId = projectId;
    } else {
      delete h.projectId;
    }
    this.saveHistory(all);
    return h;
  }

  /** Replace the notebook's tags: trimmed, "#" dropped, spaces collapsed, duplicates (any case) once. */
  tagNotebook(id: string, tags: string[]): HistoryItem {
    const [all, h] = this.notebook(id);
    const seen = new Set<string>(), out: string[] = [];
    for (const raw of tags) {
      const tag = String(raw).replace(/[\s,]+/g, " ").trim().replace(/^#+\s*/, "").slice(0, TAG_LEN).trim();
      if (!tag || seen.has(tag.toLowerCase()) || out.length >= TAGS_MAX) continue;
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
    if (out.length) h.tags = out; else delete h.tags;
    this.saveHistory(all);
    return h;
  }

  /** Off the list; with `trash`, its folder (or file) also goes to the Trash. */
  async deleteNotebook(id: string, trash: boolean) {
    const [, h] = this.notebook(id);
    if (trash && h.output && existsSync(h.output)) await this.trash(inOwnFolder(h.output) ? path.dirname(h.output) : h.output);
    this.removeHistory(id);
  }

  // ---------- projects ----------
  projects(): Project[] { return this.loadProjects().map((p) => ({ ...p, exists: existsSync(p.dir) })); }
  project(id: string) { return this.loadProjects().find((p) => p.id === id); }

  createProject(o: { name: string; color?: string; parent: string }): Project {
    const name = o.name.trim();
    if (!name) throw new LibraryError("missing");
    const all = this.loadProjects();
    if (all.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new LibraryError("exists");
    mkdirSync(o.parent, { recursive: true });
    const dir = path.join(o.parent, freeName(o.parent, safeName(name, "Project")));
    mkdirSync(dir);
    const now = Date.now();
    const p: Project = { id: crypto.randomBytes(5).toString("hex"), name, dir, color: COLORS.includes(o.color || "") ? o.color! : COLORS[all.length % COLORS.length], createdAt: now, updatedAt: now };
    this.saveProjects([p, ...all]);
    return p;
  }

  /** Rename (and recolor). The folder follows the new name when it still has the old one. */
  updateProject(id: string, patch: { name?: string; color?: string }): Project {
    const all = this.loadProjects();
    const p = all.find((x) => x.id === id);
    if (!p) throw new LibraryError("notFound");
    const name = patch.name?.trim();
    if (name && name !== p.name) {
      if (all.some((x) => x !== p && x.name.toLowerCase() === name.toLowerCase())) throw new LibraryError("exists");
      const parent = path.dirname(p.dir);
      if (existsSync(p.dir) && path.basename(p.dir) === safeName(p.name, "Project")) {
        const to = path.join(parent, freeName(parent, safeName(name, "Project"), p.dir));
        if (to !== p.dir) {
          move(p.dir, to);
          const hist = this.loadHistory();
          for (const h of hist) if (h.output && (h.output + path.sep).startsWith(p.dir + path.sep)) h.output = to + h.output.slice(p.dir.length);
          this.saveHistory(hist);
          p.dir = to;
        }
      }
      p.name = name;
    }
    if (patch.color && COLORS.includes(patch.color)) p.color = patch.color;
    p.updatedAt = Date.now();
    this.saveProjects(all);
    return p;
  }

  /** Remove a project. Keep its files: its notebooks become loose. `trash`: folder to the Trash, notebooks off the list. */
  async removeProject(id: string, trash: boolean) {
    const p = this.project(id);
    if (!p) return;
    if (trash && existsSync(p.dir)) await this.trash(p.dir);
    const hist = this.loadHistory().filter((h) => !(trash && h.projectId === id));
    for (const h of hist) if (h.projectId === id) delete h.projectId;
    this.saveProjects(this.loadProjects().filter((x) => x.id !== id));
    this.saveHistory(hist);
  }
}
