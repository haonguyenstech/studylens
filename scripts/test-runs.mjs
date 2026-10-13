// End-to-end test of the run engine with the fake Claude (no UI, no real AI):
//   node scripts/test-runs.mjs
// Covers: pause → continue (same session), stop → app restart → continue, skip, retry item,
// retry failed, start over, delete.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.STUDYLENS_FAKE_CLAUDE = path.join(root, "scripts", "fake-claude.mjs");
process.env.FAKE_DELAY = "700";
const { RunManager } = require("../dist/main/runs.js");
const { findClaude } = require("../dist/main/claude.js");

const base = path.join(os.tmpdir(), "studylens-test-runs");
rmSync(base, { recursive: true, force: true });
const data = path.join(base, "data"), docs = path.join(base, "docs");
mkdirSync(docs, { recursive: true });
const docsList = ["A one.pdf", "B broken.pdf", "C three.pdf"].map((n) => { const p = path.join(docs, n); writeFileSync(p, "x"); return p; });

const host = () => ({
  file: (n) => path.join(data, n),
  jobsDir: () => path.join(data, "jobs"),
  assetsDir: path.join(root, "dist", "assets"),
  async claude() { const i = await findClaude(""); return i.found ? { path: i.path, version: i.version } : { error: i.error }; },
  publish() {}, removed() {}, tick() {}, notebookDone() {},
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { for (let i = 0; i < ms / 100; i++) { if (fn()) return; await wait(100); } throw new Error("timeout"); }
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };
const statuses = (r) => r.items.map((x) => x.status).join(",");
const req = { files: docsList, mode: "separate", title: "Test", titles: ["A one", "B broken", "C three"], model: "", research: false, lang: "Tiếng Việt", outputDir: docs };

// 1. pause → continue resumes the same session
let m = new RunManager(host());
let run = m.create(req);
await until(() => run.items[0].sessionId);
await m.action(run.id, "pause");
await until(() => run.items[0].status === "paused");
const sid = run.items[0].sessionId;
check(run.state === "paused", "pause: run is paused");
await m.action(run.id, "resume");
await until(() => run.state === "failed" || run.state === "done", 30000);
check(statuses(run) === "done,failed,done", `continue: items finished (${statuses(run)})`);
check(run.items[0].attempts === 2 && run.items[0].sessionId === sid, "continue: item 1 resumed the same Claude session");
check(m.log(run.id, run.items[0].id).some((l) => /Resumed session/.test(l.text)), "continue: log shows the resumed session");
check(existsSync(path.join(docs, "A one.html")) && existsSync(path.join(docs, "C three.html")), "outputs named after the item titles");

// 2. retry failed: B fails again (same input), the others stay done
await m.action(run.id, "retryFailed");
await until(() => run.state === "failed" || run.state === "done");
check(statuses(run) === "done,failed,done" && run.items[1].attempts === 2 && run.items[0].attempts === 2 && run.items[2].attempts === 1, "retry failed: only the failed item ran again");

// 3. stop → "app restart" (new manager from disk) → continue
rmSync(path.join(docs, "A one.html")); rmSync(path.join(docs, "C three.html"));
let run2 = m.create({ ...req, files: [docsList[0], docsList[2]], titles: ["A one", "C three"] });
await until(() => run2.items[0].sessionId);
await m.action(run2.id, "stop");
await until(() => run2.items[0].status === "stopped");
m = new RunManager(host());                       // what the app sees after a relaunch
run2 = m.get(run2.id);
check(run2.state === "stopped" && run2.items[0].status === "stopped", "restart: stopped run reloaded from disk");
await m.action(run2.id, "resume");
await until(() => run2.state === "done", 30000);
check(run2.items[0].attempts === 2 && statuses(run2) === "done,done", "restart: continued after relaunch and finished");

// 4. skip the running item, then retry it alone
let run3 = m.create({ ...req, files: [docsList[0], docsList[2]], titles: ["A one", "C three"] });
await until(() => run3.items[0].status === "running");
await m.itemAction(run3.id, run3.items[0].id, "skip");
await until(() => run3.state === "done" || run3.state === "failed", 30000);
check(statuses(run3) === "skipped,done", `skip: item 1 skipped, item 2 done (${statuses(run3)})`);
await m.itemAction(run3.id, run3.items[0].id, "retry");
await until(() => run3.items[0].status === "done", 30000);
check(run3.state === "done", "retry item: the skipped item ran on its own and the run completed");

// 5. start over wipes progress; delete removes run + working folders
await m.action(run3.id, "restart");
await until(() => run3.state === "done", 30000);
check(run3.items.every((x) => x.attempts === 1) && m.log(run3.id, run3.items[1].id).filter((l) => l.text.startsWith("━━")).length === 1, "start over: fresh attempts, old working folder and log wiped");
const dirs = run3.items.map((x) => x.workDir);
await m.action(run3.id, "remove");
check(!m.get(run3.id) && dirs.every((d) => !existsSync(d)), "delete: run and its working folders removed");
check(JSON.parse(readFileSync(path.join(data, "runs.json"), "utf8")).length === 2, "runs.json keeps the other runs");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
