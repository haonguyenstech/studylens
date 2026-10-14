// Runs: every press of Process becomes a persisted Run (one item for "merge", one per file for
// "separate"). Items are worked one at a time. A run can be paused, resumed, stopped, restarted;
// single items can be retried or skipped. Pause/stop keep the item's working folder and Claude
// session id, so "continue" resumes the same session (claude --resume) instead of starting over —
// also after the app was quit.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HaltReason, ItemAction, JobEvent, LogLine, Run, RunAction, RunItem, RunRequest, RunTick } from "../shared/types";
import { Job } from "./pipeline";
import { t } from "./i18n";

const FINAL = new Set(["done", "failed", "skipped"]);

export interface RunHost {
  file(name: string): string;                // path inside userData
  jobsDir(): string;
  assetsDir: string;
  claude(): Promise<{ path: string; version: string } | { error: string }>;
  publish(run: Run): void;                   // full snapshot → renderer
  removed(id: string): void;
  tick(t: RunTick): void;                    // live activity/log → renderer
  notebookDone(run: Run, item: RunItem): void;
  outputDir?(run: Run): string;
  draw?(codes: string[]): Promise<{ svg?: string; error?: string }[]>;   // Mermaid → SVG (Deep Brief)              // where a finished notebook goes (the project folder, if any)
}

export class RunManager {
  private runs: Run[] = [];
  private active: { run: Run; item: RunItem; job: Job } | null = null;
  private driving = new Set<string>();       // runs whose loop is running

  constructor(private host: RunHost) {
    this.runs = this.load();
    // The app quit (or crashed) mid-run: those runs/items are now stopped, ready to resume.
    let dirty = false;
    for (const r of this.runs) {
      if (r.state === "running") { r.state = "stopped"; dirty = true; }
      for (const it of r.items) if (it.status === "running") { it.status = "stopped"; this.settle(it); dirty = true; }
    }
    if (dirty) this.save();
  }

  // ---------- persistence ----------
  private load(): Run[] {
    try { return JSON.parse(readFileSync(this.host.file("runs.json"), "utf8")); } catch { return []; }
  }
  private save() {
    mkdirSync(path.dirname(this.host.file("runs.json")), { recursive: true });
    writeFileSync(this.host.file("runs.json"), JSON.stringify(this.runs.slice(0, 300)));
  }
  private touch(run: Run) {
    run.updatedAt = Date.now();
    this.save();
    this.host.publish(run);
  }

  list(): Run[] { return this.runs; }

  /** App is quitting/relaunching: halt the active job; its run is marked stopped (resumable) on next start. */
  shutdown() {
    if (!this.active) return;
    this.active.run.state = "stopped";
    this.active.job.stop("stop");
    this.settle(this.active.item);
    this.active.item.status = "stopped";
    this.save();
  }
  get(id: string) { return this.runs.find((r) => r.id === id); }

  /** A notebook file moved (renamed, or moved into a project): runs that made it point to the new place. */
  relocate(from: string, to: string) {
    for (const r of this.runs) {
      let hit = false;
      for (const it of r.items) if (it.output === from) { it.output = to; hit = true; }
      if (hit) { this.save(); this.host.publish(r); }
    }
  }
  /** Outputs that are no longer on disk: take the library's current path for the same notebook, if it has one. */
  repairOutputs(find: (run: Run, item: RunItem) => string | undefined) {
    let dirty = false;
    for (const r of this.runs) for (const it of r.items) {
      if (!it.output || existsSync(it.output)) continue;
      const now = find(r, it);
      if (now && now !== it.output && existsSync(now)) { it.output = now; dirty = true; }
    }
    if (dirty) this.save();
  }
  isBusy() { return !!this.active || this.driving.size > 0; }
  activeRun() { return this.active?.run; }

  // ---------- create ----------
  create(req: RunRequest): Run {
    const now = Date.now();
    const id = new Date(now).toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(2).toString("hex");
    const item = (files: string[], title: string): RunItem => ({ id: crypto.randomBytes(4).toString("hex"), files, title, status: "waiting", costUsd: 0, elapsedMs: 0, attempts: 0 });
    const items = req.mode === "separate" && req.files.length > 1
      ? req.files.map((f, i) => item([f], req.titles?.[i] || path.basename(f, path.extname(f))))
      : [item(req.files, req.title)];
    const run: Run = {
      id, title: req.title || items[0].title || path.basename(req.files[0]),
      mode: items.length > 1 ? "separate" : "merge",
      state: "running", createdAt: now, updatedAt: now,
      options: { model: req.model, research: req.research, lang: req.lang, outputDir: req.outputDir, format: req.format === "brief" || req.format === "wbs" ? req.format : "tap" },
      ...(req.projectId ? { projectId: req.projectId } : {}),
      items,
    };
    this.runs.unshift(run);
    this.touch(run);
    this.drive(run);
    return run;
  }

