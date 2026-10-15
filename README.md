<div align="center">

<img src=".github/assets/icon.png" width="128" alt="StudyLens icon" />

# StudyLens

**Turn study material, specs and WBS spreadsheets into notebooks you actually read — on your Mac or PC.**

Drop in slides, PDFs, Word, PowerPoint or Excel, press **Process**, and Claude Code writes one self-contained, interactive HTML notebook.
Every line explained, every spec analysed, every WBS mapped — and every number checked by the app, not trusted from the AI.

<p>
  <img alt="macOS 11+" src="https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white" />
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-0078D4?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Agent" src="https://img.shields.io/badge/agent-Claude%20Code-D97757" />
</p>

<p>
  <a href="https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-mac-arm64.dmg"><img alt="Download for macOS" src="https://img.shields.io/badge/Download_for_macOS-000000?style=for-the-badge&logo=apple&logoColor=white" height="40" /></a>
  &nbsp;
  <a href="https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-Setup-win-x64.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download_for_Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" height="40" /></a>
</p>
<sub>macOS button is for Apple silicon (M1 or later) · <a href="https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-mac-x64.dmg">Intel Mac</a> · <a href="https://github.com/haonguyenstech/studylens/releases/latest">all downloads</a><br />First launch shows a warning because the app isn't signed with a paid developer certificate: <a href="#if-macos-or-windows-blocks-it">how to open it</a></sub>

<br /><br />

<a href="#features">Features</a> ·
<a href="#getting-started">Getting started</a> ·
<a href="#guide">Guide</a> ·
<a href="#how-it-works">How it works</a> ·
<a href="#safety">Safety</a> ·
<a href="#releases-and-self-update">Releases</a> ·
<a href="#project-layout">Project layout</a>

<br /><br />

<img src=".github/assets/app-new.png" width="820" alt="StudyLens: pick documents, choose a notebook type, press Process" />

</div>

---

## Features

### 📚 Three notebook types
| | |
|---|---|
| **Tap to Explain** | Rebuilds the original slides; tap any line — or any box and arrow in a diagram — to open a drawer: a plain-language take, an everyday analogy, where it shows up in apps you use, and the deep technical version. |
| **Deep Brief** | Rewrites a long document (RFP, PRD, spec, course) as a structured analysis: contents rail, key facts, parts and numbered sections, tables, Mermaid diagrams drawn to SVG, contradictions, glossary and open questions. |
| **WBS Map** | Reads a work breakdown structure in Excel and builds a delivery map: effort by phase and role, a dependency map between modules, the end-to-end flow, an editable schedule, and per phase/module its purpose, cohesion, preconditions, assumptions and risks — plus findings, WBS quality checks, estimate confidence and the critical chain. |

<table>
  <tr>
    <td><img src=".github/assets/out-deep-brief.png" alt="A Deep Brief" /></td>
    <td><img src=".github/assets/out-wbs-map.png" alt="A WBS Map: dependencies between modules" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Deep Brief</sub></td>
    <td align="center"><sub>WBS Map — hover a module to see what it needs and unlocks</sub></td>
  </tr>
</table>

### 🗂️ Projects & library
- **Projects are folders** on disk; notebooks made in a project are saved inside it, one folder each (`<project>/<name>/<name>.html`).
- Rename, move (drag onto a project), take out, delete — the files follow.
- **Tags** on notebooks, with ready-made suggestions; search by `#tag`, by title or by source file name, accents optional.

### ▶️ Runs you can pause
- One notebook from many files, or one per file.
- **Pause, stop, continue** — even after quitting the app: the same Claude session resumes in the same folder.
- Retry a file, skip it, retry the failed ones, start over; a live log per file.

### 💬 Ask AI
A chat about your notebooks, in its own sidebar tab.
- Type **`@`** to bring in a notebook or a whole project; the AI reads them (read-only) and answers in Markdown, with **source chips** that open quick look at the cited section or PDF page.
- **Attach** files or images (📎, drag and drop, or paste a screenshot); Word, PowerPoint and Excel are turned into text first.
- **Speak** your question (🎤 or <kbd>⌥Space</kbd>), then press Enter.
- Answers stream in, with Mermaid diagrams, highlighted code, three **"Ask next"** suggestions, and time · cost · model under each one. Pick the model per chat (Haiku, Sonnet, Opus).
- Chats are kept, follow-ups keep the context (even after a restart), and you can pin, rename or delete them.

