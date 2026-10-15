// The engine under Node, for tests and dev tools (the app itself has no Node):
// - required as a module: every piece, to test it directly
// - run as `node dist/engine.cjs --serve`: the same calls the app makes, one JSON line per call on
//   stdin ({ id, method, args }) and one per answer on stdout ({ id, ok, value }); the Rust tests use it.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { check, Host, officeText } from "./index";

export * from "./index";
export { readParts, validate, assemble, balance } from "./notebook";
export { readBrief, checkBrief, briefNav, assembleBrief } from "./brief";
export { readWbsSpec, checkWbs, renderWbs, pickWorkbookFile, buildModel } from "./wbs";
export { readWorkbook, workbookText, showNum } from "./xlsx";
export { setLang, t } from "./i18n";
export { sha1Hex, listDir } from "./files";

export const nodeHost: Host = { readBytes: async (p) => new Uint8Array(await readFile(p)) };

if (require.main === module && process.argv.includes("--serve")) {
  const methods: Record<string, (args: any) => Promise<unknown>> = {
    check: (req) => check(req, nodeHost),
    officeText: (req) => officeText(req, nodeHost),
  };
  createInterface({ input: process.stdin }).on("line", async (line) => {
    if (!line.trim()) return;
    const { id, method, args } = JSON.parse(line);
    let reply;
    try { reply = { id, ok: true, value: await methods[method](args) }; }
    catch (e) { reply = { id, ok: false, value: String((e as Error)?.message ?? e) }; }
    process.stdout.write(JSON.stringify(reply) + "\n");
  });
}
