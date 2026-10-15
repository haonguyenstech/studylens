// Text of Office files for Claude: PPTX slides (with images named and speaker notes), DOCX
// paragraphs (headings, lists, tables as Markdown rows) and XLSX sheets (see xlsx.ts).
// The app copies the files and pulls out their images itself; this only makes the text.
import JSZip from "jszip";
import { readWorkbook, workbookText } from "./xlsx";

const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const byNum = (a: string, b: string) => (parseInt(a.replace(/\D+/g, "")) || 0) - (parseInt(b.replace(/\D+/g, "")) || 0);

/** The Markdown text of a .pptx, .docx or .xlsx (without the "# <file name>" heading the app adds). */
export async function officeText(bytes: Uint8Array, ext: string): Promise<string> {
  if (ext === ".xlsx") return workbookText(await readWorkbook(bytes));
  const zip = await JSZip.loadAsync(bytes);
  return ext === ".pptx" ? pptxText(zip) : docxText(zip);
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