### 👀 Quick look
Preview a notebook — or its source PDFs and images — inside the app (<kbd>Space</kbd> on a card). Notebooks run sandboxed on their own origin; links open in your browser.

### 🎨 Made to be lived in
Light, dark or follow the system · Vietnamese and English UI · Google Sans Flex · an animated logo · updates itself from GitHub Releases.

<p align="center">
  <img src=".github/assets/app-project.png" width="49%" alt="A project with tagged notebooks" />
  <img src=".github/assets/app-run.png" width="49%" alt="A run in progress" />
</p>

---

## Getting started

### Requirements
- macOS 11+ (Apple silicon or Intel) or Windows 10+
- [Claude Code](https://claude.com/claude-code) installed and logged in once (run `claude` in a terminal). StudyLens runs `claude -p` headless on your existing plan — **no API key**.

StudyLens finds `claude` on its own. If it can't, open **Settings → AI engine** and enter the path:
`~/.local/bin/claude` on macOS, `%USERPROFILE%\.local\bin\claude.exe` (or `%APPDATA%\npm\claude.cmd`) on Windows.

### Install
Use the download buttons at the top, or pick a file from the **[latest release](https://github.com/haonguyenstech/studylens/releases/latest)**:

| | |
|---|---|
| macOS, Apple silicon | [StudyLens-mac-arm64.dmg](https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-mac-arm64.dmg) |
| macOS, Intel | [StudyLens-mac-x64.dmg](https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-mac-x64.dmg) |
| Windows 10/11 (x64) | [StudyLens-Setup-win-x64.exe](https://github.com/haonguyenstech/studylens/releases/latest/download/StudyLens-Setup-win-x64.exe) |

On macOS, open the `.dmg` and drag **StudyLens** onto **Applications**. On Windows, run the installer; it installs for your account only (no admin rights needed) and adds StudyLens to the Start menu.

> [!NOTE]
> StudyLens is free and not signed with a paid Apple / Microsoft developer certificate, so the first launch shows a warning. That is expected; the steps below get past it **once**, and from then on StudyLens updates itself without asking again.

### If macOS or Windows blocks it

<details>
<summary><b>macOS: "Apple could not verify StudyLens is free of malware…" / "cannot be opened"</b></summary>

1. Click **Done** (or **OK**) in the warning. Don't move it to the Trash.
2. Open **System Settings → Privacy & Security**, scroll down to **Security**: there is a line *"StudyLens" was blocked to protect your Mac*. Click **Open Anyway**.
3. Enter your password (or Touch ID), then click **Open Anyway** once more.

On macOS 14 (Sonoma) or earlier you can instead right-click StudyLens in **Applications → Open → Open**.

</details>

<details>
<summary><b>macOS: "StudyLens.app is damaged and can't be opened. You should move it to the Trash."</b></summary>

macOS says this about apps downloaded from the internet that aren't notarized (and about broken downloads). Make sure StudyLens is in **Applications**, then open **Terminal** and run:

```bash
xattr -cr /Applications/StudyLens.app
```

Then open StudyLens as usual. If it still says *damaged*, delete it, download the `.dmg` again (from the [latest release](https://github.com/haonguyenstech/studylens/releases/latest)) and repeat. The very first 0.3.1 macOS downloads (15 Oct 2026, before about 10:00 UTC+7) had a broken signature; a fresh download fixes that.

Check which chip you have under  → **About This Mac**: *Apple M…* takes the Apple silicon `.dmg`, *Intel* the Intel one.

</details>

<details>
<summary><b>Windows: "Windows protected your PC" (blue SmartScreen window)</b></summary>

Click **More info**, then **Run anyway**. The installer starts as normal.

</details>

<details>
<summary><b>Windows: the browser won't keep the download</b></summary>

- **Edge** — *"StudyLens-Setup-win-x64.exe isn't commonly downloaded"*: open the downloads list (Ctrl+J), hover the file → **⋯ → Keep**, then **Show more → Keep anyway**.
- **Chrome** — *"… may be dangerous"* or *"suspicious download blocked"*: open the downloads list (Ctrl+J) and choose **Keep** / **Download suspicious file**.

</details>

<details>
<summary><b>Windows: blocked with no "Run anyway" (Smart App Control, antivirus)</b></summary>

- **Smart App Control** (Windows 11, *Windows Security → App & browser control*) blocks every unsigned app and has no per-app exception. Run the installer on a PC where it is *Off* or *Evaluation*, or turn it off there (once off, it can't be turned back on without resetting Windows, so decide carefully).
- **Antivirus** (Defender or another): if it quarantines the installer, restore it from the antivirus's history / quarantine and allow it, or download it again from the [latest release](https://github.com/haonguyenstech/studylens/releases/latest). You can compare the file with the SHA-256 shown next to it on the release page: `Get-FileHash .\StudyLens-Setup-win-x64.exe` in PowerShell.
- Work PCs may forbid unsigned apps by policy; ask your IT team.

</details>

<details>
<summary><b>Windows: the window stays blank or StudyLens won't start</b></summary>

StudyLens draws its window with Microsoft Edge **WebView2**, built into Windows 11 and up-to-date Windows 10. The installer fetches it when missing; if that failed (no internet during setup), install the *Evergreen Bootstrapper* from [Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/) and start StudyLens again.

</details>

### Build & run

Needs Node 20+ and Rust (`rustup`), plus on macOS the Xcode command-line tools.

```bash
npm install
npm run dev          # the app with live reload (src/renderer, src/engine); Rust changes rebuild and restart it
npm run app          # build this Mac's .app and install it to /Applications
npm test             # engine tests (Deep Brief, WBS) + Rust tests (library, run engine end to end with a fake Claude)
npm run pack:mac     # release/: dmg + zip, Apple silicon and Intel
npm run pack:win     # release/: StudyLens-Setup-<v>.exe, cross-built on macOS (see below)
npm run release      # every installer, uploaded to this repo's GitHub Releases (see below)
```

The Windows installer is cross-built on a Mac: `rustup target add x86_64-pc-windows-msvc x86_64-apple-darwin`, `cargo install cargo-xwin`, `brew install nsis llvm`. On Windows itself `npm run pack:win` works with the Visual Studio C++ build tools.

Screenshots come from the app itself, with demo data in their own folder and a fake Claude (`npx tauri build --debug --bundles app` first):

```bash
APP=src-tauri/target/debug/bundle/macos/StudyLens.app/Contents/MacOS/studylens
# the Guide's numbered screenshots
STUDYLENS_THEME=dark STUDYLENS_SHOOT=/tmp/StudyLens STUDYLENS_SCRIPT=scripts/guide-shots.js STUDYLENS_FAKE_CLAUDE=$PWD/scripts/fake-claude.mjs $APP
# a walk through every state (runs, Deep Brief diagrams, quick look, themes, English)
STUDYLENS_SHOOT=/tmp/shots STUDYLENS_SCRIPT=scripts/shoot.js STUDYLENS_FAKE_CLAUDE=$PWD/scripts/fake-claude.mjs $APP
```

## Guide

The numbers in each screenshot match the table under it.

### 1. Check the AI engine

Open **Settings** (bottom left). The pill next to it says **AI ready** once Claude Code is found.

<img src=".github/assets/guide-1-settings.png" width="820" alt="Settings: Claude Code status, model, appearance" />

| | |
|---|---|
| **1 · Claude Code** | **Working** means StudyLens found `claude` and it answered. Not found? Click the refresh icon after installing it, or enter its path here. |
| **2 · Model** | **Default** uses whatever Claude Code uses. Opus writes most carefully and is slowest; Haiku is fastest. Applies to new runs. |
| **3 · Appearance** | Light, dark, or follow the system. The ◐ button in the header switches it too. |

> 📌 Further down: **Projects folder** (where new projects go, `~/Documents/StudyLens` by default) and **Updates**.

### 2. Make a project

A project is a folder on disk; every notebook made in it gets its own folder inside. Click **+** next to *Projects* in the sidebar, or **New project** on the home page.

<img src=".github/assets/guide-2-project.png" width="820" alt="New project dialog: name, color, folder" />

| | |
|---|---|
| **1 · Project name** | Also the folder name. |
| **2 · Color** | Tints the project's icon in the sidebar. |
| **3 · Folder** | Where the folder is created. **Choose…** to put it anywhere, e.g. a synced drive. |

> 📌 Renaming a project renames its folder. Drag a notebook onto another project to move it, files and all.

### 3. Add documents and press Process

Open the project → **New notebook**.

<img src=".github/assets/guide-3-documents.png" width="820" alt="New notebook: add documents, file list, output mode, Process" />

| | |
|---|---|
| **1 · Add documents** | Click to pick files, or drop them here: PDF, PPTX, DOCX, XLSX, images. |
| **2 · Files** | The order the notebook follows. Drag to reorder, ✕ to remove. A ✓ means the file was found and is readable. |
| **3 · Output** | **One notebook** from all the files, or **One per file** (a separate notebook for each, run one after another). |
| **4 · Process** | Starts the run. Disabled until Claude Code is ready and the files fit the notebook type. |

Then scroll down to the options:

<img src=".github/assets/guide-3-options.png" width="820" alt="Options: notebook type, notebook name, language, web fact-check" />

| | |
|---|---|
| **1 · Notebook type** | **Tap to Explain** for slides and lectures, **Deep Brief** for long documents (RFP, PRD, spec), **WBS Map** for an Excel WBS. |
| **2 · Notebook name** | Filled in from the files; type over it. With *One per file* each notebook gets its own name. |
| **3 · Explanation language** | The language the notebook is written in, whatever the documents are in. |
| **4 · Fact-check on the web** | Lets Claude check numbers, limits and years against official sources. Slower, more accurate. |

**WBS Map** reads figures straight from the workbook, so it needs at least one `.xlsx`:

<img src=".github/assets/guide-3-wbs-warn.png" width="820" alt="WBS Map selected without an Excel file: a warning, Process disabled" />

| | |
|---|---|
| **1 · WBS Map** | Add the WBS workbook, plus the RFP / PRD if you have one (used to trace requirements). |
| **2 · Warning** | Shown, and Process stays off, until an `.xlsx` is in the list. |

> 📌 Hidden sheets in the workbook are skipped: they are usually old drafts.

### 4. Follow the run

The run page opens by itself. Runs keep going while you use the rest of the app; the **Runs** tab in the sidebar lists them.

<img src=".github/assets/guide-4-run.png" width="820" alt="A run in progress: progress, controls, one row per notebook, log" />

| | |
|---|---|
| **1 · Progress** | Across all notebooks of the run, with time so far and the model. |
| **2 · Pause / Stop** | **Pause** keeps the Claude session; **Continue** picks up where it left off — even after you quit the app. |
| **3 · Notebooks** | One row per notebook with its steps: *Prepare → Write → Check → Assemble*. Click a row to see its log. |
| **4 · Log** | What Claude is reading and writing, and what the app checked. |

When a notebook fails, the others still finish:

<img src=".github/assets/guide-4-failed.png" width="820" alt="A finished run with one failed notebook and Retry failed files" />

| | |
|---|---|
| **1 · Failed notebook** | The reason is under its name. ↻ retries just this one. |
| **2 · Run controls** | **Retry failed files**, show the result in Finder / Explorer, **Start over**, or delete the run. |

> 📌 A usage-limit error is the most common failure. Wait for your plan to reset, then **Retry failed files**.

### 5. Open a notebook

Notebooks appear on the project page.

<img src=".github/assets/guide-5-project.png" width="820" alt="Project page: notebook cards, quick look and menu, tag filter, search" />

| | |
|---|---|
| **1 · Notebook card** | Click for details; <kbd>Space</kbd> opens a quick look. Drag it onto another project to move it. |
| **2 · Quick look · ⋯** | The eye opens the quick look; **⋯** has rename, tags, move to a project, view the run, delete. |
| **3 · Tag filter** | Show only the notebooks with a tag. |
| **4 · Search** | Searches every project: titles, source file names and `#tags`. |

**Quick look** shows the notebook — or one of its source files — inside the app:

<img src=".github/assets/guide-5-preview.png" width="820" alt="Quick look: tabs for the notebook and its source PDF, open in browser, close" />

| | |
|---|---|
| **1 · Tabs** | The notebook, then each source document (PDFs and images show in place). |
| **2 · Open in browser** | The notebook is one `.html` file: open it in any browser, share it, it works offline. |
| **3 · Close** | Or <kbd>Esc</kbd>. |

The notebook's own page:

<img src=".github/assets/guide-5-detail.png" width="820" alt="Notebook details: actions, tags, stats" />

| | |
|---|---|
| **1 · Actions** | Quick look, open in browser, show in Finder / Explorer; **More** has rename, tags, move, run again, view the run, delete. |
| **2 · Tags** | Click **Tags…** to edit. |
| **3 · Stats** | Slides and explanations (Tap to Explain), sections and diagrams (Deep Brief), or modules and items (WBS Map); time and model. |

### 6. Tags and search

<img src=".github/assets/guide-6-tags.png" width="820" alt="Tags dialog: current tags, suggestions" />

| | |
|---|---|
| **1 · Tags** | Type, then <kbd>Enter</kbd> or a comma. <kbd>Backspace</kbd> removes the last one. Up to 20 per notebook. |
| **2 · Suggestions** | Ready-made tags by progress, purpose, material and level. Click to add. |

Type `#` in the search box to search by tag:

<img src=".github/assets/guide-6-search.png" width="820" alt="Sidebar search for #final: matching tag and notebooks" />

| | |
|---|---|
| **1 · Search** | `#final` matches tags starting with *final*; plain words match titles, file names and tags. Several words must all match. Accents are optional (`on tap` finds *ôn tập*). |
| **2 · Results** | Tags that start with what you typed (click one to finish it), then the matching notebooks by project. |

---

## How it works

```mermaid
flowchart LR
    DOC[(PDF · PPTX · DOCX · XLSX · images)] -->|copy · extract text & media| WD[Working folder]
    WD -->|GUIDE.md + example + prompt| CC[claude -p]
    CC -->|out/ files| CHK{App checks}
    CHK -->|errors → --resume| CC
    CHK -->|ok| ASM[Assemble into template]
    ASM --> NB["project / name / name.html"]
```

1. **Prepare.** Each run gets its own working folder. PDFs and images are copied as they are; DOCX, PPTX and XLSX have their text extracted (`input-text/`) and their images pulled out (`input-media/`). Excel keeps sheet names and cell columns, skips hidden sheets, and shows numbers as Excel does.
2. **Write.** `claude -p` reads the notebook type's `GUIDE.md` and example, then writes only into `out/`.
3. **Check.** The app validates what came back, and sends any errors to the same session with `--resume` (up to 3 rounds):
   - *Tap to Explain* — every link has its article, ids unique, tags balanced, the required blocks present.
   - *Deep Brief* — structure, balanced tags, no dead anchors, tables wrapped, and every Mermaid diagram actually draws (rendered in a hidden window).
   - *WBS Map* — Claude only says **how to read the sheet** (sheet, rows, columns) and writes the analysis; the app reads **every number from the workbook**, checks that each item is in exactly one module and that totals match the sheet's TOTAL row.
4. **Assemble.** Content goes into the type's template (CSS, navigation, interactivity) and is saved as one `.html` that works offline.

---

## Safety

The AI works on your files unattended, so the limits are set in code:

- Claude runs with a fixed tool list (Read, Write, Edit, Glob, Grep, Task; WebSearch/WebFetch only when **Web fact-check** is on). **Bash is blocked**, permission mode `dontAsk`.
- It writes only inside the run's working folder; the app copies the result out.
- Input documents are treated as data, never as instructions.
- Rich text from the AI is restricted to a small tag allow-list; notebooks have no access to the app (sandboxed preview on a separate origin).
- WBS figures never come from the model — they are read from the spreadsheet and cross-checked.

---

## Releases and self-update

- Installers and the update feed are this repo's **[GitHub Releases](https://github.com/haonguyenstech/studylens/releases)**. Each release also carries fixed-name copies (`StudyLens-mac-arm64.dmg`, `StudyLens-mac-x64.dmg`, `StudyLens-Setup-win-x64.exe`) so the download buttons always point at the newest build.
- To publish: bump `version` in `package.json` and `src-tauri/Cargo.toml`, add a `## X.Y.Z` section to `CHANGELOG.md`, run `npm run release` (macOS dmg + zip for arm64 and x64, Windows setup exe; uses `gh`).
- The app checks for updates 4 s after launch and every 6 h (or **Settings → Updates**). macOS: downloads the zip for this chip, verifies its sha256, swaps the `.app` after quitting (rolls back on failure). Windows: silent install (`/S /R`), the app reopens. The asset names are the ones 0.2 looks for, so the Electron versions update straight into this one; on Windows the installer first removes the old Electron copy. A running notebook is stopped with its session kept, ready to continue.

---

## Project layout

```
src-tauri/src/        the app (Rust)
├── lib.rs            window, commands for window.api, settings, quick-look protocol (slpreview), updates
├── runs.rs           runs: queue, pause / stop / continue, retry, history
├── job.rs            one notebook: prepare → claude -p (stream-json) → check / fix rounds → write
├── library.rs        projects and notebooks on disk (rename, move, tags, delete)
├── convert.rs        input files: copies, Office images; the text comes from the engine
├── engine.rs         calls into the engine running in the window
├── claude.rs         find and launch the CLI (stdin prompt, Windows .cmd, process tree stop)
├── preview.rs        which files quick look may show, and how they are served
├── updater.rs        GitHub Releases self-update
├── drop_paths.rs     Windows: paths of files dropped on the window (WebView2)
└── runs_e2e.rs       end-to-end test of the run engine (fake Claude, engine under Node)
src-tauri/windows/    installer hooks (remove the 0.2 Electron copy)
src/engine/           checks and page assembly, in TypeScript, run inside the window (and under Node in tests)
├── notebook.ts       Tap to Explain: check + assemble
├── brief.ts          Deep Brief: check + navigation + assemble
├── wbs.ts            WBS Map: read the sheet, check the spec, render
├── xlsx.ts, office.ts  Excel reader; DOCX/PPTX/XLSX text
└── diagrams.ts       Mermaid → SVG in an off-screen frame
src/renderer/         the UI (plain JS + CSS), bridge.js (window.api), i18n, fonts
src/shared/           strings.json (UI texts, read by both sides), types
assets/               per notebook type: GUIDE.md (instructions for Claude), template.html, example
  ├── brief/          Deep Brief
  └── wbs/            WBS Map
scripts/              build, pack, release, tests, fake Claude, screenshot scripts, WBS test workbook
design/               logo source (logo.svg, render-logo.cjs)
```

App data lives in `~/Library/Application Support/StudyLens` (macOS) or `%APPDATA%\StudyLens` (Windows), the same folder as before: `projects.json`, `history.json`, `runs.json`, `settings.json` and the last working folders under `jobs/`.

---

## Credits

- [Claude Code](https://claude.com/claude-code) — writes the notebooks
- [Tauri](https://tauri.app/) (MIT/Apache-2.0) · [JSZip](https://stuk.github.io/jszip/) (MIT/GPLv3) · [Mermaid](https://mermaid.js.org/) (MIT)
- [Google Sans Flex](https://fonts.google.com/) — SIL Open Font License

<div align="center"><sub>© Hao Nguyen · All rights reserved.</sub></div>
