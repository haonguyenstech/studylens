// Deep Brief: the AI rewrites the material as a structured analysis (masthead, parts, numbered
// sections, tables, call-outs, Mermaid diagrams). Claude writes out/meta.json + out/brief.html
// (or out/brief/NN.html); the app checks it, draws the diagrams to SVG and builds the side
// navigation from the headings, so the contents always match the document.
import { t } from "./i18n";
import { Files, listDir } from "./files";
import { balance } from "./notebook";
import type { Drawn } from "./diagrams";

export interface BriefParts {
  meta: { title: string; mark?: string; subtitle?: string };
  body: string;
}
export interface BriefReport { errors: string[]; sections: number; diagrams: number; body: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const text = (html: string) => unesc(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
const MERMAID = /<pre class="mermaid">([\s\S]*?)<\/pre>/g;

export function readBrief(out: Files): { parts?: BriefParts; errors: string[] } {
  const errors: string[] = [];
  const read = (f: string) => out[f] ?? null;
  let meta: BriefParts["meta"] | null = null;
  const raw = read("meta.json");
  if (raw == null) errors.push(t("chk.noMeta"));
  else {
    try {
      meta = JSON.parse(raw);
      if (!meta || typeof meta.title !== "string" || !meta.title.trim()) throw new Error(t("bchk.metaTitle"));
    } catch (e) { errors.push(t("chk.badMeta", { msg: (e as Error).message })); meta = null; }
  }
  let body = read("brief.html");
  const files = listDir(out, "brief").filter((f) => f.endsWith(".html"));
  if (files.length) {
    if (body != null) errors.push(t("bchk.both"));
    body = files.map((f) => out[`brief/${f}`]).join("\n\n");
  }
  if (body == null) errors.push(t("bchk.noBody"));
  if (errors.length) return { errors };
  return { parts: { meta: meta!, body: body! }, errors };
}

/** Check the content and draw its diagrams. `draw` is absent outside a browser (tests): diagrams are then left as text. */
export async function checkBrief(p: BriefParts, draw?: (codes: string[]) => Promise<Drawn[]>): Promise<BriefReport> {
  const errors: string[] = [];
  const b = p.body;
  if (/<(script|style|link|iframe|html|head|body)\b/i.test(b)) errors.push(t("bchk.forbidden"));
  if (/\son[a-z]+\s*=/i.test(b)) errors.push(t("bchk.handlers"));
  balance(b, "brief", errors);
  if (!/<header class="masthead"[^>]*>[\s\S]*?<h1[\s>]/.test(b)) errors.push(t("bchk.noMasthead"));
  const parts = (b.match(/<section class="part"/g) || []).length;
  if (!parts) errors.push(t("bchk.noParts"));

  const arts = [...b.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
  if (arts.length < 3) errors.push(t("bchk.fewSections", { n: arts.length }));
  for (const a of arts) {
    const id = attr(a[1], "id");
    if (!/\bclass="blk"/.test(a[1])) errors.push(t("bchk.noBlk", { id: id ?? "?" }));
    if (!id) { errors.push(t("bchk.noId")); continue; }
    if (!/^[a-z][\w-]*$/i.test(id)) errors.push(t("bchk.badId", { id }));
    if (!/<h3[\s>]/.test(a[2])) errors.push(t("bchk.noH3", { id }));
  }
  const ids = [...b.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set<string>(), dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  if (dup.size) errors.push(t("chk.dupIds", { ids: [...dup].slice(0, 15).join(", ") }));
  const dead = [...new Set([...b.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((r) => !seen.has(r)))];
  if (dead.length) errors.push(t("bchk.deadLinks", { ids: dead.slice(0, 20).join(", ") }));
  const tables = (b.match(/<table[\s>]/g) || []).length, wrapped = (b.match(/class="tbl"/g) || []).length;
  if (tables > wrapped) errors.push(t("bchk.tableWrap", { n: tables - wrapped }));

  // Diagrams: every Mermaid block must draw; the errors go back to the AI with where they are.
  const blocks = [...b.matchAll(MERMAID)];
  const where = (i: number) => {
    let id = "?";
    for (const a of arts) if ((a.index ?? 0) <= i) id = attr(a[1], "id") ?? id;
    return id;
  };
  let body = b;
  if (draw && blocks.length) {
    const drawn = await draw(blocks.map((m) => unesc(m[1]).trim()));
    blocks.forEach((m, k) => {
      const d = drawn[k];
      if (!d?.svg) errors.push(t("bchk.diagram", { n: k + 1, id: where(m.index ?? 0), first: unesc(m[1]).trim().split("\n")[0].slice(0, 40), msg: d?.error || "?" }));
    });
    if (!errors.length) {
      let k = 0;
      body = b.replace(MERMAID, () => drawn[k++].svg!);
    }
  }
  return { errors, sections: arts.length, diagrams: blocks.length, body };
}

/** The side navigation: one group per part, one link per section, labels from the headings (or data-short). */
export function briefNav(body: string): string {
  const out: string[] = [];
  const re = /<section class="part"([^>]*)>([\s\S]*?)<\/section>|<article\b([^>]*)>([\s\S]*?)<\/article>/g;
  for (const m of body.matchAll(re)) {
    if (m[2] != null && m[1] != null && m[0].startsWith("<section")) {
      const pn = text(/class="pn"[^>]*>([\s\S]*?)<\/span>/.exec(m[2])?.[1] ?? "");
      const h2 = text(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(m[2])?.[1] ?? "");
      const short = attr(m[1], "data-short") || h2;
      out.push(`    <div class="rail-group">${esc(pn ? `${pn} · ${short}` : short)}</div>`);
    } else {
      const id = attr(m[3], "id");
      if (!id) continue;
      const h3 = text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(m[4])?.[1] ?? id);
      const num = /^(\d+)[.)]?\s+/.exec(h3);
      const label = attr(m[3], "data-short") || (num ? h3.slice(num[0].length) : h3);
      out.push(`    <a href="#${esc(id)}"><span class="n">${num ? num[1] : "·"}</span><span>${esc(unesc(label))}</span></a>`);
    }
  }
  return out.join("\n");
}

export function assembleBrief(template: string, p: BriefParts, body: string, footer: string, lang = "vi"): string {
  const fill = (s: string, key: string, val: string) => s.split(key).join(val);
  let html = template;
  html = fill(html, "{{LANG}}", lang);
  html = fill(html, "{{TITLE}}", esc(p.meta.title));
  html = fill(html, "{{MARK}}", esc(p.meta.mark || "StudyLens · Deep Brief"));
  html = fill(html, "{{RAIL_SUB}}", esc(p.meta.subtitle || ""));
  html = fill(html, "{{NAV}}", briefNav(body));
  html = fill(html, "{{FOOTER}}", esc(footer));
  html = fill(html, "{{BODY}}", body);
  return html;
}
