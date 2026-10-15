// WBS Map: a work breakdown structure (.xlsx) → a delivery map (phases, modules, dependencies, risks).
// The AI writes out/wbs.json: how to read the sheet (which rows and columns) plus the analysis.
// Every number on the page is read from the workbook here, never typed by the AI.
import { Files } from "./files";
import { readWorkbook, Sheet, colNum, showNum } from "./xlsx";

type Level = "high" | "mid" | "low";
type Check = "ok" | "warn" | "fail";
export interface WbsSpec {
  meta: { title: string; mark?: string; eyebrow?: string; lede: string };
  source: {
    file?: string; sheet: string; firstRow: number; lastRow: number;
    cols: { id: string; name: string; module?: string; desc?: string; notes?: string; phase: string; priority?: string; total?: string };
    roles: { key: string; label: string; col: string }[];
    totalRow?: number; totalMismatchOk?: boolean;
  };
  phases: { n: string; title: string; sheetTitle?: string; summary: string; goal: string; exit: string; pre: string; warn?: boolean; parallel?: boolean }[];
  modules: { key: string; phase: string; code: string; name: string; sheetName?: string; rows: [number, number]; purpose: string;
    cohesion: Level; cohesionWhy: string; needs: string[]; unlocks: string[]; assumptions: string[]; risks: string[] }[];
  external?: { key: string; name: string; sub?: string; unlocks: string[] }[];
  inputs?: { what: string; who: string; blocks: string; when: string; level: Level }[];
  journey?: { id: string; label: string; needs?: string }[];
  chain?: { label: string; id?: string; phase?: string; note?: string }[];
  findings?: { id: string; level: "critical" | "warn" | "info"; title: string; body: string }[];
  questions?: { group: string; text: string }[];
  checks?: { status: Check; title: string; text: string }[];
  confidence?: Record<string, [Level, string]>;
  futureNotes?: Record<string, string>;
  assumptionsSheet?: { sheet: string; note?: string; rows: { name: string; value: string; status: "ok" | "warn" | "na"; note: string }[] };
  trace?: { source: string; rows: { ref: string; requirement: string; items: string[]; status: "covered" | "partial" | "missing"; note?: string }[] };
}

export interface Item {
  row: number; id: string; name: string; module: string; desc: string; notes: string; phase: string; priority: string;
  hours: Record<string, number>; total: number; sheetTotal?: number; conf: Level; confWhy: string;
}

// ---------- reading out/ ----------
export function readWbsSpec(out: Files): { spec?: WbsSpec; errors: string[] } {
  const raw = out["wbs.json"];
  if (raw == null) return { errors: ["Thiếu out/wbs.json."] };
  try { return { spec: JSON.parse(raw), errors: [] }; }
  catch (e) { return { errors: [`out/wbs.json không phải JSON hợp lệ: ${(e as Error).message}`] }; }
}

/** The workbook the spec reads: the named file, else the first .xlsx among the inputs. */
export function pickWorkbookFile(spec: WbsSpec, files: string[]): string | undefined {
  const xl = files.filter((f) => /\.xlsx$/i.test(f));
  const base = (f: string) => f.split(/[\\/]/).pop();
  if (spec.source?.file) return xl.find((f) => base(f) === spec.source.file || f.endsWith(spec.source.file!)) ?? xl[0];
  return xl[0];
}

// ---------- the model ----------
const LOW = /pending|high risk|schedule risk|not (fully |yet )?(defined|confirmed|finali[sz]ed)|tbd|tbc|redesign|clarification|additional (research|optimi[sz]ation|effort)|chưa (chốt|xác định|rõ)/i;
const MID = /provided (during implementation|when available)|sprint 1 dependency|subject to|may be|depends on|dependency|assum(e|ption).{0,40}(client|customer) (provides?|supplies)/i;
export const CONF_PAD: Record<Level, number> = { high: 0.1, mid: 0.25, low: 0.5 };

export function buildModel(spec: WbsSpec, sheet: Sheet) {
  const s = spec.source;
  const cell = (r: number, c?: string) => (c ? sheet.rows.get(r)?.get(c.toUpperCase()) : undefined);
  const text = (r: number, c?: string) => (cell(r, c)?.v ?? "").trim();
  const num = (r: number, c?: string) => { const x = cell(r, c); return x?.num ?? (x && /^-?\d+(\.\d+)?$/.test(x.v.trim()) ? +x.v : 0); };
  const items: Item[] = [];
  for (let r = s.firstRow; r <= s.lastRow; r++) {
    const name = text(r, s.cols.name);
    if (!name) continue;
    const hours = Object.fromEntries(s.roles.map((ro) => [ro.key, num(r, ro.col)]));
    const total = Object.values(hours).reduce((a, b) => a + b, 0);
    const it: Item = {
      row: r, id: text(r, s.cols.id), name, module: text(r, s.cols.module), desc: text(r, s.cols.desc), notes: text(r, s.cols.notes),
      phase: text(r, s.cols.phase), priority: text(r, s.cols.priority), hours, total: +showNum(total),
      ...(s.cols.total && cell(r, s.cols.total) ? { sheetTotal: num(r, s.cols.total) } : {}), conf: "high", confWhy: "",
    };
    const over = spec.confidence?.[it.id];
    if (over) [it.conf, it.confWhy] = over;
    else {
      const t = it.desc + "\n" + it.notes, low = LOW.exec(t), mid = low ? null : MID.exec(t);
      [it.conf, it.confWhy] = low ? ["low", `"${low[0]}"`] : mid ? ["mid", `"${mid[0]}"`] : ["high", ""];
    }
    items.push(it);
  }
  const phaseNs = new Set(spec.phases.map((p) => p.n));
  const inScope = items.filter((i) => phaseNs.has(i.phase));
  const future = items.filter((i) => !phaseNs.has(i.phase));
  const sum = (list: Item[], k?: string) => +showNum(list.reduce((a, i) => a + (k ? i.hours[k] : i.total), 0));
  const modules = spec.modules.map((m) => {
    const its = inScope.filter((i) => i.row >= m.rows[0] && i.row <= m.rows[1]);
    const hours = Object.fromEntries(s.roles.map((ro) => [ro.key, sum(its, ro.key)]));
    return { ...m, items: its, hours, total: sum(its) };
  });
  const phases = spec.phases.map((p) => {
    const its = inScope.filter((i) => i.phase === p.n);
    return { ...p, items: its, mods: modules.filter((m) => m.phase === p.n), hours: Object.fromEntries(s.roles.map((ro) => [ro.key, sum(its, ro.key)])), total: sum(its) };
  });
  const sheetTotals = s.totalRow ? Object.fromEntries(s.roles.map((ro) => [ro.key, num(s.totalRow!, ro.col)])) : null;
  return { spec, items, inScope, future, modules, phases, total: sum(inScope), roleTotals: Object.fromEntries(s.roles.map((ro) => [ro.key, sum(inScope, ro.key)])), sheetTotals };
}
export type Model = ReturnType<typeof buildModel>;