  // ---------- run controls ----------
  async action(runId: string, action: RunAction) {
    const run = this.get(runId);
    if (!run) return;
    const isActive = this.active?.run.id === runId;
    switch (action) {
      case "pause":
        if (run.state !== "running") return;
        run.state = "paused";
        this.touch(run);
        if (isActive) this.active!.job.stop("pause");
        return;
      case "stop":
        if (run.state === "done") return;
        run.state = "stopped";
        this.touch(run);
        if (isActive) this.active!.job.stop("stop");
        return;
      case "resume":
        if (run.state === "running" || run.state === "done") return;
        this.assertFree(runId);
        // failed items from a finished run stay failed; "retryFailed" re-queues those
        run.state = "running";
        this.touch(run);
        this.drive(run);
        return;
      case "restart":
        if (isActive) await this.halt(run, "stop");
        this.assertFree(runId);
        for (const it of run.items) this.reset(it, true);
        run.state = "running";
        this.touch(run);
        this.drive(run);
        return;
      case "retryFailed":
        this.assertFree(runId);
        for (const it of run.items) if (it.status === "failed" || it.status === "stopped" || it.status === "skipped") this.reset(it);
        run.state = "running";
        this.touch(run);
        this.drive(run);
        return;
      case "remove":
        if (isActive) await this.halt(run, "stop");
        this.runs = this.runs.filter((r) => r.id !== runId);
        for (const it of run.items) if (it.workDir) rmSync(it.workDir, { recursive: true, force: true });
        this.save();
        this.host.removed(runId);
        return;
    }
  }

  async itemAction(runId: string, itemId: string, action: ItemAction) {
    const run = this.get(runId);
    const it = run?.items.find((x) => x.id === itemId);
    if (!run || !it) return;
    if (action === "skip") {
      if (this.active?.item.id === itemId) { this.active.job.stop("skip"); return; }   // loop marks it skipped and moves on
      if (it.status === "waiting" || it.status === "paused" || it.status === "stopped") { it.status = "skipped"; this.settle(it); this.finishIfDone(run); this.touch(run); }
      return;
    }
    if (action === "retry") {
      if (this.active?.item.id === itemId) return;
      this.reset(it);
      if (run.state !== "running") {
        this.assertFree(runId);
        run.state = "running";
        this.touch(run);
        this.drive(run);
      } else this.touch(run);
    }
  }

  /** Stop the active job of a run and wait until its loop has let go. */
  private halt(run: Run, reason: HaltReason): Promise<void> {
    run.state = reason === "pause" ? "paused" : "stopped";
    this.active?.job.stop(reason);
    return new Promise((resolve) => {
      const wait = () => (this.driving.has(run.id) ? setTimeout(wait, 50) : resolve());
      wait();
    });
  }

  private assertFree(runId: string) {
    for (const id of this.driving) if (id !== runId) throw new Error("busy");
  }

  /** Back to "waiting". Retry keeps the attempt count (shown as "attempt n"); start over is a clean slate. */
  private reset(it: RunItem, fresh = false) {
    if (fresh) it.attempts = 0;
    if (it.workDir) rmSync(it.workDir, { recursive: true, force: true });
    Object.assign(it, { status: "waiting", stage: undefined, workDir: undefined, sessionId: undefined, output: undefined, outputTitle: undefined, slides: undefined, articles: undefined, costUsd: 0, error: undefined, startedAt: undefined, endedAt: undefined, elapsedMs: 0, activeSince: undefined });
  }

  private settle(it: RunItem) {
    if (it.activeSince) { it.elapsedMs += Date.now() - it.activeSince; it.activeSince = undefined; }
  }

  private finishIfDone(run: Run) {
    if (!run.items.every((it) => FINAL.has(it.status))) return;
    run.state = run.items.some((it) => it.status === "failed") ? "failed" : "done";
  }

  // ---------- the worker loop: one item at a time ----------
  private async drive(run: Run) {
    if (this.driving.has(run.id)) return;
    this.driving.add(run.id);
    try {
      while (run.state === "running") {
        const it = run.items.find((x) => !FINAL.has(x.status));
        if (!it) { this.finishIfDone(run); this.touch(run); break; }
        await this.work(run, it);
      }
    } finally {
      this.driving.delete(run.id);
    }
  }

