# StudyLens

Desktop app for macOS and Windows. Pick your study material (slide PDF, PPTX, DOCX, XLSX, images, Markdown…), press **Process**, and get back one self-contained **interactive HTML notebook**:

- The main page **rebuilds the original material** as 16:9 white slides, keeping the text, order and diagrams.
- **Every line, and every box or arrow in a diagram, is clickable**. Clicking opens a drawer on the right with:
  - **Hiểu nhanh**: a 1–3 sentence explanation with no jargon.
  - **Ví dụ đời thường**: a familiar everyday situation, with a table mapping each part of it to a concept in the system.
  - **Trong app bạn dùng hằng ngày**: where the concept shows up in Shopee, Grab, MoMo, banking apps…
  - **Đi sâu hơn**: the full technical knowledge, with numbers and diagrams. Notes are tagged *Dùng ở đâu*, *Dễ hiểu nhầm* or *Khi phỏng vấn*.
- `Esc` closes the drawer and `←` / `→` move between items. The page counts how many items you've opened, and supports dark mode.

## Requirements

[Claude Code](https://claude.com/claude-code) must be installed on the machine and logged in once (run `claude` in a terminal). The app runs `claude -p` headless, so it uses your existing Claude plan. You don't need an API key.

The app finds `claude` on its own. If it can't, click the status chip in the top-right corner and enter the path:

- macOS: `~/.local/bin/claude`
- Windows: `%USERPROFILE%\.local\bin\claude.exe`, or `%APPDATA%\npm\claude.cmd` if you installed it with npm.

## How it works

1. **Prepare.** Each run gets its own working directory (`<userData>/jobs/<time>/`).
   - PDFs and images are copied as they are. Claude reads them directly.
   - DOCX, PPTX and XLSX files have their text extracted to `input-text/*.md` and their embedded images to `input-media/`.
2. **Write.** `claude -p` reads `GUIDE.md`, the instructions for slide format, article format and the checklist (`assets/GUIDE.md`). It then writes `out/meta.json`, `out/slides.html`, `out/articles.html` and, optionally, `out/charts.js`.
   - Allowed tools: Read, Write, Edit, Glob, Grep, Task, plus WebSearch and WebFetch when "Tra cứu web" is turned on.
   - Bash is blocked, and the permission mode is `dontAsk`.
3. **Check** (`src/main/notebook.ts`). The app verifies that:
   - every link points to an existing article, and every article has at least one link to it;
   - no id is duplicated;
   - HTML tags are balanced;
   - each article has its "Hiểu nhanh" and "Ví dụ đời thường" blocks;
   - `charts.js` has no syntax errors.

   If anything fails, the app runs `claude -p --resume` with the list of errors, for at most 3 rounds.
4. **Assemble.** The content is inserted into `assets/template.html` (CSS, drawer, navigation) and written out as a single `.html` file. The default location is the folder of the original file.

The 8 most recent working directories are kept, so you can inspect a run when it fails.

## Runs: pause, continue, history

Each press of **Process** creates a *run*, saved in `<userData>/runs.json`.
- With several files you choose **One notebook** or **One per file**. In *one per file* mode every file gets its own name field, auto-filled from its file name and editable.
- **Pause / Stop** halt the AI but keep the item's working folder and Claude session id. **Continue** runs `claude --resume <session>` in the same folder, so the work picks up where it stopped, even after the app was quit.
- **Start over**, **Retry failed files**, and per file **Retry**, **Skip**, **Open** and **Working folder**.
- The **Runs** tab in the sidebar keeps every run: its state, progress, cost, time, and a log per file (`log.jsonl` in the working folder).
- The engine is `src/main/runs.ts` (`RunManager`). `node scripts/test-runs.mjs` checks pause/continue, stop → relaunch → continue, skip, retry, start over and delete against `scripts/fake-claude.mjs`, so no AI calls are made.

## Releases and self-update

- The source code (this repo) is **private**. The installers and the update feed live in the **public** repo [haonguyenstech/studylens-releases](https://github.com/haonguyenstech/studylens-releases).
- To publish:
  1. Bump `version` in `package.json`.
  2. Add a `## X.Y.Z` section to `CHANGELOG.md`.
  3. Run `npm run release`.

  The script builds the macOS dmg/zip (arm64 + x64) and the Windows nsis/zip (x64), then uploads them as release `vX.Y.Z` with the changelog section as notes. It takes the token from `gh auth token`.
- The app checks `releases/latest` of the public repo 4 s after launch and then every 6 h. You can also check from Settings → Updates.
- When a newer version exists, a card appears in the sidebar with the release notes and **Update & restart** (`src/main/updater.ts`):
  - **macOS:** the app isn't signed, so Squirrel.Mac can't be used. The updater downloads the zip for this machine's chip and checks its sha256 against GitHub's asset digest. It then unpacks the zip with `ditto` and starts a detached script. Once the app has quit, the script swaps the `.app` bundle (and rolls back if the swap fails), clears the quarantine flag and reopens the app.
  - **Windows:** the updater runs the NSIS installer with `/S --force-run` after the app quits.
- If a run is in progress during an update, it is stopped with its session kept, so you can **Continue** it after the update.
- To test the update flow, run an older build with `STUDYLENS_UPDATE_TEST=1`. It checks, installs without relaunching, and quits.

## Development

```bash
npm install
npm run dev          # hot reload: CSS swaps in place, renderer JS reloads the window,
                     # main/preload TypeScript recompiles and restarts the app. F12 = DevTools
npm run app          # ~5 s: build + pack this Mac's .app + install to /Applications
npm run release      # minutes: every installer (mac dmg/zip ×2 arch + win nsis/zip)
node scripts/run-cli.mjs file.pdf --model sonnet --fast --out /tmp/out   # pipeline without the UI
```

Use `dev` while iterating, `app` to try the real packaged app, `release` only to ship.

| Path | Contents |
| --- | --- |
| `src/main/claude.ts` | Finds and launches the CLI. On Windows, `.cmd` files go through `cmd.exe`, and the prompt is always sent over stdin. |
| `src/main/convert.ts` | Extracts DOCX, PPTX and XLSX with JSZip. |
| `src/main/pipeline.ts` | One Process run: stream-json → live log, plus the fix rounds. |
| `src/main/notebook.ts` | Reads `out/`, checks it, and assembles the template. |
| `assets/GUIDE.md` | Instructions for Claude. Edit this file to change how the notebook is written. |
| `assets/template.html` | The frame of the output notebook. |
| `assets/EXAMPLE.html` | A sample slide and articles. |
