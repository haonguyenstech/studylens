// Shared types for main, preload and renderer.

export interface JobOptions {
  files: string[];
  title: string;          // empty: the AI names it from the content
  model: string;          // "" = Claude Code's default
  research: boolean;      // allow WebSearch/WebFetch to fact-check
  lang: string;           // language of the explanations
  outputDir: string;      // "" = next to the first source file
  format?: NotebookFormat; // missing = "tap" (notebooks made before formats existed)
}

/** Output formats: "tap" = Tap to Explain (the source rebuilt, tap a line for its explanation);
 *  "brief" = Deep Brief (rewritten as a structured analysis with diagrams). */
export type NotebookFormat = "tap" | "brief" | "wbs";

/** What the renderer asks for when the user presses Process. */
export interface RunRequest extends Omit<JobOptions, "title"> {
  mode: "merge" | "separate";
  title: string;          // merge: the notebook name; separate: the run's label
  titles?: string[];      // separate: one name per file
  projectId?: string;     // save into this project's folder
}

export type Stage = "prepare" | "write" | "check" | "fix" | "assemble";
export type HaltReason = "pause" | "stop" | "skip";

/** Events a single notebook job emits while it works. */
export type JobEvent =
  | { kind: "stage"; stage: Stage; text: string }
  | { kind: "log"; text: string; tone?: LogTone }
  | { kind: "stats"; costUsd: number; turns: number }
  | { kind: "activity"; text: string }
  | { kind: "session"; id: string }
  | { kind: "done"; title: string; output: string; slides: number; articles: number; costUsd: number }
  | { kind: "fail"; message: string }
  | { kind: "halted"; reason: HaltReason };

export type LogTone = "tool" | "say" | "warn" | "err" | "info";
export interface LogLine { at: number; text: string; tone: LogTone }

// ---------- Runs: a press of Process, persisted so it can be paused, resumed and reviewed ----------
export type ItemStatus = "waiting" | "running" | "paused" | "stopped" | "done" | "failed" | "skipped";
export type RunState = "running" | "paused" | "stopped" | "done" | "failed";

export interface RunItem {
  id: string;
  files: string[];
  title: string;
  status: ItemStatus;
  stage?: Stage;
  workDir?: string;
  sessionId?: string;     // Claude session to --resume after a pause/stop
  output?: string;
  outputTitle?: string;
  slides?: number;
  articles?: number;
  costUsd: number;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  elapsedMs: number;      // working time, pauses excluded
  activeSince?: number;   // set while running
  attempts: number;
}

export interface Run {
  id: string;
  title: string;
  mode: "merge" | "separate";
  state: RunState;
  createdAt: number;
  updatedAt: number;
  options: Omit<JobOptions, "files" | "title">;
  projectId?: string;
  items: RunItem[];
}

/** A project is a folder on disk; its notebooks live in it, one sub-folder each. */
export interface Project {
  id: string;
  name: string;
  dir: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  exists?: boolean;       // folder still on disk (filled when listing)
}

/** Live, not persisted: what the AI is doing right now. */
export interface RunTick { runId: string; itemId: string; kind: "activity" | "log"; text: string; tone?: LogTone; at: number }

export interface ClaudeInfo {
  found: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface HistoryItem {
  id: string;
  runId?: string;
  projectId?: string;
  status: "done" | "failed";
  title: string;
  startedAt: string;
  seconds: number;
  files: string[];
  options: JobOptions;
  workDir: string;
  output?: string;
  slides?: number;
  articles?: number;
  costUsd: number;
  error?: string;
  tags?: string[];        // the user's labels, shown as chips and searchable as #tag
  exists?: boolean;       // output file still on disk (filled when listing)
}

export interface Settings {
  claudePath: string;
  model: string;
  research: boolean;
  lang: string;
  outputDir: string;
  uiLang: "" | "vi" | "en";   // "" = follow the system language
  theme?: "system" | "light" | "dark";
  outMode?: "merge" | "separate";
  format?: NotebookFormat;
  projectId?: string;     // project picked last on the new-notebook page ("" = none)
  projectsRoot?: string;  // where new project folders go ("" = ~/Documents/StudyLens)
}

export interface UpdateInfo { current: string; latest?: string; available: boolean; notes?: string; url?: string; publishedAt?: string; error?: string }
export type UpdateProgress = { phase: "download" | "verify" | "install"; received?: number; total?: number };

export type RunAction = "pause" | "resume" | "stop" | "restart" | "retryFailed" | "remove";
export type ItemAction = "retry" | "skip";

export interface Api {
  pickFiles(): Promise<string[]>;
  statFiles(paths: string[]): Promise<{ path: string; ok: boolean; size: number }[]>;
  pickDir(): Promise<string | null>;
  claudeInfo(): Promise<ClaudeInfo>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Partial<Settings>): Promise<Settings>;
  startRun(req: RunRequest): Promise<string>;
  runAction(runId: string, action: RunAction): Promise<void>;
  itemAction(runId: string, itemId: string, action: ItemAction): Promise<void>;
  listRuns(): Promise<Run[]>;
  runLog(runId: string, itemId: string): Promise<LogLine[]>;
  onRun(cb: (run: Run | { id: string; removed: true }) => void): void;
  onTick(cb: (tick: RunTick) => void): void;
  listHistory(): Promise<HistoryItem[]>;
  removeHistory(id: string): Promise<void>;
  onHistoryChanged(cb: () => void): void;
  listProjects(): Promise<Project[]>;
  projectsRoot(): Promise<string>;
  createProject(p: { name: string; color: string; parent?: string }): Promise<Project>;
  updateProject(id: string, patch: { name?: string; color?: string }): Promise<Project>;
  removeProject(id: string, trash: boolean): Promise<void>;
  renameNotebook(id: string, title: string): Promise<HistoryItem>;
  moveNotebook(id: string, projectId: string | null): Promise<HistoryItem>;
  tagNotebook(id: string, tags: string[]): Promise<HistoryItem>;
  deleteNotebook(id: string, trash: boolean): Promise<void>;
  restart(): Promise<void>;
  version(): Promise<string>;
  checkUpdate(): Promise<UpdateInfo>;
  installUpdate(): Promise<void>;
  onUpdate(cb: (info: UpdateInfo) => void): void;
  onUpdateProgress(cb: (p: UpdateProgress) => void): void;
  openPath(p: string): Promise<void>;
  /** An in-app preview URL for a notebook or a source file, or "missing" / "denied". */
  previewPath(p: string): Promise<string>;
  revealPath(p: string): Promise<void>;
  pathForFile(f: File): string;
}
