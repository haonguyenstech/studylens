// A small fictional WBS workbook (RoomBook) for tests: node scripts/wbs-fixture.mjs <out.xlsx>
// Visible "Cover" + "WBS" + "Assumptions", and a hidden stale "WBS_old" that must be ignored.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const WBS = [
  // row: [A id, B module, C name, D desc, E notes, F phase, G priority, H BE, I FE, J Mobile]
  [1, ["ID", "Module", "Feature", "Description", "Assumptions", "Phase", "Priority", "Back-end", "Front-end", "Mobile", "Total"]],
  [2, ["PHASE 1 — Foundation", "", "", "", "", "1"]],
  [3, ["1.1", "Platform", "Cloud environment", "Dev / Staging / Prod on Azure.", "Client provides the Azure subscription.", "1", "Must Have", 8, 0, 0]],
  [4, ["1.2", "Platform", "Sign-in with Microsoft Entra ID", "SSO for staff.", "Tenant ID and app registration from client IT — pending.", "1", "Must Have", 10, 6, 0]],
  [5, ["PHASE 2 — Booking", "", "", "", "", "2"]],
  [6, ["2.1", "Booking", "Room search", "Filter by size, floor, equipment.", "", "2", "Must Have", 6, 12, 10]],
  [7, ["2.2", "Booking", "Book a room", "Acceptance: the booking shows in Outlook within 1 minute.", "", "2", "Must Have", 12, 8, 12]],
  [8, ["2.3", "Booking", "Check-in by QR", "Release the room after 10 minutes without check-in.", "", "2", "Should Have", 4, 0, 8]],
  [9, ["2.4", "Sync", "Calendar sync with Microsoft 365", "Two-way sync of room calendars.", "Source of truth for offline bookings is not fully defined.", "2", "Must Have", 24, 0, 0]],
  [10, ["PHASE 3 — Launch", "", "", "", "", "3"]],
  [11, ["3.1", "Launch", "UAT support", "", "", "3", "Must Have", 4, 4, 4]],
  [12, ["3.2", "Launch", "App Store release", "", "", "3", "Must Have", 0, 0, 4]],
  [13, ["", "", "Floor plans", "Interactive floor maps.", "", "Future", "", 0, 0, 0]],
];
const TOTAL_ROW = 14;
const cols = "ABCDEFGHIJK";

function sheetXml(rows, totals) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cell = (ref, v) => (v === "" || v == null ? "" : typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
  let body = "";
  for (const [r, vals] of rows) {
    let cells = vals.map((v, i) => cell(cols[i] + r, v)).join("");
    if (r > 2 && typeof vals[7] === "number") cells += `<c r="K${r}"><f>SUM(H${r}:J${r})</f><v>${vals[7] + vals[8] + vals[9]}</v></c>`;
    body += `<row r="${r}">${cells}</row>`;
  }
  if (totals) body += `<row r="${TOTAL_ROW}">${cell("A" + TOTAL_ROW, "TOTAL")}${["H", "I", "J"].map((c, i) => `<c r="${c}${TOTAL_ROW}"><f>SUM(${c}3:${c}13)</f><v>${totals[i]}</v></c>`).join("")}</row>`;
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export async function makeWbsXlsx(file) {
  const z = new JSZip();
  const sheets = [
    ["Cover", sheetXml([[1, ["RoomBook — Work breakdown structure"]], [2, ["Project:", "RoomBook"]]])],
    ["WBS_old", sheetXml([[1, ["ID", "Module", "Feature"]], [2, ["9.9", "Old", "Stale draft row", "", "", "1", "Must Have", 999, 0, 0]]]), true],
    ["WBS", sheetXml(WBS, [68, 30, 38])],
    ["Assumptions", sheetXml([[1, ["Parameter", "Value"]], [2, ["Cloud", "Azure, West Europe, single region"]], [3, ["Users", "~600 staff, 14 offices"]]])],
  ];
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([n, , hidden], i) => `<sheet name="${n}" sheetId="${i + 1}"${hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  sheets.forEach(([, xml], i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, xml));
  writeFileSync(file, await z.generateAsync({ type: "nodebuffer" }));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) await makeWbsXlsx(process.argv[2]);
