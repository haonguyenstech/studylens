// Chuẩn bị file đầu vào cho Claude: PDF/ảnh/text chép nguyên; DOCX/PPTX/XLSX trích text + ảnh nhúng.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { numberLocale, t } from "./i18n";
import path from "node:path";
import JSZip from "jszip";

export const DIRECT = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".md", ".markdown", ".txt", ".html", ".htm", ".csv", ".json"];
export const OFFICE = [".docx", ".pptx", ".xlsx"];
export const ACCEPTED = [...DIRECT, ...OFFICE];

export interface Prepared {
  original: string;
  copied: string;      // đường dẫn tương đối trong workDir
  text?: string;       // bản text trích (tương đối)
  media: string[];     // ảnh trích (tương đối)
  note: string;        // mô tả ngắn để đưa vào prompt
}

const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const byNum = (a: string, b: string) => (parseInt(a.replace(/\D+/g, "")) || 0) - (parseInt(b.replace(/\D+/g, "")) || 0);

// Tên file an toàn, không trùng giữa các file đầu vào
function slot(i: number, file: string) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, path.extname(file)).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60) || "file";
  return { name: `${String(i + 1).padStart(2, "0")}-${base}`, ext };
}

export async function prepareInputs(files: string[], workDir: string, log: (s: string) => void): Promise<Prepared[]> {
  for (const d of ["input", "input-text", "input-media"]) mkdirSync(path.join(workDir, d), { recursive: true });
  const out: Prepared[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const { name, ext } = slot(i, f);
    if (!ACCEPTED.includes(ext)) throw new Error(t("conv.unsupported", { ext, name: path.basename(f) }));
    const copied = path.join("input", name + ext);
    copyFileSync(f, path.join(workDir, copied));
    const item: Prepared = { original: f, copied, media: [], note: "" };
    if (OFFICE.includes(ext)) {
      const zip = await JSZip.loadAsync(readFileSync(f));
      let md = "";
      if (ext === ".pptx") md = await pptxText(zip);
      else if (ext === ".docx") md = await docxText(zip);
      else md = await xlsxText(zip);
      item.text = path.join("input-text", name + ".md");
      writeFileSync(path.join(workDir, item.text), `# ${path.basename(f)}\n\n${md}`);
      item.media = await extractMedia(zip, path.join(workDir, "input-media", name), path.join("input-media", name));
      log(t("conv.extracted", { name: path.basename(f), chars: md.length.toLocaleString(numberLocale()), images: item.media.length }));
      item.note = `${copied} (đã trích text ở ${item.text}${item.media.length ? `, ảnh ở input-media/${name}/` : ""})`;
    } else {
      item.note = copied;
    }
    out.push(item);
  }
  return out;
}

async function extractMedia(zip: JSZip, dir: string, rel: string): Promise<string[]> {
  const names = Object.keys(zip.files).filter((n) => /\/media\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(n));
  if (!names.length) return [];
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const n of names) {
    const file = path.basename(n);
    writeFileSync(path.join(dir, file), await zip.file(n)!.async("nodebuffer"));
    out.push(path.join(rel, file));
  }
  return out;
}

function paras(xml: string, pTag: string, tTag: string): string[] {
  const res: string[] = [];
  const pRe = new RegExp(`<${pTag}[\\s>][\\s\\S]*?</${pTag}>`, "g");
  const tRe = new RegExp(`<${tTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tTag}>`, "g");
  for (const p of xml.match(pRe) || []) {
    let line = "";
    let m: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((m = tRe.exec(p))) line += unxml(m[1]);
    const lvl = /<a:pPr[^>]*\blvl="(\d)"/.exec(p);
    if (line.trim()) res.push((lvl ? "  ".repeat(+lvl[1]) : "") + line);
  }
  return res;
}

async function pptxText(zip: JSZip): Promise<string> {
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNum);
  let md = "";
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i])!.async("string");
    md += `## Slide ${i + 1}\n\n`;
    for (const line of paras(xml, "a:p", "a:t")) md += `- ${line}\n`;
    // ảnh trên slide này (qua file .rels)
    const relName = slides[i].replace("slides/", "slides/_rels/") + ".rels";
    const rel = zip.file(relName);
    if (rel) {
      const imgs = [...(await rel.async("string")).matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map((m) => m[1]);
      if (imgs.length) md += `\nẢnh trên slide: ${imgs.join(", ")}\n`;
    }
    const notes = zip.file(`ppt/notesSlides/notesSlide${slides[i].match(/(\d+)\.xml$/)![1]}.xml`);
    if (notes) {
      const n = paras(await notes.async("string"), "a:p", "a:t").filter((l) => !/^\d+$/.test(l.trim()));
      if (n.length) md += `\nGhi chú người trình bày:\n${n.map((l) => `> ${l}`).join("\n")}\n`;
    }
    md += "\n";
  }
  return md;
}

async function docxText(zip: JSZip): Promise<string> {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    // bảng → dòng Markdown
    const rows = tbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
    const lines = rows.map((r) => "| " + (r.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []).map((c) => paras(c, "w:p", "w:t").join(" ").replace(/\|/g, "/")).join(" | ") + " |");
    return `<w:p><w:r><w:t>\n${lines.join("\n")}\n</w:t></w:r></w:p>`;
  });
  let md = "";
  for (const p of body.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []) {
    let text = "";
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) text += unxml(m[1]);
    if (!text.trim()) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] || "";
    const h = /^heading\s*(\d)/i.exec(style);
    if (/^title$/i.test(style)) md += `# ${text}\n\n`;
    else if (h) md += `${"#".repeat(Math.min(6, +h[1] + 1))} ${text}\n\n`;
    else if (/<w:numPr>/.test(p)) md += `- ${text}\n`;
    else md += `${text}\n\n`;
  }
  return md;
}

async function xlsxText(zip: JSZip): Promise<string> {
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared = ss ? (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("")) : [];
  const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(byNum);
  let md = "";
  for (let i = 0; i < sheets.length; i++) {
    const xml = await zip.file(sheets[i])!.async("string");
    md += `## Sheet ${i + 1}\n\n`;
    for (const row of xml.match(/<row[\s>][\s\S]*?<\/row>/g) || []) {
      const cells = (row.match(/<c[\s>][\s\S]*?<\/c>|<c [^>]*\/>/g) || []).map((c) => {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1] ?? "";
        return /t="s"/.test(c) ? shared[+v] ?? "" : unxml(v);
      });
      if (cells.some((c) => c.trim())) md += `| ${cells.join(" | ")} |\n`;
    }
    md += "\n";
  }
  return md;
}