  private async work(run: Run, it: RunItem) {
    const claude = await this.host.claude();
    if ("error" in claude) {
      it.status = "failed"; it.error = claude.error;
      run.state = "failed";
      this.touch(run);
      return;
    }
    const resume = (it.status === "paused" || it.status === "stopped") && it.sessionId && it.workDir && existsSync(it.workDir) ? it.sessionId : undefined;
    if (!resume) {
      if (it.workDir) rmSync(it.workDir, { recursive: true, force: true });
      this.prune(run);
      it.workDir = path.join(this.host.jobsDir(), `${run.id}-${it.id}-${it.attempts + 1}`);
      it.sessionId = undefined;
      mkdirSync(it.workDir, { recursive: true });
    }
    it.attempts++;
    it.status = "running";
    it.error = undefined;
    it.startedAt ??= Date.now();
    it.activeSince = Date.now();
    this.touch(run);
    this.logLine(run, it, `━━ ${it.title}${resume ? " ↻" : ""} · AI ${claude.version}`, "say");

    const costBefore = it.costUsd;
    const job = new Job(
      { files: it.files, title: it.title, ...run.options, outputDir: this.host.outputDir?.(run) ?? run.options.outputDir },
      claude.path, this.host.assetsDir, it.workDir!,
      (e) => this.onJobEvent(run, it, e, costBefore),
      resume,
      this.host.draw,
    );
    this.active = { run, item: it, job };
    await job.run();
    this.active = null;
    this.settle(it);
    if (it.status === "running") it.status = "failed";   // ended without a verdict
    this.touch(run);
  }

  private onJobEvent(run: Run, it: RunItem, e: JobEvent, costBefore: number) {
    switch (e.kind) {
      case "stage":
        it.stage = e.stage;
        this.logLine(run, it, "— " + e.text, "info");
        this.touch(run);
        return;
      case "log":
        this.logLine(run, it, e.text, e.tone ?? "info");
        return;
      case "activity":
        this.host.tick({ runId: run.id, itemId: it.id, kind: "activity", text: e.text, at: Date.now() });
        return;
      case "stats":
        it.costUsd = costBefore + e.costUsd;
        this.touch(run);
        return;
      case "session":
        it.sessionId = e.id;
        this.save();
        return;
      case "done":
        Object.assign(it, { status: "done", output: e.output, outputTitle: e.title, slides: e.slides, articles: e.articles, costUsd: costBefore + e.costUsd, endedAt: Date.now() });
        this.settle(it);
        this.host.notebookDone(run, it);
        return;
      case "fail":
        Object.assign(it, { status: "failed", error: e.message, endedAt: Date.now() });
        this.logLine(run, it, e.message, "err");
        return;
      case "halted":
        it.status = e.reason === "skip" ? "skipped" : e.reason === "pause" ? "paused" : "stopped";
        if (e.reason === "skip") it.endedAt = Date.now();
        this.logLine(run, it, "■ " + t(`halt.${e.reason}` as "halt.pause"), "warn");
        return;
    }
  }

  // ---------- logs (one JSON line per entry, next to the item's working folder) ----------
  private logLine(run: Run, it: RunItem, text: string, tone: LogLine["tone"]) {
    const line: LogLine = { at: Date.now(), text, tone };
    if (it.workDir) {
      try { appendFileSync(path.join(it.workDir, "log.jsonl"), JSON.stringify(line) + "\n"); } catch { /* folder removed */ }
    }
    this.host.tick({ runId: run.id, itemId: it.id, kind: "log", text, tone, at: line.at });
  }

  log(runId: string, itemId: string): LogLine[] {
    const it = this.get(runId)?.items.find((x) => x.id === itemId);
    if (!it?.workDir) return [];
    try {
      return readFileSync(path.join(it.workDir, "log.jsonl"), "utf8").trim().split("\n").filter(Boolean).slice(-3000).map((l) => JSON.parse(l));
    } catch { return []; }
  }

  // Working folders are kept while a run might still use them (unfinished items) or for the last 30
  // finished items; older ones go.
  private prune(current: Run) {
    let dirs: string[] = [];
    try { dirs = readdirSync(this.host.jobsDir()); } catch { return; }
    const needed = new Set<string>();
    const finished: { dir: string; at: number }[] = [];
    for (const r of [current, ...this.runs]) for (const it of r.items) {
      if (!it.workDir) continue;
      const name = path.basename(it.workDir);
      if (!FINAL.has(it.status)) needed.add(name);
      else finished.push({ dir: name, at: it.endedAt ?? 0 });
    }
    finished.sort((a, b) => b.at - a.at).slice(0, 30).forEach((f) => needed.add(f.dir));
    for (const d of dirs) if (!needed.has(d)) rmSync(path.join(this.host.jobsDir(), d), { recursive: true, force: true });
  }
}
