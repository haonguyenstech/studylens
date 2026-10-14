// Deep Brief checks (no Electron): node scripts/test-brief.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { checkBrief, briefNav, assembleBrief } = require("../dist/main/brief.js");

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };
const head = `<header class="masthead"><h1>T</h1></header><section class="part" data-short="Base"><div class="part-bar"><span class="pn">PHẦN I</span><h2>Nền tảng dài</h2></div></section>`;
const blk = (n, body = "", extra = "") => `<article class="blk" id="s${n}"${extra}><h3>${n}. Mục số ${n}</h3><p>x</p>${body}</article>`;
const good = head + blk(1) + blk(2, "", ' data-short="Ngắn"') + blk(3, '<a href="#s1">1</a>');
const errs = async (body) => (await checkBrief({ meta: { title: "T" }, body })).errors;

check((await errs(good)).length === 0, "a valid brief passes");
check((await errs(good + "<script>x</script>")).some((e) => /script/.test(e)), "<script> refused");
check((await errs(good.replace('<header class="masthead"><h1>T</h1></header>', ""))).some((e) => /masthead/.test(e)), "missing masthead reported");
check((await errs(head + blk(1) + blk(2))).some((e) => /3/.test(e)), "fewer than 3 sections reported");
check((await errs(good + blk(3))).some((e) => /s3/.test(e)), "duplicate section id reported");
check((await errs(good.replace('href="#s1"', 'href="#s9"'))).some((e) => /s9/.test(e)), "dead internal link reported");
check((await errs(good + blk(4, "<table><tr><td>1</td></tr></table>"))).some((e) => /tbl/.test(e)), "table without div.tbl reported");
check((await errs(good + blk(4, "<div><p>x</div>"))).length > 0, "unbalanced tags reported");
// diagrams: with a drawer, failures go back with where they are; success replaces the source with the SVG
const withDiagram = good + blk(4, '<div class="frame"><pre class="mermaid">flowchart LR\n  A --&gt; B</pre></div>');
const ok = await checkBrief({ meta: { title: "T" }, body: withDiagram }, async (codes) => codes.map((c) => ({ svg: `<svg data-src="${c.includes("-->") ? "unescaped" : "raw"}"></svg>` })));
check(ok.errors.length === 0 && ok.diagrams === 1 && ok.body.includes('<svg data-src="unescaped">') && !ok.body.includes("<pre"), "diagram source unescaped, drawn SVG put in place");
const bad = await checkBrief({ meta: { title: "T" }, body: withDiagram }, async () => [{ error: "Parse error on line 2" }]);
check(bad.errors.some((e) => /#1/.test(e) && /s4/.test(e) && /Parse error/.test(e)), "diagram error names the diagram and its section");
// navigation
const nav = briefNav(good);
check(nav.includes("PHẦN I · Base") && nav.includes('href="#s2"><span class="n">2</span><span>Ngắn</span>') && nav.includes("<span>Mục số 1</span>"), "navigation: parts, numbers, short labels");
const html = assembleBrief("<html lang=\"{{LANG}}\"><title>{{TITLE}}</title>{{NAV}}{{BODY}}<footer>{{FOOTER}}</footer>", { meta: { title: "A & B" }, body: good + "{{TITLE}}" }, good + "{{TITLE}}", "F", "en");
check(html.includes("<title>A &amp; B</title>") && html.includes('lang="en"') && html.includes("</article>{{TITLE}}") && html.endsWith("<footer>F</footer>"), "assemble fills the template; body text is not treated as a placeholder");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
