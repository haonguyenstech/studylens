// Projects and notebook management on disk (no Electron): node scripts/test-library.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { Library } = require("../dist/main/library.js");

const base = path.join(os.tmpdir(), "studylens-test-library");
rmSync(base, { recursive: true, force: true });
const data = path.join(base, "data"), root = path.join(base, "Projects"), loose = path.join(base, "Downloads");
mkdirSync(loose, { recursive: true });
const trashed = [];
const moves = [];
const lib = new Library(data, async (p) => { trashed.push(p); rmSync(p, { recursive: true, force: true }); }, () => {}, (from, to) => moves.push([from, to]));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };
const rejects = (fn, msg) => { try { fn(); check(false, msg); } catch { check(true, msg); } };
const notebook = (dir, title, id) => {
  const out = path.join(dir, title, `${title}.html`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `<html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`);
  lib.addHistory({ id, status: "done", title, startedAt: new Date().toISOString(), seconds: 1, files: [], options: {}, workDir: "", output: out, costUsd: 0 });
  return out;
};

// projects
const a = lib.createProject({ name: "System Design", parent: root });
check(existsSync(path.join(root, "System Design")) && a.dir === path.join(root, "System Design"), "create: project folder made");
rejects(() => lib.createProject({ name: "system design", parent: root }), "create: duplicate name refused");
rejects(() => lib.createProject({ name: "  ", parent: root }), "create: empty name refused");
mkdirSync(path.join(root, "Networks"));
const b = lib.createProject({ name: "Networks", parent: root });
check(b.dir === path.join(root, "Networks (2)"), "create: an existing folder is not reused");

// move a loose notebook into a project
const n1 = notebook(loose, "Caching", "n1");
let h = lib.moveNotebook("n1", a.id);
check(h.output === path.join(a.dir, "Caching", "Caching.html") && existsSync(h.output) && !existsSync(n1), "move in: folder moved into the project");
check(moves.some(([f, t]) => f === n1 && t === h.output), "move in: the new path is announced (runs follow it)");
// old-style notebook (bare .html next to its sources)
const old = path.join(loose, "Old notes.html");
writeFileSync(old, "<title>Old notes</title>");
lib.addHistory({ id: "n0", status: "done", title: "Old notes", startedAt: new Date().toISOString(), seconds: 1, files: [], options: {}, workDir: "", output: old, costUsd: 0 });
h = lib.moveNotebook("n0", a.id);
check(h.output === path.join(a.dir, "Old notes", "Old notes.html") && existsSync(h.output), "move in: a bare .html gets its own folder");

// rename notebook: folder, file and page title follow
h = lib.renameNotebook("n1", "Caching 101");
check(h.output === path.join(a.dir, "Caching 101", "Caching 101.html") && existsSync(h.output), "rename notebook: folder and file renamed");
check(readFileSync(h.output, "utf8").includes("<title>Caching 101</title>"), "rename notebook: page title updated");
// name clash → (2)
notebook(a.dir, "Queues", "n2");
lib.moveNotebook("n2", a.id);
h = lib.renameNotebook("n2", "Caching 101");
check(h.output === path.join(a.dir, "Caching 101 (2)", "Caching 101 (2).html"), "rename notebook: clash becomes (2)");

// tags: cleaned, deduped (any case), kept through rename and move
h = lib.tagNotebook("n2", ["  #Caching ", "redis,  cluster", "caching", "", "#"]);
check(JSON.stringify(h.tags) === JSON.stringify(["Caching", "redis cluster"]), "tags: trimmed, '#' dropped, duplicates once");
h = lib.renameNotebook("n2", "Caching 101");
check(h.tags?.length === 2, "tags: kept through rename");
check(lib.tagNotebook("n2", Array.from({ length: 30 }, (_, i) => "t" + i)).tags.length === 20, "tags: at most 20");
lib.tagNotebook("n2", ["Caching", "redis cluster"]);

// move between projects, then out
h = lib.moveNotebook("n2", b.id);
check(h.output.startsWith(b.dir + path.sep) && h.projectId === b.id && existsSync(h.output), "move: between projects");
h = lib.moveNotebook("n2", null);
check(!h.projectId && h.output.startsWith(b.dir), "move out: files stay, project unset");
check(h.tags?.length === 2, "tags: kept through moves");
check(!lib.tagNotebook("n2", []).tags, "tags: cleared");

// rename project: folder follows, notebook paths updated
const a2 = lib.updateProject(a.id, { name: "System Design II", color: "#30D158" });
check(a2.dir === path.join(root, "System Design II") && !existsSync(path.join(root, "System Design")), "rename project: folder renamed");
check(lib.history().filter((x) => x.projectId === a.id).every((x) => x.output.startsWith(a2.dir + path.sep) && x.exists), "rename project: notebook paths follow");
check(moves.at(-1)[1].startsWith(a2.dir + path.sep), "rename project: moved notebooks announced");
check(a2.color === "#30D158", "recolor project");
rejects(() => lib.updateProject(a.id, { name: "Networks" }), "rename project: duplicate refused");

// delete notebook
await lib.deleteNotebook("n0", true);
check(!lib.history().some((x) => x.id === "n0") && trashed.at(-1) === path.join(a2.dir, "Old notes"), "delete notebook: folder to the Trash");

// remove project, keep files → notebooks become loose
lib.moveNotebook("n2", b.id);
await lib.removeProject(b.id, false);
check(!lib.project(b.id) && lib.history().find((x) => x.id === "n2" && !x.projectId && x.exists), "remove project (keep files): notebooks become loose");
// remove project with trash
await lib.removeProject(a.id, true);
check(!existsSync(a2.dir) && !lib.history().some((x) => x.id === "n1"), "remove project (trash): folder trashed, notebooks off the list");

// a notebook whose project vanished is shown as loose
lib.addHistory({ id: "n9", projectId: "gone", status: "done", title: "X", startedAt: "", seconds: 0, files: [], options: {}, workDir: "", costUsd: 0 });
check(!lib.history().find((x) => x.id === "n9").projectId, "unknown project id → loose");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