// ---------- checks (errors go back to the AI) ----------
const RICH = /^(p|ul|ol|li|b|strong|em|i|code|br|a|table|thead|tbody|tr|th|td|div)$/;
function richErrors(where: string, html: string): string[] {
  const errs: string[] = [];
  for (const m of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const [tag, name, attrs] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (!RICH.test(name)) { errs.push(`${where}: thẻ <${name}> không được dùng (chỉ p, ul, ol, li, b, em, code, br, a, table, div.tbl).`); continue; }
    if (tag.startsWith("</") || !attrs || attrs === "/") continue;
    if (name === "a" && /^href="#[\w-]+"$/.test(attrs)) continue;
    if (name === "div" && attrs === 'class="tbl"') continue;
    errs.push(`${where}: thuộc tính không được dùng: ${tag}`);
  }
  return errs;
}

export async function checkWbs(spec: WbsSpec, file: string | undefined, readBytes: (p: string) => Promise<Uint8Array>): Promise<{ errors: string[]; model?: Model }> {
  const e: string[] = [];
  const need = (ok: unknown, msg: string) => { if (!ok) e.push(msg); return !!ok; };
  if (!need(spec && typeof spec === "object", "wbs.json phải là một object.")) return { errors: e };
  need(spec.meta?.title?.trim(), "meta.title trống.");
  need(spec.meta?.lede?.trim(), "meta.lede trống.");
  const s = spec.source;
  if (!need(s && s.sheet && s.cols && Array.isArray(s.roles), "Thiếu source (sheet, cols, roles).")) return { errors: e };
  if (!need(file, "Không có file .xlsx nào trong tài liệu đầu vào.")) return { errors: e };
  const wb = await readWorkbook(await readBytes(file!));
  const sheet = wb.sheets.find((x) => x.name === s.sheet);
  if (!need(sheet, `source.sheet "${s.sheet}" không có trong workbook (có: ${wb.sheets.map((x) => `"${x.name}"`).join(", ")}).`)) return { errors: e };
  const colOk = (c: string | undefined, what: string) => !c || need(/^[A-Z]{1,3}$/i.test(c), `source.cols.${what} "${c}" không phải chữ cột.`);
  for (const [k, c] of Object.entries(s.cols)) colOk(c as string, k);
  need(s.cols.id && s.cols.name && s.cols.phase, "source.cols cần ít nhất id, name, phase.");
  need(s.roles.length > 0, "source.roles trống: cần ít nhất một cột giờ (vai trò).");
  for (const r of s.roles) need(r.key && r.label && /^[A-Z]{1,3}$/i.test(r.col || ""), `source.roles: "${r.key}" thiếu key/label/col.`);
  need(Number.isInteger(s.firstRow) && Number.isInteger(s.lastRow) && s.firstRow <= s.lastRow, "source.firstRow/lastRow phải là số dòng, firstRow ≤ lastRow.");
  if (e.length) return { errors: e };

  need(Array.isArray(spec.phases) && spec.phases.length, "phases trống.");
  need(Array.isArray(spec.modules) && spec.modules.length, "modules trống.");
  if (e.length) return { errors: e };
  const model = buildModel(spec, sheet!);
  need(model.items.length >= 3, `Đọc được ${model.items.length} hạng mục từ dòng ${s.firstRow}–${s.lastRow}, cột tên ${s.cols.name}: xem lại source.`);
  need(model.total > 0, "Tổng giờ bằng 0: cột giờ (source.roles) có thể sai.");
  // totals vs the sheet: every item, whatever its phase (Future rows usually carry 0)
  if (model.sheetTotals && !s.totalMismatchOk) {
    for (const r of s.roles) {
      const a = +showNum(model.items.reduce((x, i) => x + i.hours[r.key], 0)), b = model.sheetTotals[r.key];
      need(Math.abs(a - b) < 0.01, `Tổng cột ${r.label} (${r.col}) cộng từ các hạng mục dòng ${s.firstRow}–${s.lastRow} = ${showNum(a)}, dòng tổng ${s.totalRow} ghi ${showNum(b)}. Xem lại source (firstRow/lastRow, cột). Nếu chính sheet sai, đặt source.totalMismatchOk = true và ghi thành một finding.`);
    }
  }

  // phases and modules
  const pn = new Set<string>();
  for (const p of spec.phases) {
    need(p.n != null && !pn.has(String(p.n)), `phases: mã phase "${p.n}" trống hoặc trùng.`);
    pn.add(String(p.n));
    for (const k of ["title", "summary", "goal", "exit", "pre"] as const) need((p as any)[k]?.trim(), `phase ${p.n}: thiếu ${k}.`);
    need(model.inScope.some((i) => i.phase === p.n), `phase ${p.n}: không có hạng mục nào có cột phase = "${p.n}".`);
  }
  const keys = new Set<string>();
  for (const m of spec.modules) {
    const at = `module ${m.key || m.name}`;
    need(m.key && /^[a-z][\w-]*$/.test(m.key) && !keys.has(m.key), `${at}: key trống, trùng hoặc không hợp lệ (chữ thường, số, -).`);
    keys.add(m.key);
    need(pn.has(m.phase), `${at}: phase "${m.phase}" không có trong phases.`);
    need(Array.isArray(m.rows) && m.rows.length === 2 && m.rows[0] <= m.rows[1], `${at}: rows phải là [dòng đầu, dòng cuối].`);
    for (const k of ["code", "name", "purpose", "cohesionWhy"] as const) need(m[k]?.trim(), `${at}: thiếu ${k}.`);
    need(["high", "mid", "low"].includes(m.cohesion), `${at}: cohesion phải là high, mid hoặc low.`);
    for (const k of ["needs", "unlocks", "assumptions", "risks"] as const) need(Array.isArray(m[k]), `${at}: ${k} phải là mảng (có thể rỗng).`);
  }
  if (e.length) return { errors: e };
  const extKeys = new Set((spec.external || []).map((x) => x.key));
  for (const m of spec.modules) {
    for (const u of m.unlocks) need(keys.has(u), `module ${m.key}: unlocks "${u}" không phải key module.`);
    const mm = model.modules.find((x) => x.key === m.key)!;
    need(mm.items.length || mm.total === 0, `module ${m.key}: không có hạng mục nào trong dòng ${m.rows[0]}–${m.rows[1]}.`);
    for (const i of mm.items) need(i.phase === m.phase, `Hạng mục ${i.id} (dòng ${i.row}) có phase "${i.phase}" nhưng nằm trong module ${m.key} (phase ${m.phase}).`);
  }
  for (const x of spec.external || []) for (const u of x.unlocks || []) need(keys.has(u), `external ${x.key}: unlocks "${u}" không phải key module.`);
  // every in-scope item belongs to exactly one module
  for (const i of model.inScope) {
    const n = model.modules.filter((m) => m.items.includes(i)).length;
    need(n === 1, `Hạng mục ${i.id || "(không mã)"} "${i.name}" (dòng ${i.row}) thuộc ${n} module: mỗi hạng mục phải thuộc đúng một module.`);
  }
  // references
  const ids = new Set(model.items.map((i) => i.id));
  for (const j of spec.journey || []) need(ids.has(j.id), `journey: không có hạng mục mã "${j.id}".`);
  for (const c of spec.chain || []) need(!c.id || ids.has(c.id), `chain: không có hạng mục mã "${c.id}".`);
  for (const t of spec.trace?.rows || []) for (const id of t.items || []) need(ids.has(id), `trace ${t.ref}: không có hạng mục mã "${id}".`);
  for (const id of Object.keys(spec.confidence || {})) need(ids.has(id), `confidence: không có hạng mục mã "${id}".`);
  for (const f of spec.findings || []) e.push(...richErrors(`finding ${f.id}`, f.body || ""));
  e.push(...richErrors("meta.lede", spec.meta.lede));
  need(!extKeys.has("") , "external: key trống.");
  return { errors: e, model };
}

