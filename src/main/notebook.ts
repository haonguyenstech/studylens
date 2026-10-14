// Đọc nội dung Claude ghi trong out/, kiểm tra theo checklist của GUIDE.md, ghép vào template.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { t } from "./i18n";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

export interface Parts {
  meta: { title: string; sections: { id: string; label: string }[] };
  slides: string;
  articles: string;
  charts: string;
  css: string;
}

const VOID = new Set(["br", "img", "input", "hr", "meta", "link", "wbr", "col", "source", "area", "base", "embed", "param", "track"]);

export function readParts(workDir: string): { parts?: Parts; errors: string[] } {
  const out = path.join(workDir, "out");
  const errors: string[] = [];
  const read = (f: string) => (existsSync(path.join(out, f)) ? readFileSync(path.join(out, f), "utf8") : null);

  let meta: Parts["meta"] | null = null;
  const metaRaw = read("meta.json");
  if (metaRaw == null) errors.push(t("chk.noMeta"));
  else {
    try {
      meta = JSON.parse(metaRaw);
      if (!meta || typeof meta.title !== "string" || !Array.isArray(meta.sections)) throw new Error(t("chk.metaFields"));
    } catch (e) {
      errors.push(t("chk.badMeta", { msg: (e as Error).message }));
      meta = null;
    }
  }
  const slides = read("slides.html");
  if (slides == null) errors.push(t("chk.noSlides"));

  let articles = read("articles.html");
  const dir = path.join(out, "articles");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
    if (files.length) {
      if (articles != null) errors.push(t("chk.bothArticles"));
      articles = files.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n\n");
    }
  }
  if (articles == null) errors.push(t("chk.noArticles"));

  if (errors.length) return { errors };
  return { parts: { meta: meta!, slides: slides!, articles: articles!, charts: read("charts.js") || "", css: read("extra.css") || "" }, errors };
}

export function balance(html: string, label: string, errors: string[]) {
  const stack: { tag: string; line: number }[] = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  const lineOf = (i: number) => html.slice(0, i).split("\n").length;
  let reported = 0;
  while ((m = re.exec(html)) && reported < 5) {
    if (m[0].startsWith("<!--")) continue;
    const [, close, rawTag, , self] = m;
    const tag = rawTag.toLowerCase();
    if (self || VOID.has(tag)) continue;
    if (!close) { stack.push({ tag, line: lineOf(m.index) }); continue; }
    const top = stack[stack.length - 1];
    if (top && top.tag === tag) { stack.pop(); continue; }
    const idx = stack.map((s) => s.tag).lastIndexOf(tag);
    if (idx >= 0) {
      const unclosed = stack.splice(idx);
      unclosed.shift();
      errors.push(t("chk.unclosedBefore", { label, tags: unclosed.map((u) => `<${u.tag}> (${t("chk.line", { line: u.line })})`).join(", "), tag, line: lineOf(m.index) }));
    } else {
      errors.push(t("chk.extraClose", { label, tag, line: lineOf(m.index) }));
    }
    reported++;
  }
  if (stack.length && reported < 5) errors.push(t("chk.unclosed", { label, tags: stack.slice(-3).map((s) => `<${s.tag}> ${t("chk.line", { line: s.line })}`).join(", ") }));
}

export interface Report { errors: string[]; slides: number; articles: number }

