// WBS Map: the workbook reader, the checks on out/wbs.json, and the page (no app window): node scripts/test-wbs.mjs
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeWbsXlsx } from "./wbs-fixture.mjs";

const require = createRequire(import.meta.url);
const { readWorkbook, workbookText, showNum, checkWbs: checkWith, renderWbs, nodeHost, sha1Hex, listDir } = require("../dist/engine.cjs");
const checkWbs = (spec, f) => checkWith(spec, f, nodeHost.readBytes);
const base = path.join(os.tmpdir(), "studylens-test-wbs");
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });
const file = path.join(base, "RoomBook.xlsx");
await makeWbsXlsx(file);
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };
const example = JSON.parse(readFileSync(new URL("../assets/wbs/EXAMPLE.json", import.meta.url), "utf8"));
const spec = (patch) => { const s = structuredClone(example); patch?.(s); return s; };
const errorsOf = async (s) => (await checkWbs(s, file)).errors;

// reader
const wb = await readWorkbook(readFileSync(file));
check(wb.sheets.map((s) => s.name).join() === "Cover,WBS_old,WBS,Assumptions" && wb.sheets[1].hidden, "reader: sheet names in order, hidden one flagged");
const text = workbookText(wb);
check(!text.includes("Stale draft row") && text.includes('ẩn: "WBS_old"'), "reader: hidden sheet only named, not dumped");
check(/R6 \| A: 2\.1 \| B: Booking \| C: Room search \| D: [^|]+\| F: 2 \| G: Must Have \| H: 6 \| I: 12 \| J: 10/.test(text), "reader: an empty cell (E) does not shift the next ones");
check(text.includes("K: 8 {=SUM(H3:J3)}"), "reader: formula kept with its value");
check(showNum(1.1000000000000001) === "1.1" && showNum(8.1199999999999992) === "8.12" && showNum(42) === "42", "reader: numbers shown like Excel");

// the example passes, and the model adds up
const ok = await checkWbs(spec(), file);
check(ok.errors.length === 0, `example spec passes (${ok.errors.join(" | ")})`);
const mdl = ok.model;
check(mdl.total === 136 && mdl.inScope.length === 8 && mdl.future.length === 1, "model: 136 h, 8 items in scope, 1 future");
check(mdl.phases.map((p) => p.total).join() === "24,96,16", "model: phase totals 24 / 96 / 16");
check(mdl.items.find((i) => i.id === "1.2").conf === "low" && mdl.items.find((i) => i.id === "2.2").conf === "mid", "model: confidence from the wording, and the override");

// errors the AI gets back
const has = (errs, re) => errs.some((e) => re.test(e));
check(has(await errorsOf(spec((s) => { s.source.sheet = "WBS_v9"; })), /không có trong workbook/), "error: unknown sheet named, with the real ones");
check(has(await errorsOf(spec((s) => { s.source.lastRow = 8; })), /dòng tổng 14/), "error: totals differ from the TOTAL row");
check((await errorsOf(spec((s) => { s.source.lastRow = 8; s.source.totalMismatchOk = true; s.modules[2].rows = [6, 8]; }))).every((e) => !/dòng tổng/.test(e)), "error: totalMismatchOk silences the totals check");
check(has(await errorsOf(spec((s) => { s.modules[1].rows = [6, 9]; })), /thuộc 2 module/), "error: an item in two modules");
check(has(await errorsOf(spec((s) => { s.modules[3].rows = [11, 11]; })), /3\.2.*thuộc 0 module/), "error: an item in no module");
check(has(await errorsOf(spec((s) => { s.modules[0].unlocks.push("m-nope"); })), /không phải key module/), "error: unlocks an unknown module");
check(has(await errorsOf(spec((s) => { s.journey.push({ id: "9.9", label: "x" }); })), /journey: không có hạng mục mã "9\.9"/), "error: journey step with an unknown id");
check(has(await errorsOf(spec((s) => { s.findings[0].body += '<script>alert(1)</script>'; })), /thẻ <script>/), "error: script in a finding");
check((await errorsOf(spec((s) => { s.findings[1].body = "Render <500ms, p95 < 2s"; }))).length === 0, "rich text: a lone \"<\" is not a tag");
check(has(await errorsOf(spec((s) => { s.meta.lede += '<a href="https://x.y" onclick="x">x</a>'; })), /thuộc tính không được dùng/), "error: outside link / handler in the lede");
check(has(await errorsOf(spec((s) => { s.modules[0].phase = "2"; })), /có phase "1" nhưng nằm trong module m-platform \(phase 2\)/), "error: a module across phases");

// the page
const html = renderWbs(readFileSync(new URL("../assets/wbs/template.html", import.meta.url), "utf8"), mdl, "vi", "Footer test");
check(!html.includes("{{") && html.includes("Footer test") && html.includes('id="sched-box"'), "page: template filled, schedule present");
check(html.includes('data-k="m-sync"') && html.includes('["m-platform","m-booking"]') && html.includes('["x-it","m-platform","ext"]'), "page: dependency map with module and external edges");
check(html.includes('class="dep back"') === false && html.includes("Đồng bộ lịch"), "page: no backward dependency in the example");
check(html.includes('id="f-f1"') && html.includes("<b>2.2</b>"), "page: findings keep their markup");
check(html.includes("Tổng con bằng tổng cha") && html.includes("khớp dòng tổng"), "page: computed checks added");
const en = renderWbs(readFileSync(new URL("../assets/wbs/template.html", import.meta.url), "utf8"), mdl, "en", "F");
check(en.includes("Estimate confidence") && en.includes('lang="en"'), "page: English labels");

// engine helpers that replaced Node APIs
check(sha1Hex("Sổ tay" + 1234) === require("node:crypto").createHash("sha1").update("Sổ tay" + 1234).digest("hex"), "sha1Hex matches Node's sha1 (notebook doc id)");
check(listDir({ "a/2.html": "", "a/10.html": "", "a/b/c.html": "", "x.html": "" }, "a").join() === "10.html,2.html", "listDir: direct children, sorted like readdirSync().sort()");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