// ---------- rendering ----------
const L = {
  vi: {
    hours: "giờ", items: "hạng mục", phase: "Phase", total: "Tổng", sheet: "Sheet", none: "Không", end: "Kết thúc dự án",
    purpose: "Mục đích chính", cohesion: "Độ liên kết", needs: "Cần có trước", unlocks: "Mở khoá cho", assume: "Giả định chính", risks: "Rủi ro · cần làm rõ",
    noRisk: "Không thấy rủi ro đáng kể.", noHours: "Không có giờ trong WBS", table: "Bảng hạng mục", rows: "dòng", lead: "Vai trò chính",
    coh: { high: "Cao", mid: "Trung bình", low: "Thấp" }, conf: { high: "Cao", mid: "Vừa", low: "Thấp" }, confCol: "Tin cậy", pri: "Ưu tiên",
    detail: "Mô tả & giả định", descH: "Mô tả", notesH: "Giả định · ràng buộc · giải pháp",
    summary: "Tóm tắt", goal: "Mục đích", exit: "Xong khi", pre: "Điều kiện trước",
    navOverview: "Tổng quan", navSummary: "Tóm tắt & effort", navMap: "Bản đồ phụ thuộc", navJourney: "Luồng nghiệp vụ đầu–cuối", navSched: "Lịch ước tính",
    navPhases: "Theo phase", navFuture: "Sau MVP (Future)", navCross: "Xuyên suốt", navInputs: "Đầu vào bên ngoài", navAssume: "Tab Assumptions",
    navTrace: "Truy vết yêu cầu", navFindings: "Phát hiện", navQuestions: "Câu hỏi còn mở", navQuality: "Chất lượng WBS", navChecks: "Kiểm tra theo chuẩn",
    navConf: "Độ tin cậy & dự phòng", navLoad: "Tải theo vai trò", navDsm: "Ma trận phụ thuộc", navChain: "Chuỗi găng", contents: "Mục lục",
    effortH: "Effort theo phase và vai trò", effortSub: "Độ dài thanh tỉ lệ với số giờ; màu là vai trò. Bấm một dòng để tới phase đó.", inScope: "Tổng (trong phạm vi)",
    mapH: "Bản đồ phụ thuộc giữa các module", mapSub: "Mỗi cột là một phase; đường đi từ thứ cần có trước tới thứ dùng nó. Đường đỏ đứt là chỗ một module cần kết quả của phase sau.",
    extRow: "Đầu vào bên ngoài", legFwd: "Phụ thuộc thuận chiều", legBack: "Ngược thứ tự phase", legExt: "Đầu vào bên ngoài", legHint: "Rê chuột vào một ô để xem nó cần gì (xanh) và mở khoá cho gì (tím); bấm để tới phần chi tiết.",
    journeyH: "Luồng nghiệp vụ đầu–cuối", journeySub: "Các bước của một lần sử dụng, theo thứ tự. Nhãn màu là phase xây bước đó; ô viền đỏ là bước được xây trước bước cung cấp dữ liệu cho nó.",
    futureH: "Sau MVP", futureSub: "Không thuộc phạm vi hiện tại",
    inputsH: "Đầu vào bên ngoài", inputsSub: "Những thứ đội dự án không tự làm được; mỗi dòng ghi các hạng mục bị chặn nếu đầu vào đó đến trễ.",
    inputCols: ["Đầu vào", "Ai cung cấp", "Chặn hạng mục", "Cần lúc", "Mức"], lvl: { high: "Cao", mid: "Vừa", low: "Thấp" },
    assumeH: "Tab Assumptions", assumeCols: ["Thông số", "Giá trị", "", "Đối chiếu với WBS"],
    traceH: "Truy vết yêu cầu", traceCols: ["Mục", "Yêu cầu", "Hạng mục WBS", "Phủ", "Ghi chú"], tr: { covered: "Đủ", partial: "Một phần", missing: "Thiếu" },
    findingsH: "Phát hiện", findingsSub: "Chỗ lệch, mâu thuẫn hoặc thiếu khi đọc kỹ toàn bộ WBS.", sev: { critical: "Nghiêm trọng", warn: "Cần xử lý", info: "Vệ sinh" },
    questionsH: "Câu hỏi còn mở", questionsSub: "Nên chốt trước khi khoá kế hoạch.",
    qualityH: "Kiểm tra chất lượng WBS", qualitySub: "Đối chiếu với các nguyên tắc WBS thường dùng (quy tắc 100%, WBS dictionary, tiêu chí nghiệm thu), phần đếm được thì tính lại từ dữ liệu.",
    ck: { ok: "Đạt", warn: "Cần sửa", fail: "Thiếu" },
    ckSum: "Tổng con bằng tổng cha", ckSumOk: (n: number) => `Đã cộng lại ${n} hạng mục: khớp dòng tổng của sheet.`, ckSumBad: "Tổng tính từ hạng mục khác dòng tổng của sheet (xem Phát hiện).", ckSumNone: "Sheet không có dòng tổng để đối chiếu.",
    ckAcc: "Tiêu chí nghiệm thu", ckAccT: (a: number, n: number) => `${a}/${n} hạng mục ghi tiêu chí xong (Acceptance, On Success, Definition of Done…).`,
    ckSize: "Kích thước gói việc", ckSizeT: (over40: number, list: string) => over40 ? `${over40} gói trên 40 giờ: nên chia nhỏ để theo dõi theo sprint.` : `Không gói nào trên 40 giờ${list ? `; lớn nhất: ${list}` : ""}.`,
    ckZero: "Dòng 0 giờ", ckZeroT: (n: number, list: string) => n ? `${n} hạng mục 0 giờ (${list}): là việc ngoài WBS, hay bị quên ước lượng?` : "Không có.",
    confH: "Độ tin cậy của ước lượng", confSub: "Mỗi hạng mục xếp Cao / Vừa / Thấp theo chính những gì dòng đó ghi (pending, not fully defined, dependency…) và theo rủi ro kế thừa. Dự phòng gợi ý: +10% / +25% / +50%.",
    confLine: (l: string) => `Tin cậy ${l}`, wbsEst: "Ước lượng trong WBS", withPad: "Cộng dự phòng theo độ tin cậy", lowList: "Các hạng mục tin cậy thấp", why: "Vì sao", wrote: "Ghi",
    overH: "Effort ngoài WBS (tham khảo)", overRows: [["Quản lý dự án (PM)", 0.1, 0.15], ["Kiểm thử (QA)", 0.15, 0.25], ["Phân tích nghiệp vụ (BA)", 0.05, 0.1]] as [string, number, number][],
    overSum: "Tổng dự án ước tính", overNote: "Tỉ lệ thường gặp khi ước lượng sớm, tính trên effort trong WBS; cận trên đã gồm dự phòng. Bỏ dòng nào WBS đã có giờ; thay bằng số thật của đội khi có.",
    mustH: "Must / Should", mustNote: (p: number, rest: string) => `${p}% là Must Have${p >= 90 ? ": gần như không còn chỗ cắt nếu lịch trượt" : ""}.${rest ? ` Phần còn lại: ${rest}.` : ""}`,
    loadH: "Tải theo vai trò và phase", loadSub: "Ô càng đậm càng nhiều giờ: chỗ dễ nghẽn người.",
    dsmH: "Ma trận phụ thuộc (DSM)", dsmSub: "Đọc theo hàng: module ở hàng cần module ở cột. Xếp theo phase, nên chấm phía trên đường chéo (đỏ) là cần thứ của phase sau.", needsWord: "cần",
    chainH: "Chuỗi găng", chainSub: "Chuỗi việc nối tiếp dài nhất (suy ra từ phụ thuộc) quyết định ngày xong; nhãn đỏ là chỗ đang bị chặn.",
    schedH: "Lịch ước tính", schedSub: "Chỉnh số người mỗi vai trò và giờ làm hiệu quả mỗi ngày; độ dài mỗi phase là vai trò chậm nhất của phase đó. Ngày nghỉ cuối tuần đã được bỏ qua; chưa tính ngày lễ.",
    sPeople: "Số người", sHpd: "Giờ hiệu quả/ngày", sStart: "Bắt đầu", sPad: "Cộng dự phòng theo độ tin cậy", sEnd: "Dự kiến xong", sDays: "ngày làm việc", sShort: "ngày", sBottle: "chậm nhất:",
  },
  en: {
    hours: "h", items: "items", phase: "Phase", total: "Total", sheet: "Sheet", none: "None", end: "End of project",
    purpose: "Main purpose", cohesion: "Cohesion", needs: "Needs first", unlocks: "Unlocks", assume: "Key assumptions", risks: "Risks · to clarify",
    noRisk: "No significant risk seen.", noHours: "No hours in the WBS", table: "Items", rows: "rows", lead: "Lead role",
    coh: { high: "High", mid: "Medium", low: "Low" }, conf: { high: "High", mid: "Medium", low: "Low" }, confCol: "Confidence", pri: "Priority",
    detail: "Description & assumptions", descH: "Description", notesH: "Assumptions · constraints · solution",
    summary: "Summary", goal: "Purpose", exit: "Done when", pre: "Preconditions",
    navOverview: "Overview", navSummary: "Summary & effort", navMap: "Dependency map", navJourney: "End-to-end flow", navSched: "Estimated schedule",
    navPhases: "By phase", navFuture: "Post-MVP (Future)", navCross: "Cross-cutting", navInputs: "External inputs", navAssume: "Assumptions tab",
    navTrace: "Requirement trace", navFindings: "Findings", navQuestions: "Open questions", navQuality: "WBS quality", navChecks: "Standard checks",
    navConf: "Confidence & contingency", navLoad: "Load by role", navDsm: "Dependency matrix", navChain: "Critical chain", contents: "Contents",
    effortH: "Effort by phase and role", effortSub: "Bar length is hours; colour is role. Click a row to jump to the phase.", inScope: "Total (in scope)",
    mapH: "Dependencies between modules", mapSub: "Each column is a phase; lines run from what is needed to what uses it. Red dashed lines are a module needing a later phase.",
    extRow: "External inputs", legFwd: "Forward dependency", legBack: "Against phase order", legExt: "External input", legHint: "Hover a box to see what it needs (green) and unlocks (purple); click to jump to it.",
    journeyH: "End-to-end flow", journeySub: "The steps of one use, in order. The colour tag is the phase that builds the step; a red outline marks a step built before the step that feeds it.",
    futureH: "Post-MVP", futureSub: "Not in the current scope",
    inputsH: "External inputs", inputsSub: "What the team cannot do itself; each row lists the items blocked if it is late.",
    inputCols: ["Input", "Provided by", "Blocks", "Needed by", "Level"], lvl: { high: "High", mid: "Medium", low: "Low" },
    assumeH: "Assumptions tab", assumeCols: ["Parameter", "Value", "", "Against the WBS"],
    traceH: "Requirement trace", traceCols: ["Ref", "Requirement", "WBS items", "Coverage", "Note"], tr: { covered: "Covered", partial: "Partial", missing: "Missing" },
    findingsH: "Findings", findingsSub: "Gaps, contradictions and slips found reading the whole WBS.", sev: { critical: "Critical", warn: "Should fix", info: "Hygiene" },
    questionsH: "Open questions", questionsSub: "Settle these before locking the plan.",
    qualityH: "WBS quality checks", qualitySub: "Against common WBS practice (100% rule, WBS dictionary, acceptance criteria); what can be counted is recomputed from the data.",
    ck: { ok: "Pass", warn: "Fix", fail: "Missing" },
    ckSum: "Children add up to parents", ckSumOk: (n: number) => `Re-added ${n} items: they match the sheet's total row.`, ckSumBad: "The items do not add up to the sheet's total row (see Findings).", ckSumNone: "The sheet has no total row to compare with.",
    ckAcc: "Acceptance criteria", ckAccT: (a: number, n: number) => `${a}/${n} items state when they are done (Acceptance, On Success, Definition of Done…).`,
    ckSize: "Work package size", ckSizeT: (over40: number, list: string) => over40 ? `${over40} packages over 40 h: split them to track by sprint.` : `No package over 40 h${list ? `; largest: ${list}` : ""}.`,
    ckZero: "Zero-hour rows", ckZeroT: (n: number, list: string) => n ? `${n} items with 0 h (${list}): work outside the WBS, or forgotten?` : "None.",
    confH: "Estimate confidence", confSub: "Each item is rated High / Medium / Low from what its own row says (pending, not fully defined, dependency…) and from inherited risk. Suggested padding: +10% / +25% / +50%.",
    confLine: (l: string) => `${l} confidence`, wbsEst: "Estimate in the WBS", withPad: "With padding by confidence", lowList: "Low-confidence items", why: "Why", wrote: "Says",
    overH: "Effort outside the WBS (indicative)", overRows: [["Project management (PM)", 0.1, 0.15], ["Testing (QA)", 0.15, 0.25], ["Business analysis (BA)", 0.05, 0.1]] as [string, number, number][],
    overSum: "Estimated project total", overNote: "Typical early-estimate ratios on top of the WBS effort; the upper bound includes the padding above. Drop any line the WBS already has hours for; replace with the team's real figures.",
    mustH: "Must / Should", mustNote: (p: number, rest: string) => `${p}% is Must Have${p >= 90 ? ": almost nothing left to cut if the schedule slips" : ""}.${rest ? ` The rest: ${rest}.` : ""}`,
    loadH: "Load by role and phase", loadSub: "Darker cells are more hours: where people become the bottleneck.",
    dsmH: "Dependency structure matrix (DSM)", dsmSub: "Read by row: the row module needs the column module. Ordered by phase, so a dot above the diagonal (red) needs a later phase.", needsWord: "needs",
    chainH: "Critical chain", chainSub: "The longest run of work that must happen one after another (inferred from the dependencies) sets the finish date; red tags mark what is blocked.",
    schedH: "Estimated schedule", schedSub: "Set people per role and productive hours per day; each phase lasts as long as its slowest role. Weekends are skipped; public holidays are not.",
    sPeople: "People", sHpd: "Productive hours/day", sStart: "Start", sPad: "Add padding by confidence", sEnd: "Expected finish", sDays: "working days", sShort: "d", sBottle: "slowest:",
  },
};

