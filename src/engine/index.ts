// The engine: the document work that needs a JavaScript runtime but no system access. The Rust side
// runs Claude and owns the files; it calls in here (through the app window) to turn the files Claude
// wrote into a notebook, and to read the text out of Office files. Every function is pure apart
// from what `host` gives it, so the same code runs in the WebView and under Node in the tests.
import { Lang, numberLocale, setLang, t } from "./i18n";
import { Files } from "./files";
import { assemble, readParts, validate } from "./notebook";
import { assembleBrief, checkBrief, readBrief } from "./brief";
import { checkWbs, pickWorkbookFile, readWbsSpec, renderWbs } from "./wbs";
import { officeText as office } from "./office";
import type { Drawn } from "./diagrams";

export interface Host {
  readBytes(path: string): Promise<Uint8Array>;
  draw?(codes: string[]): Promise<Drawn[]>;   // Mermaid → SVG; absent under Node (diagrams stay text)
}

export interface CheckRequest {
  format: "tap" | "brief" | "wbs";
  out: Files;             // what Claude wrote in out/
  template: string;       // the format's template.html
  title: string;          // the name the user set ("" = the AI's)
  lang: string;           // language of the explanations ("English" → an English page frame)
  files: string[];        // the source files (WBS: the workbook is read from them)
  uiLang: Lang;
}
export type CheckResult =
  | { ok: true; title: string; html: string; slides: number; articles: number; logs: string[] }
  | { ok: false; errors: string[]; logs: string[] };

/** Check what Claude wrote; when it passes, the finished page. Errors go back to Claude to fix. */
export async function check(req: CheckRequest, host: Host): Promise<CheckResult> {
  setLang(req.uiLang);
  const logs: string[] = [];
  const pageLang = /^english$/i.test(req.lang) ? "en" : "vi";
  const today = () => new Date().toLocaleDateString(numberLocale());

  if (req.format === "brief") {
    const { parts, errors } = readBrief(req.out);
    if (!parts) return { ok: false, errors, logs };
    const n = (parts.body.match(/<pre class="mermaid">/g) || []).length;
    if (n && host.draw) logs.push(t("run.drawing", { n }));
    const report = await checkBrief(parts, host.draw);
    if (report.errors.length) return { ok: false, errors: report.errors, logs };
    if (req.title) parts.meta.title = req.title;
    const html = assembleBrief(req.template, parts, report.body, t("brief.footer", { date: today() }), pageLang);
    return { ok: true, title: parts.meta.title, html, slides: report.sections, articles: report.diagrams, logs };
  }

  if (req.format === "wbs") {
    const { spec, errors: readErrors } = readWbsSpec(req.out);
    if (!spec) return { ok: false, errors: readErrors, logs };
    let errors: string[], model;
    try { ({ errors, model } = await checkWbs(spec, pickWorkbookFile(spec, req.files), host.readBytes)); }
    catch (e) { errors = [`Không đọc được file Excel theo source: ${(e as Error).message}`]; }
    if (errors.length || !model) return { ok: false, errors, logs };
    if (req.title) spec.meta.title = req.title;
    const html = renderWbs(req.template, model, pageLang, t("wbs.footer", { date: today() }));
    return { ok: true, title: spec.meta.title, html, slides: model.modules.length, articles: model.inScope.length, logs };
  }

  const { parts, errors } = readParts(req.out);
  const report = parts ? validate(parts) : { errors, slides: 0, articles: 0 };
  if (report.errors.length || !parts) return { ok: false, errors: report.errors, logs };
  // The name the user set (or the one auto-filled from the file) wins over whatever the AI wrote.
  if (req.title) parts.meta.title = req.title;
  return { ok: true, title: parts.meta.title, html: assemble(req.template, parts), slides: report.slides, articles: report.articles, logs };
}

/** The Markdown text of an Office file, and its length as shown in the log ("12.345"). */
export async function officeText(req: { path: string; ext: string; uiLang: Lang }, host: Host): Promise<{ md: string; chars: string }> {
  setLang(req.uiLang);
  const md = await office(await host.readBytes(req.path), req.ext);
  return { md, chars: md.length.toLocaleString(numberLocale()) };
}
