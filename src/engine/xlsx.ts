// Excel workbooks (.xlsx): sheets by name in workbook order, hidden ones flagged, cells kept at their
// column (an empty cell no longer shifts the next one left), merged ranges, formulas with their
// cached values, and numbers printed the way Excel shows them (1.1, not 1.1000000000000001).
import JSZip from "jszip";

export interface Cell { v: string; f?: string; num?: number }
export interface Sheet {
  name: string;
  hidden: boolean;
  rows: Map<number, Map<string, Cell>>;   // row number → column letters → cell
  merges: string[];
}
export interface Workbook { sheets: Sheet[] }

const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** A number as Excel would show it in a General cell: binary noise trimmed (15 significant digits). */
export const showNum = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toPrecision(15)));
export const colNum = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

export async function readWorkbook(buf: Buffer | Uint8Array): Promise<Workbook> {
  const zip = await JSZip.loadAsync(buf);
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  // Rich-text runs are joined; phonetic hints (<rPh>) are not part of the text.
  const shared = ss ? (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) =>
    [...si.replace(/<rPh[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("")) : [];
  const wbXml = (await zip.file("xl/workbook.xml")?.async("string")) || "";
  const relXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) || "";
  const targets = new Map([...relXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1] ?? "", /Target="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const sheets: Sheet[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = unxml(/name="([^"]*)"/.exec(tag)?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1] ?? "";
    let target = targets.get(rid) || "";
    target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const xml = await zip.file(target)?.async("string");
    if (!xml) continue;
    sheets.push({ name, hidden: /state="(hidden|veryHidden)"/.test(tag), rows: parseRows(xml, shared), merges: [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((x) => x[1]) });
  }
  return { sheets };
}

function parseRows(xml: string, shared: string[]) {
  const rows = new Map<number, Map<string, Cell>>();
  for (const row of xml.match(/<row\b[^>]*\/>|<row\b[\s\S]*?<\/row>/g) || []) {
    const rn = +(/\br="(\d+)"/.exec(row)?.[1] ?? 0);
    const cells = new Map<string, Cell>();
    for (const c of row.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(c)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(c)?.[1];
      let v = "", num: number | undefined;
      if (type === "s") v = raw != null ? shared[+raw] ?? "" : "";
      else if (type === "inlineStr") v = [...c.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => unxml(x[1])).join("");
      else if (type === "b") v = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else if (type === "str" || type === "e") v = raw != null ? unxml(raw) : "";
      else if (raw != null && raw !== "") { num = +raw; v = Number.isFinite(num) ? showNum(num) : unxml(raw); }
      v = v.replace(/\r\n?/g, "\n");
      if (!v.trim() && !f) continue;
      cells.set(ref, { v, ...(f ? { f: unxml(f) } : {}), ...(num != null && Number.isFinite(num) ? { num } : {}) });
    }
    if (cells.size) rows.set(rn, cells);
  }
  return rows;
}

/**
 * The workbook as text for the AI: visible sheets first, each row with its number and every cell
 * with its column letter, so empty cells don't shift anything. Hidden sheets are only named.
 */
export function workbookText(wb: Workbook): string {
  const visible = wb.sheets.filter((s) => !s.hidden), hidden = wb.sheets.filter((s) => s.hidden);
  let md = `Workbook: ${wb.sheets.length} sheet (${visible.length} hiện${hidden.length ? `, ${hidden.length} ẩn: ${hidden.map((s) => `"${s.name}"`).join(", ")}` : ""}).\n`;
  md += `Mỗi dòng: R<số dòng> rồi các ô "Cột: giá trị"; ô có công thức ghi thêm {=công thức}. Ô trống không được ghi.\n\n`;
  for (const s of visible) {
    md += `## Sheet "${s.name}"\n\n`;
    if (s.merges.length) md += `Ô gộp: ${s.merges.join(" ")}\n\n`;
    for (const [rn, cells] of s.rows) {
      const parts = [...cells].sort((a, b) => colNum(a[0]) - colNum(b[0])).map(([c, cell]) => `${c}: ${cell.v.includes("\n") ? JSON.stringify(cell.v) : cell.v}${cell.f ? ` {=${cell.f}}` : ""}`);
      md += `R${rn} | ${parts.join(" | ")}\n`;
    }
    md += "\n";
  }
  return md;
}
