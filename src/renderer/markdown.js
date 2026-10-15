// Markdown → HTML for the AI's answers in Ask AI. Everything is escaped first and only known
// constructs are turned into tags, so nothing the model writes can run in the window (which can
// call the app). Links open in the browser (a[data-ext]); cite: links (a source in the user's documents)
// become chips (button.cite). Covers what chat answers use: headings, paragraphs, bold/italic/strike,
// inline and fenced code (lightly highlighted), lists (nested, tasks), quotes, tables, rules, and
// ```mermaid blocks (left as code in .md-mermaid; the app draws them).
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u) ? u : null);

  function inline(src) {
    const keep = [];
    const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
    let s = src.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code>${esc(code.trim())}</code>`));
    // Sources: [label](<cite:/path/file.html#anchor>), or without the <> (paths can hold spaces and parentheses).
    const cite = (text, target) => hold(`<button type="button" class="cite" data-cite="${esc(target)}"><i></i><span>${inlineText(text)}</span></button>`);
    s = s.replace(/\[([^\]\n]+)\]\(<(cite:[^>\n]+)>\)/g, (_, text, target) => cite(text, target));
    s = s.replace(/\[([^\]\n]+)\]\((cite:[^\n]+?)\)(?=[\s.,;:!?)\]]|$)/g, (_, text, target) => cite(text, target));
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, text, url) => {
      const u = safeUrl(url);
      return u ? hold(`<a href="${esc(u)}" data-ext>${inlineText(text)}</a>`) : m;
    });
    s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => hold(`<a href="${esc(u)}" data-ext>${esc(u)}</a>`));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (_, pre, u) => pre + hold(`<a href="${esc(u)}" data-ext>${esc(u)}</a>`));
    return inlineText(s).replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }
  function inlineText(s) {
    return esc(s)
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
      .replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  }

  const isFence = (l) => /^\s{0,3}(```|~~~)/.test(l);
  const isHr = (l) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
  const isHead = (l) => /^\s{0,3}#{1,6}\s/.test(l);
  const isQuote = (l) => /^\s{0,3}>/.test(l);
  const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l) || (l.includes("|") && !LIST.test(l));
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

  function blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (isFence(l)) {
        const mark = l.trim().slice(0, 3), lang = l.trim().slice(3).trim().split(/\s/)[0] || "";
        const body = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(mark)) body.push(lines[i++]);
        i++;
        const code = body.join("\n");
        const box = `<div class="md-code"><div class="md-code-h"><span>${esc(lang)}</span><button type="button" class="md-copy" data-copy></button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
        out.push(lang.toLowerCase() === "mermaid" ? `<div class="md-mermaid" data-code="${esc(code)}">${box}</div>` : box);
        continue;
      }
      if (isHead(l)) {
        const m = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
        const n = Math.min(6, m[1].length + 1); // # is the chat's biggest heading, shown as h2
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        i++;
        continue;
      }
      if (isHr(l)) { out.push("<hr>"); i++; continue; }
      if (isQuote(l)) {
        const body = [];
        while (i < lines.length && lines[i].trim() && isQuote(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
        out.push(`<blockquote>${blocks(body)}</blockquote>`);
        continue;
      }
      if (isRow(l) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = cells(l), aligns = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : ""));
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
        const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ""}>${inline(c)}</${tag}>`;
        out.push(`<div class="md-table"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if (LIST.test(l)) {
        const body = [], f = LIST.exec(l), ord = /\d/.test(f[2]);
        const other = (x) => { const m = LIST.exec(x); return m && m[1].length <= f[1].length + 1 && /\d/.test(m[2]) !== ord; };
        while (i < lines.length && !other(lines[i]) && (LIST.test(lines[i]) || (lines[i].trim() && /^\s+/.test(lines[i])) || (!lines[i].trim() && i + 1 < lines.length && (LIST.test(lines[i + 1]) || /^\s{2,}\S/.test(lines[i + 1]))))) body.push(lines[i++]);
        out.push(list(body));
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !isFence(lines[i]) && !isHead(lines[i]) && !isHr(lines[i]) && !isQuote(lines[i]) && !LIST.test(lines[i]) && !(isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1]))) para.push(lines[i++].trim());
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("");
  }

  // Items at the first indent; deeper lines belong to the item above (nested lists, continuations).
  function list(lines) {
    const first = LIST.exec(lines.find((l) => LIST.test(l)));
    const base = first[1].length, ordered = /\d/.test(first[2]);
    const items = [];
    for (const l of lines) {
      const m = LIST.exec(l);
      if (m && m[1].length <= base + 1) items.push({ head: m[3], rest: [] });
      else if (items.length) items[items.length - 1].rest.push(l.replace(new RegExp(`^\\s{0,${base + 4}}`), ""));
    }
    const start = ordered ? parseInt(first[2], 10) : 1;
    const li = items.map((it) => {
      let head = it.head, box = "";
      const task = /^\[([ xX])\]\s+(.*)$/.exec(head);
      if (task) { box = `<span class="md-task${task[1] === " " ? "" : " done"}"></span>`; head = task[2]; }
      const rest = it.rest.some((l) => l.trim()) ? blocks(it.rest) : "";
      return `<li${task ? ' class="task"' : ""}>${box}${inline(head)}${rest}</li>`;
    }).join("");
    return ordered ? `<ol${start !== 1 ? ` start="${start}"` : ""}>${li}</ol>` : `<ul>${li}</ul>`;
  }

  // A light highlighter for code blocks: comments, strings, numbers and common keywords.
  const KW = new Set(("None True False abstract and as async await break case catch class const continue def default del delete do elif else enum except export extends false final finally fn for from func function go if impl import in instanceof interface is lambda let loop match mod mut new nil none not null of or package pass private protected pub public raise return self static struct super switch this throw throws trait true try type typeof undefined use var void while with yield " +
    "select insert update from where join left right inner outer on group by order having limit into values create table alter drop index primary key foreign references distinct union all count sum avg min max").split(" "));
  const HASH = /^(py|python|sh|bash|zsh|shell|yaml|yml|ruby|rb|toml|r|perl|dockerfile|makefile|conf|ini)$/i;
  const SQL = /^(sql|mysql|postgres|postgresql|sqlite|plsql)$/i;
  function highlight(code, lang) {
    if (!lang || /^(text|txt|plain|plaintext|mermaid|md|markdown|csv)$/i.test(lang)) return esc(code);
    const comment = SQL.test(lang) ? "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/" : HASH.test(lang) ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|<!--[\\s\\S]*?-->";
    const re = new RegExp(`(${comment})|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d[\\d_.]*(?:e[+-]?\\d+)?\\b)|([A-Za-z_$][\\w$]*)`, "g");
    const sql = SQL.test(lang);
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      last = re.lastIndex;
      const [tok, c, str, num, word] = m;
      if (c) out += `<span class="tk-c">${esc(tok)}</span>`;
      else if (str) out += `<span class="tk-s">${esc(tok)}</span>`;
      else if (num) out += `<span class="tk-n">${esc(tok)}</span>`;
      else if (word && KW.has(sql ? word.toLowerCase() : word)) out += `<span class="tk-k">${esc(tok)}</span>`;
      else out += esc(tok);
    }
    return out + esc(code.slice(last));
  }

  window.renderMarkdown = (text) => blocks(String(text ?? "").replace(/\r\n?/g, "\n").split("\n"));
})();