export function validate(p: Parts): Report {
  const errors: string[] = [];
  const arts = [...p.articles.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
  const artIds: string[] = [];
  if (!arts.length) errors.push(t("chk.zeroArticles"));
  for (const a of arts) {
    const attrs = a[1];
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (!/\bclass="d"/.test(attrs)) errors.push(t("chk.noClassD", { id: id ?? "?" }));
    if (!id) { errors.push(t("chk.noId")); continue; }
    if (!id.startsWith("d-")) errors.push(t("chk.idPrefix", { id }));
    if (!/\bdata-where=(?:"[^"]+"|'[^']+')/.test(attrs)) errors.push(t("chk.noWhere", { id }));
    if (!/\bdata-q=(?:"[^"]+"|'[^']+')/.test(attrs)) errors.push(t("chk.noQ", { id }));
    if (!/class="easy"/.test(a[2])) errors.push(t("chk.noEasy", { id }));
    if (!["d-qa", "d-sources"].includes(id) && !/class="ex"/.test(a[2])) errors.push(t("chk.noEx", { id }));
    artIds.push(id);
  }
  const artSet = new Set(artIds);

  // id trùng trên toàn trang
  const all = [...(p.slides + "\n" + p.articles).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set<string>(), dup = new Set<string>();
  for (const id of all) (seen.has(id) ? dup : seen).add(id);
  if (dup.size) errors.push(t("chk.dupIds", { ids: [...dup].slice(0, 15).join(", ") }));

  // link → article
  const refs = (s: string) => [...s.matchAll(/(?:href="#|data-d=")(d-[^"]+)"/g)].map((m) => m[1]);
  const slideRefs = refs(p.slides), artRefs = refs(p.articles);
  const missing = [...new Set([...slideRefs, ...artRefs].filter((r) => !artSet.has(r)))];
  if (missing.length) errors.push(t("chk.deadLinks", { ids: missing.slice(0, 20).join(", ") }));
  const linked = new Set([...slideRefs, ...artRefs]);
  const orphan = artIds.filter((id) => !linked.has(id));
  if (orphan.length) errors.push(t("chk.orphans", { ids: orphan.slice(0, 20).join(", ") }));
  if (!slideRefs.length) errors.push(t("chk.noLinks"));

  // section trong meta phải có h2.sec-h
  for (const s of p.meta.sections) {
    if (!new RegExp(`<h2[^>]*\\bid="${s.id.replace(/[^\w-]/g, "")}"`).test(p.slides)) errors.push(t("chk.noSection", { id: s.id }));
  }

  if (/<script\b/i.test(p.slides) || /<script\b/i.test(p.articles)) errors.push(t("chk.script"));
  balance(p.slides, "slides.html", errors);
  balance(p.articles, "articles", errors);

  if (p.charts.trim()) {
    try { new vm.Script(`(function(el){${p.charts}\n})`); }
    catch (e) { errors.push(t("chk.chartsSyntax", { msg: (e as Error).message })); }
    const ids = new Set(all);
    const used = [...p.charts.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    const bad = [...new Set(used.filter((i) => !ids.has(i)))];
    if (bad.length) errors.push(t("chk.chartsIds", { ids: bad.join(", ") }));
  }

  const slides = (p.slides.match(/class="slide[\s"]/g) || []).length;
  if (!slides) errors.push(t("chk.zeroSlides"));
  return { errors, slides, articles: artIds.length };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function assemble(template: string, p: Parts): string {
  const tabs = p.meta.sections.map((s) => `      <a href="#${esc(s.id)}">${esc(s.label)}</a>`).join("\n");
  const docId = crypto.createHash("sha1").update(p.meta.title + p.articles.length).digest("hex").slice(0, 10);
  // dùng hàm thay thế để chuỗi nội dung có "$&"… không bị hiểu là mẫu thay thế
  const fill = (s: string, key: string, val: string) => s.split(key).join(val);
  let html = template;
  html = fill(html, "<!--EXTRA_CSS-->", p.css.trim() ? `<style>\n${p.css}\n</style>` : "");
  html = fill(html, "{{TITLE}}", esc(p.meta.title));
  html = fill(html, "{{TABS}}", tabs);
  html = fill(html, "{{DOC_ID}}", docId);
  html = fill(html, "{{CHARTS_JS}}", p.charts.replace(/<\/script/gi, "<\\/script"));
  html = fill(html, "{{SLIDES}}", p.slides);
  html = fill(html, "{{ARTICLES}}", p.articles);
  return `<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${html.replace("</style>", "</style>\n</head>\n<body>")}\n</body>\n</html>\n`;
}
