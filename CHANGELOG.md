# Changelog

## Unreleased

- Releases and updates now come from this repo's GitHub Releases (the separate studylens-releases repo is gone). Each release also has fixed-name installers for the README's download buttons. Copies on 0.1.0 look for updates in the old place, so install this version once by hand.
- New notebook type **WBS Map**: give it a work breakdown structure in Excel (optionally with the requirements document) and it builds a delivery map — effort by phase and role, a dependency map between modules (hover to see what each needs and unlocks), the end-to-end flow, an editable schedule (people per role, hours a day, start date), and for every phase and module its purpose, cohesion, preconditions, assumptions and risks; plus external inputs, findings, open questions, WBS quality checks, estimate confidence with suggested padding, load by role, a dependency matrix and the critical chain. Every number is read straight from the workbook; the AI only says how to read the sheet and writes the analysis, and the app checks both (totals must match the sheet's TOTAL row).
- Excel files are read properly: sheets by name, hidden sheets skipped, cells stay in their column when a cell is empty, formulas and merged cells noted, and numbers shown as in Excel (1.1, not 1.1000000000000001). This also improves Excel input for the other types.
- Quick look: preview a notebook inside the app (Space on a notebook card, double-click, the eye button, or Quick look on its page), with tabs for its source files — PDFs, images, HTML and text show right there; PowerPoint and Word open in their own app. Esc closes; links open in the browser.
- Light and dark mode: pick System, Light or Dark in Settings › Appearance, or from the button next to the language switch. System follows macOS / Windows; the colours cross-fade when switching.
- Tags on notebooks: add them from a notebook's menu or its page (Enter or a comma adds one, tags already in use are suggested, plus ready-made ones grouped by progress, purpose, material and level). Type `#tag` in the search box to find notebooks by tag (typing `#` suggests tags); plain words also match tags; search ignores Vietnamese marks. A project's page can be filtered by tag.
- Two notebook types. **Tap to Explain** (as before): the original rebuilt, tap any line for its explanation. **Deep Brief** (new): the material rewritten as a structured analysis — contents rail, key facts, parts and numbered sections, tables, Mermaid diagrams drawn to SVG, call-outs, contradictions, glossary and open questions.
- Projects are the top level: the app opens on all projects (cards with their latest notebooks); a new notebook is made inside a project (breadcrumb Project › New notebook). A project is a folder on disk; notebooks made in it are saved inside it. The sidebar lists projects with their notebooks; each project has its own page (notebooks, totals, run in progress).
- Manage notebooks: rename (folder and file follow), move to another project (drag onto a project in the sidebar, or the ⋯ menu), take out of a project, delete (optionally to the Trash). Edit, recolor or delete projects.
- Each notebook is saved in its own folder: `<name>/<name>.html`.

## 0.1.0

First release.

- Turn study material (PDF, PPTX, DOCX, XLSX, images, Markdown…) into an interactive HTML notebook: the slides rebuilt, every line clickable, each explanation with a quick take, an everyday example and the details.
- Several files: one notebook, or one notebook per file with its own name.
- Runs you can pause, continue (picks up where it stopped, even after a restart), stop, start over, retry or skip per file — with a full history and a log per file.
- Vietnamese / English interface, light and dark mode.
- Checks for new versions and updates itself.