/** Rich text (lede, findings): a "<" that does not open a tag is plain text ("<500ms"). */
const rich = (s: string) => s.replace(/<(?![a-zA-Z/])/g, "&lt;");
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderWbs(template: string, model: Model, lang: "vi" | "en", footer: string): string {
  const t = L[lang], spec = model.spec, roles = spec.source.roles;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString(lang === "en" ? "en-US" : "vi-VN");
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const roleIdx = Object.fromEntries(roles.map((r, i) => [r.key, i % 6]));
  const MOD = Object.fromEntries(model.modules.map((m) => [m.key, m]));
  const phaseIdx = Object.fromEntries(spec.phases.map((p, i) => [p.n, i % 8]));
  const pc = (n: string) => `pc ph${phaseIdx[n] ?? 0}`;
  const ptag = (n: string) => `<span class="${pc(n)}">P${esc(n)}</span>`;
  const TOTAL = model.total;

  const roleBar = (h: Record<string, number>, total: number, max: number) =>
    `<div class="rbar" style="--w:${max ? (total / max) * 100 : 100}%">${roles.map((r) => (h[r.key] ? `<i class="r${roleIdx[r.key]}" style="flex:${h[r.key]}" title="${esc(r.label)}: ${fmt(h[r.key])} ${t.hours}"></i>` : "")).join("")}</div>`;
  const roleLine = (h: Record<string, number>) => roles.filter((r) => h[r.key]).map((r) => `<span class="rl"><i class="dot r${roleIdx[r.key]}"></i>${esc(r.label)} <b>${fmt(h[r.key])}</b></span>`).join("");

  // edges: module needs (keys) + unlocks, external unlocks
  const edges: [string, string, string?][] = [];
  const addEdge = (a: string, b: string, kind?: string) => { if (a !== b && !edges.some((x) => x[0] === a && x[1] === b)) edges.push(kind ? [a, b, kind] : [a, b]); };
  for (const m of spec.modules) {
    for (const u of m.unlocks) addEdge(m.key, u);
    for (const n of m.needs) if (MOD[n]) addEdge(n, m.key);
  }
  const order = spec.phases.map((p) => p.n);
  for (const x of edges) if (order.indexOf(MOD[x[0]].phase) > order.indexOf(MOD[x[1]].phase)) x[2] = "back";
  for (const x of spec.external || []) for (const u of x.unlocks) addEdge(x.key, u, "ext");
  const upsOf = (k: string) => edges.filter((x) => x[1] === k && MOD[x[0]]).map((x) => x[0]);
  const downsOf = (k: string) => edges.filter((x) => x[0] === k && MOD[x[1]]).map((x) => x[1]);

  const modLink = (k: string) => { const m = MOD[k]; return `<a class="mref" href="#m-${esc(k)}">${ptag(m.phase)}${esc(m.code)} ${esc(m.name)}</a>`; };
  const PRI = (p: string) => (/must/i.test(p) ? "must" : /should/i.test(p) ? "should" : /could/i.test(p) ? "could" : "");
  const leadRole = (h: Record<string, number>) => { const top = roles.slice().sort((a, b) => h[b.key] - h[a.key])[0]; return top && h[top.key] ? top : null; };

  const itemRow = (r: Item) => {
    const detail = r.desc || r.notes ? `<tr class="det"><td colspan="${roles.length + 5}"><details><summary>${t.detail}</summary><div class="det-in">${r.desc ? `<div><h5>${t.descH}</h5><pre>${esc(r.desc)}</pre></div>` : ""}${r.notes ? `<div><h5>${t.notesH}</h5><pre>${esc(r.notes)}</pre></div>` : ""}</div></details></td></tr>` : "";
    return `<tr class="it${r.total ? "" : " zero"}"><td class="id">${esc(r.id)}</td><td class="nm">${esc(r.name)}${r.module ? `<small>${esc(r.module)}</small>` : ""}</td><td>${r.priority ? `<span class="pri ${PRI(r.priority)}">${esc(r.priority.replace(/\s*have$/i, ""))}</span>` : ""}</td>${roles.map((ro) => `<td class="num">${r.hours[ro.key] ? fmt(r.hours[ro.key]) : '<span class="z">·</span>'}</td>`).join("")}<td class="num tot">${r.total ? fmt(r.total) : '<span class="z">0</span>'}</td><td>${r.total ? `<span class="cf ${r.conf}" title="${esc(r.confWhy)}">${t.conf[r.conf]}</span>` : ""}</td></tr>${detail}`;
  };
  const maxMod = Math.max(...model.modules.map((m) => m.total), 1);
  const moduleCard = (m: Model["modules"][number]) => {
    const lead = leadRole(m.hours);
    const needsHtml = [...upsOf(m.key).map(modLink), ...m.needs.filter((n) => !MOD[n]).map((n) => `<span class="need">${esc(n)}</span>`)];
    const downs = downsOf(m.key);
    return `<article class="mod" id="m-${esc(m.key)}">
  <header class="mod-h"><div><span class="mcode">${esc(m.code)}</span><h3>${esc(m.name)}</h3><span class="msheet">${m.sheetName ? `${t.sheet}: ${esc(m.sheetName)} · ` : ""}${m.items.length} ${t.items}${lead ? ` · ${t.lead}: ${esc(lead.label)}` : ""}</span></div><div class="mod-eff"><b>${fmt(m.total)}</b><span>${t.hours}</span></div></header>
  ${roleBar(m.hours, m.total, maxMod)}<div class="rls">${roleLine(m.hours) || `<span class="rl">${t.noHours}</span>`}</div>
  <div class="mgrid">
    <section class="cell purpose"><h4>${t.purpose}</h4><p>${esc(m.purpose)}</p></section>
    <section class="cell"><h4>${t.cohesion} <span class="coh coh-${m.cohesion}">${[1, 2, 3].map((i) => `<i class="${i <= { high: 3, mid: 2, low: 1 }[m.cohesion] ? "on" : ""}"></i>`).join("")}<b>${t.coh[m.cohesion]}</b></span></h4><p>${esc(m.cohesionWhy)}</p></section>
    <section class="cell"><h4>${t.needs}</h4><ul class="chips">${needsHtml.map((x) => `<li>${x}</li>`).join("") || `<li><span class="need">${t.none}</span></li>`}</ul></section>
    <section class="cell"><h4>${t.unlocks}</h4><ul class="chips">${downs.map((k) => `<li>${modLink(k)}</li>`).join("") || `<li><span class="need">${t.end}</span></li>`}</ul></section>
    <section class="cell"><h4>${t.assume}</h4>${m.assumptions.length ? `<ul>${m.assumptions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">${t.none}</p>`}</section>
    <section class="cell risk"><h4>${t.risks}</h4>${m.risks.length ? `<ul>${m.risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">${t.noRisk}</p>`}</section>
  </div>
  ${m.items.length ? `<details class="items"><summary>${t.table} <span>${m.items.length} ${t.rows} · ${fmt(m.total)} ${t.hours}</span></summary><div class="tbl"><table class="wbs"><thead><tr><th>ID</th><th>${t.items}</th><th>${t.pri}</th>${roles.map((r) => `<th class="num">${esc(r.label)}</th>`).join("")}<th class="num">${t.total}</th><th>${t.confCol}</th></tr></thead><tbody>${m.items.map(itemRow).join("")}</tbody></table></div></details>` : ""}
</article>`;
  };

  const maxPhase = Math.max(...model.phases.map((p) => p.total), 1);
  const phaseSection = (p: Model["phases"][number]) => `<section class="phase ph${phaseIdx[p.n]}" id="phase-${esc(p.n)}">
  <div class="ph-bar"><span class="ph-n">${t.phase.toUpperCase()} ${esc(p.n)}</span><h2>${esc(p.title)}</h2>${p.sheetTitle ? `<span class="ph-sheet">${esc(p.sheetTitle)}</span>` : ""}<span class="ph-eff"><b>${fmt(p.total)}</b> ${t.hours} · ${pct(p.total, TOTAL)}%</span></div>
  <div class="ph-sum"><div class="ph-col"><h4>${t.summary}</h4><p>${esc(p.summary)}</p>${roleBar(p.hours, p.total, 0)}<div class="rls">${roleLine(p.hours)}</div></div>
    <dl class="ph-kv"><div><dt>${t.goal}</dt><dd>${esc(p.goal)}</dd></div><div><dt>${t.exit}</dt><dd>${esc(p.exit)}</dd></div><div class="${p.warn ? "warn" : ""}"><dt>${t.pre}</dt><dd>${esc(p.pre)}</dd></div></dl></div>
  ${p.mods.map(moduleCard).join("")}
</section>`;

  // overview
  const overview = `<div class="ov">${model.phases.map((p) => `<a class="ov-row" href="#phase-${esc(p.n)}"><span class="ov-l">${ptag(p.n)}${esc(p.title)}</span>${roleBar(p.hours, p.total, maxPhase)}<span class="ov-v">${fmt(p.total)}</span></a>`).join("")}
  <div class="ov-row tot"><span class="ov-l">${t.inScope}</span><span class="ov-legend">${roles.map((r) => `<span class="rl"><i class="dot r${roleIdx[r.key]}"></i>${esc(r.label)} <b>${fmt(model.roleTotals[r.key])}</b> · ${pct(model.roleTotals[r.key], TOTAL)}%</span>`).join("")}</span><span class="ov-v">${fmt(TOTAL)}</span></div></div>`;

  // dependency map
  const ext = spec.external || [];
  const depMap = `<div class="dmap-wrap"><div class="dmap" id="dmap" style="--cols:${spec.phases.length}">${ext.length ? `<div class="dext"><span class="dext-h">${t.extRow}</span>${ext.map((x) => `<a class="dn x" href="#inputs" data-k="${esc(x.key)}"><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</a>`).join("")}</div>` : ""}<div class="dcols">${model.phases.map((p) => `<div class="dcol"><div class="dcol-h"><b>${t.phase} ${esc(p.n)}</b><span>${esc(p.title)}</span></div>${p.mods.map((m) => `<a class="dn ph${phaseIdx[p.n]}" href="#m-${esc(m.key)}" data-k="${esc(m.key)}"><b><span>${esc(m.code)}</span> ${esc(m.name)}</b><small>${fmt(m.total)} ${t.hours}</small></a>`).join("")}</div>`).join("")}</div><svg class="dedges" id="dedges" aria-hidden="true"></svg></div></div>
<div class="dlegend"><span><i class="l-fwd"></i>${t.legFwd}</span>${edges.some((x) => x[2] === "back") ? `<span><i class="l-back"></i>${t.legBack}</span>` : ""}${ext.length ? `<span><i class="l-ext"></i>${t.legExt}</span>` : ""}<span class="hint">${t.legHint}</span></div>`;

  const itemById = new Map(model.items.map((i) => [i.id, i]));
  const phaseOfItem = (id?: string) => (id ? itemById.get(id)?.phase : undefined);
  const journey = spec.journey?.length ? `<ol class="jr">${spec.journey.map((j) => { const ph = phaseOfItem(j.id) ?? ""; return `<li class="ph${phaseIdx[ph] ?? 0}${j.needs ? " back" : ""}">${ptag(ph)}<b>${esc(j.label)}</b><small>${esc(j.id)}</small>${j.needs ? `<em>${esc(j.needs)}</em>` : ""}</li>`; }).join("")}</ol>` : "";

  // quality numbers
  const acc = model.inScope.filter((i) => /acceptance|on success|definition of done|done when|tiêu chí|nghiệm thu/i.test(i.desc + "\n" + i.notes));
  const zero = model.inScope.filter((i) => !i.total);
  const big = model.inScope.filter((i) => i.total > 24).sort((a, b) => b.total - a.total);
  const over40 = model.inScope.filter((i) => i.total > 40).length;
  const sumOk = model.sheetTotals ? roles.every((r) => Math.abs(model.items.reduce((x, i) => x + i.hours[r.key], 0) - model.sheetTotals![r.key]) < 0.01) : null;
  const checks: { status: Check; title: string; text: string }[] = [
    ...(spec.checks || []),
    { status: sumOk == null ? "warn" : sumOk ? "ok" : "fail", title: t.ckSum, text: sumOk == null ? t.ckSumNone : sumOk ? t.ckSumOk(model.items.length) : t.ckSumBad },
    { status: acc.length / Math.max(1, model.inScope.length) >= 0.8 ? "ok" : "warn", title: t.ckAcc, text: t.ckAccT(acc.length, model.inScope.length) },
    { status: over40 ? "warn" : "ok", title: t.ckSize, text: t.ckSizeT(over40, big.slice(0, 3).map((i) => `${i.id} · ${fmt(i.total)}h`).join(", ")) },
    { status: zero.length ? "warn" : "ok", title: t.ckZero, text: t.ckZeroT(zero.length, zero.slice(0, 14).map((i) => i.id || i.name).join(", ") + (zero.length > 14 ? "…" : "")) },
  ];
  const CKI = { ok: "✓", warn: "!", fail: "✗" };
  const confGroups = (["high", "mid", "low"] as Level[]).map((c) => ({ c, list: model.inScope.filter((i) => i.conf === c) }));
  const pad = confGroups.reduce((a, g) => a + g.list.reduce((s, i) => s + i.total, 0) * CONF_PAD[g.c], 0);
  const sumOf = (list: Item[]) => list.reduce((a, i) => a + i.total, 0);
  const must = sumOf(model.inScope.filter((i) => /must/i.test(i.priority) || !i.priority));
  const rest = model.inScope.filter((i) => i.priority && !/must/i.test(i.priority));
  const overLo = t.overRows.reduce((a, o) => a + TOTAL * o[1], 0), overHi = t.overRows.reduce((a, o) => a + TOTAL * o[2], 0);
  const maxCell = Math.max(...model.phases.flatMap((p) => roles.map((r) => p.hours[r.key])), 1);
  const ORDER = model.modules.map((m) => m.key);
  const dsm = `<div class="tbl"><table class="dsm"><thead><tr><th></th>${ORDER.map((k) => `<th title="${esc(MOD[k].name)}"><span class="${pc(MOD[k].phase)}">${esc(MOD[k].code)}</span></th>`).join("")}</tr></thead><tbody>${ORDER.map((r, i) => {
    const nd = new Set(upsOf(r));
    return `<tr><th><span class="${pc(MOD[r].phase)}">${esc(MOD[r].code)}</span> ${esc(MOD[r].name)}</th>${ORDER.map((c, j) => (i === j ? `<td class="diag"></td>` : nd.has(c) ? `<td class="dep${order.indexOf(MOD[c].phase) > order.indexOf(MOD[r].phase) ? " back" : ""}" title="${esc(MOD[r].code)} ${t.needsWord} ${esc(MOD[c].code)}">●</td>` : "<td></td>")).join("")}</tr>`;
  }).join("")}</tbody></table></div>`;
  const chain = spec.chain?.length ? `<ol class="chain">${spec.chain.map((c) => { const it = c.id ? itemById.get(c.id) : undefined; const ph = c.phase ?? it?.phase; return `<li class="${ph ? `ph${phaseIdx[ph] ?? 0}` : "ext"}">${ph ? ptag(ph) : '<span class="pc ext">EXT</span>'}<b>${esc(c.label)}</b>${it?.total ? `<small>${fmt(it.total)} ${t.hours}</small>` : ""}${c.note ? `<em>${esc(c.note)}</em>` : ""}</li>`; }).join("")}</ol>` : "";

  const SCHED = {
    roles: roles.map((r) => ({ key: r.key, label: r.label, i: roleIdx[r.key] })),
    phases: model.phases.map((p) => ({ n: p.n, title: p.title, i: phaseIdx[p.n], parallel: !!p.parallel, hours: p.hours, pad: Object.fromEntries(roles.map((r) => [r.key, p.items.reduce((a, i) => a + i.hours[r.key] * CONF_PAD[i.conf], 0)])) })),
    t: { days: t.sDays, short: t.sShort, bottle: t.sBottle, end: t.sEnd }, locale: lang === "en" ? "en-US" : "vi-VN",
  };
  const sched = `<div class="card sched" id="sched-box">
    <div class="s-ctl">${roles.map((r) => `<label class="s-in"><span><i class="dot r${roleIdx[r.key]}"></i>${esc(r.label)}</span><input type="number" min="0" max="20" step="1" value="${model.roleTotals[r.key] ? 1 : 0}" data-role="${esc(r.key)}"><small>${t.sPeople}</small></label>`).join("")}
      <label class="s-in"><span>${t.sHpd}</span><input type="number" min="1" max="12" step="0.5" value="6" id="s-hpd"></label>
      <label class="s-in"><span>${t.sStart}</span><input type="date" id="s-start"></label>
      <label class="s-chk"><input type="checkbox" id="s-pad"> ${t.sPad}</label></div>
    <div class="gantt" id="gantt"></div>
    <div class="s-end" id="s-end"></div></div>`;

  const sec = (id: string, h: string, sub: string, body: string) => `<section class="sec" id="${id}"><h2>${h}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}${body}</section>`;
  const facts = [
    [lang === "en" ? "Effort in scope" : "Tổng effort trong phạm vi", `<b>${fmt(TOTAL)}</b> ${t.hours}`],
    [lang === "en" ? "Phases · modules · items" : "Phase · module · hạng mục", `${model.phases.length} · ${model.modules.length} · ${model.inScope.length}`],
    [lang === "en" ? "Largest phase" : "Phase lớn nhất", (() => { const p = model.phases.slice().sort((a, b) => b.total - a.total)[0]; return `${t.phase} ${esc(p.n)} · <b>${pct(p.total, TOTAL)}%</b>`; })()],
    [lang === "en" ? "Largest role" : "Vai trò nhiều nhất", (() => { const r = leadRole(model.roleTotals)!; return `${esc(r.label)} · <b>${pct(model.roleTotals[r.key], TOTAL)}%</b>`; })()],
    [lang === "en" ? "With padding" : "Cộng dự phòng", `<b>${fmt(TOTAL + pad)}</b> ${t.hours}`],
    ...(spec.inputs?.length ? [[t.inputsH, `<b>${spec.inputs.length}</b> · ${spec.inputs.filter((d) => d.level === "high").length} ${t.lvl.high.toLowerCase()}`]] : []),
    ...(model.future.length ? [[t.futureH, `${model.future.length} ${t.items}`]] : []),
  ].slice(0, 6);

  const body = `<header class="masthead" id="overview">
  ${spec.meta.eyebrow ? `<div class="eyebrow">${esc(spec.meta.eyebrow)}</div>` : ""}
  <h1>${esc(spec.meta.title)}</h1>
  <p class="lede">${rich(spec.meta.lede)}</p>
  <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
</header>
${sec("effort", t.effortH, t.effortSub, `<div class="card">${overview}</div>`)}
${sec("map", t.mapH, t.mapSub, depMap)}
${journey ? sec("journey", t.journeyH, t.journeySub, journey) : ""}
${sec("schedule", t.schedH, t.schedSub, sched)}
${model.phases.map(phaseSection).join("")}
${model.future.length ? `<section class="phase fut" id="future"><div class="ph-bar"><span class="ph-n">FUTURE</span><h2>${t.futureH}</h2><span class="ph-sheet">${t.futureSub}</span><span class="ph-eff"><b>${fmt(sumOf(model.future))}</b> ${t.hours}</span></div><div class="future">${model.future.map((r) => { const note = spec.futureNotes?.[r.id] ?? spec.futureNotes?.[r.name]; return `<div><b>${esc(r.name)}</b>${r.desc ? `<p>${esc(r.desc)}</p>` : ""}${note ? `<span class="flag">${esc(note)}</span>` : ""}</div>`; }).join("")}</div></section>` : ""}
${spec.inputs?.length ? sec("inputs", t.inputsH, t.inputsSub, `<div class="card"><div class="tbl"><table><thead><tr>${t.inputCols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${spec.inputs.map((d) => `<tr><td>${esc(d.what)}</td><td>${esc(d.who)}</td><td><code>${esc(d.blocks)}</code></td><td>${esc(d.when)}</td><td><span class="sev ${d.level}">${t.lvl[d.level] ?? esc(d.level)}</span></td></tr>`).join("")}</tbody></table></div></div>`) : ""}
${spec.assumptionsSheet?.rows?.length ? sec("assumptions", `${t.assumeH}${spec.assumptionsSheet.sheet ? ` · ${esc(spec.assumptionsSheet.sheet)}` : ""}`, "", `<div class="card"><div class="tbl"><table><thead><tr>${t.assumeCols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${spec.assumptionsSheet.rows.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.value)}</td><td><span class="st ${a.status}">${{ ok: "✓", warn: "!", na: "–" }[a.status] ?? ""}</span></td><td>${esc(a.note)}</td></tr>`).join("")}</tbody></table></div>${spec.assumptionsSheet.note ? `<div class="note"><p>${esc(spec.assumptionsSheet.note)}</p></div>` : ""}</div>`) : ""}
${spec.trace?.rows?.length ? sec("trace", t.traceH, esc(spec.trace.source), `<div class="card"><div class="trace-sum">${(["covered", "partial", "missing"] as const).map((k) => `<span class="tr ${k}">${t.tr[k]} <b>${spec.trace!.rows.filter((r) => r.status === k).length}</b></span>`).join("")}</div><div class="tbl"><table><thead><tr>${t.traceCols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${spec.trace.rows.map((r) => `<tr class="tr-${r.status}"><td class="id">${esc(r.ref)}</td><td>${esc(r.requirement)}</td><td>${r.items.map((id) => `<code>${esc(id)}</code>`).join(" ") || "–"}</td><td><span class="tr ${r.status}">${t.tr[r.status]}</span></td><td>${esc(r.note || "")}</td></tr>`).join("")}</tbody></table></div></div>`) : ""}
${spec.findings?.length ? sec("findings", t.findingsH, t.findingsSub, `<div class="finds">${spec.findings.map((f) => `<article class="find ${f.level}" id="f-${esc(f.id.toLowerCase())}"><h3><span class="fid">${esc(f.id)}</span>${esc(f.title)}<span class="sev ${f.level}">${t.sev[f.level]}</span></h3>${/^\s*<[a-zA-Z]/.test(f.body) ? rich(f.body) : `<p>${rich(f.body)}</p>`}</article>`).join("")}</div>`) : ""}
${spec.questions?.length ? sec("questions", t.questionsH, t.questionsSub, `<ol class="qs">${spec.questions.map((q) => `<li><span>${esc(q.group)}</span>${esc(q.text)}</li>`).join("")}</ol>`) : ""}
${sec("quality", t.qualityH, t.qualitySub, `<div class="checks">${checks.map((c) => `<div class="ck ${c.status}"><span class="ck-i">${CKI[c.status]}</span><div><b>${esc(c.title)}</b><span class="ck-s">${t.ck[c.status]}</span><p>${esc(c.text)}</p></div></div>`).join("")}</div>`)}
${sec("confidence", t.confH, t.confSub, `<div class="card"><div class="cbar">${confGroups.map((g) => `<i class="cf-${g.c}" style="flex:${sumOf(g.list)}"></i>`).join("")}</div>
  <div class="rls">${confGroups.map((g) => `<span class="rl"><i class="dot cf-${g.c}"></i>${t.confLine(t.conf[g.c].toLowerCase())} <b>${fmt(sumOf(g.list))} ${t.hours}</b> · ${g.list.filter((i) => i.total).length} ${t.items}</span>`).join("")}</div>
  <div class="range"><div><span>${t.wbsEst}</span><b>${fmt(TOTAL)}</b></div><div class="arrow">→</div><div><span>${t.withPad}</span><b>${fmt(TOTAL + pad)}</b><small>+${fmt(pad)} ${t.hours} · +${pct(pad, TOTAL)}%</small></div></div>
  ${confGroups[2].list.length ? `<h4 class="mt">${t.lowList}</h4><div class="tbl"><table><thead><tr><th>ID</th><th>${t.items}</th><th class="num">${t.hours}</th><th>${t.why}</th></tr></thead><tbody>${confGroups[2].list.map((i) => `<tr><td class="id">${esc(i.id)}</td><td>${esc(i.name)}</td><td class="num">${fmt(i.total)}</td><td>${spec.confidence?.[i.id] ? esc(i.confWhy) : `${t.wrote} ${esc(i.confWhy)}`}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>
  <div class="two"><div class="card"><h4>${t.overH}</h4><div class="tbl"><table><tbody>${t.overRows.map(([l, a, b]) => `<tr><td>${l}</td><td class="num">${a * 100}–${b * 100}%</td><td class="num">${fmt(TOTAL * a)}–${fmt(TOTAL * b)}</td></tr>`).join("")}<tr class="sumrow"><td>${t.overSum}</td><td></td><td class="num"><b>${fmt(TOTAL + overLo)}–${fmt(TOTAL + overHi + pad)}</b></td></tr></tbody></table></div><p class="fine">${t.overNote}</p></div>
  <div class="card"><h4>${t.mustH}</h4><div class="cbar"><i class="cf-high" style="flex:${must}"></i><i class="cf-mid" style="flex:${TOTAL - must}"></i></div><p class="fine">${esc(t.mustNote(pct(must, TOTAL), rest.slice(0, 8).map((i) => `${i.id} (${fmt(i.total)}h)`).join(", ")))}</p></div></div>`)}
${sec("load", t.loadH, t.loadSub, `<div class="card"><div class="tbl"><table class="heat"><thead><tr><th></th>${model.phases.map((p) => `<th class="num">${ptag(p.n)}</th>`).join("")}<th class="num">${t.total}</th></tr></thead><tbody>${roles.map((r) => `<tr><th>${esc(r.label)}</th>${model.phases.map((p) => `<td class="num" style="--a:${p.hours[r.key] / maxCell}">${p.hours[r.key] ? fmt(p.hours[r.key]) : '<span class="z">·</span>'}</td>`).join("")}<td class="num tot">${fmt(model.roleTotals[r.key])}</td></tr>`).join("")}</tbody></table></div></div>`)}
${sec("dsm", t.dsmH, t.dsmSub, `<div class="card">${dsm}</div>`)}
${chain ? sec("chain", t.chainH, t.chainSub, chain) : ""}`;

  const nav: [string, [string, string][]][] = [
    [t.navOverview, [["overview", t.navSummary], ["map", t.navMap], ...(journey ? [["journey", t.navJourney] as [string, string]] : []), ["schedule", t.navSched]]],
    [t.navPhases, [...model.phases.map((p) => [`phase-${p.n}`, `${t.phase} ${p.n} · ${p.title}`] as [string, string]), ...(model.future.length ? [["future", t.navFuture] as [string, string]] : [])]],
    [t.navCross, [
      ...(spec.inputs?.length ? [["inputs", t.navInputs] as [string, string]] : []), ...(spec.assumptionsSheet?.rows?.length ? [["assumptions", t.navAssume] as [string, string]] : []),
      ...(spec.trace?.rows?.length ? [["trace", t.navTrace] as [string, string]] : []), ...(spec.findings?.length ? [["findings", t.navFindings] as [string, string]] : []),
      ...(spec.questions?.length ? [["questions", t.navQuestions] as [string, string]] : [])]],
    [t.navQuality, [["quality", t.navChecks], ["confidence", t.navConf], ["load", t.navLoad], ["dsm", t.navDsm], ...(chain ? [["chain", t.navChain] as [string, string]] : [])]],
  ];
  const rail = nav.filter(([, l]) => l.length).map(([g, list]) => `<div class="rail-group">${esc(g)}</div>${list.map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join("")}`).join("");
  const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");
  const fill: Record<string, string> = {
    "{{LANG}}": lang, "{{TITLE}}": esc(spec.meta.title), "{{MARK}}": esc(spec.meta.mark || (lang === "en" ? "Delivery map" : "Bản đồ triển khai")),
    "{{RAIL_SUB}}": esc(`${fmt(TOTAL)} ${t.hours} · ${model.phases.length} ${t.phase.toLowerCase()} · ${model.modules.length} module`), "{{CONTENTS}}": t.contents,
    "{{NAV}}": rail, "{{FOOTER}}": esc(footer), "{{EDGES}}": json(edges), "{{SCHED}}": json(SCHED),
  };
  let html = template;
  for (const [k, v] of Object.entries(fill)) html = html.split(k).join(v);
  return html.split("{{BODY}}").join(body);   // last: the body may contain anything
}
