"use strict";

// ============== 工具 ==============
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 轻量语法着色:不追求完整 parser,够 408 题面看(JS/C/Python/Go/Java/类 C 系)
// 顺序很关键: 先抽字符串/注释(吞掉里头的关键字), 再做关键字/数字/函数名 —
// 所有替换都先打占位符 \x01X...\x02,等 escape 之后再统一换回 <span>。
// 这样后续 regex 不会把"刚加的 <span class=...>" 里的 class 等当 keyword 误命中。
function highlightCode(code, lang) {
  if (!code) return "";
  let s = code.replace(/\r\n?/g, "\n");
  // 1) 行注释 // ...
  s = s.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + "\x01C" + m.slice(p.length + 2) + "\x02");
  // 2) 块注释 /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, m => "\x01C" + m.slice(2, -2) + "\x02");
  // 3) 字符串(双/单/反引号)
  s = s.replace(/`(?:\\.|[^`\\])*`/g, m => "\x01S" + m + "\x02");
  s = s.replace(/"(?:\\.|[^"\\])*"/g, m => "\x01S" + m + "\x02");
  s = s.replace(/'(?:\\.|[^'\\])*'/g, m => "\x01S" + m + "\x02");
  // 4) Python 注释 # ...
  if (/^(py|python)$/i.test(lang || "")) {
    s = s.replace(/(^|[^\\])#[^\n]*/g, (m, p) => p + "\x01C" + m.slice(p.length + 1) + "\x02");
  }
  // 5) 数字 / 布尔 / 关键字 / 函数名 — 全部先打占位符,避免后插 <span> 里的 class 被关键字再中招
  s = s.replace(/\b(\d[\d_]*(?:\.[\d_]+)?|0x[0-9a-fA-F]+)\b/g, "\x01N$1\x02");
  s = s.replace(/\b(true|false|null|nil|None|True|False)\b/g, "\x01B$1\x02");
  const kws = "auto|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extern|finally|"
    + "for|from|function|goto|if|import|in|inline|instanceof|interface|let|namespace|new|operator|package|"
    + "private|protected|public|register|return|sizeof|static|struct|switch|template|this|throw|try|typedef|"
    + "typeof|union|using|virtual|void|volatile|while|async|await|yield|var|with|extend|fn|impl|match|"
    + "as|def|elif|except|global|lambda|nonlocal|pass|raise";
  s = s.replace(new RegExp("\\b(" + kws + ")\\b", "g"), "\x01K$1\x02");
  // 9) 函数调用 名( — 排除关键字
  s = s.replace(/\b([A-Z][A-Za-z0-9_]*)\s*\(/g, "\x01T$1\x02(");
  s = s.replace(/\b([a-z_][A-Za-z0-9_]*)\s*(?=\()/g, m => {
    const name = m.replace(/\s*\($/, "");
    if (new RegExp("\\b(" + kws + ")\\b").test(name)) return m;
    return "\x01F" + name + "\x02";
  });
  // 6) escape 剩余代码(占位符 \x01X 不含 <>&,不会被破坏)
  s = escHtml(s);
  // 7) 统一换回 <span> 标签
  s = s.replace(/\x01C([\s\S]*?)\x02/g, '<span class="tok-com">$1</span>');
  s = s.replace(/\x01S([\s\S]*?)\x02/g, '<span class="tok-str">$1</span>');
  s = s.replace(/\x01N([\s\S]*?)\x02/g, '<span class="tok-num">$1</span>');
  s = s.replace(/\x01B([\s\S]*?)\x02/g, '<span class="tok-bool">$1</span>');
  s = s.replace(/\x01K([\s\S]*?)\x02/g, '<span class="tok-kw">$1</span>');
  s = s.replace(/\x01T([\s\S]*?)\x02/g, '<span class="tok-type">$1</span>');
  s = s.replace(/\x01F([\s\S]*?)\x02/g, '<span class="tok-fn">$1</span>');
  return s;
}

// 智能 C 风格格式化: 只修正数据里被压成一行的代码块。
// 目标是“题面材料可读”,不是把代码重排成另一种风格:
//   - 函数签名 / if / else 与开大括号保持 K&R 同行
//   - 顶层分号后换行,但不拆 for(i=0;i<n;i++) 的分号
//   - 保留 if (...) return ...; else return ...; 这类短句结构
// 占位符机制先抽字符串,避免字符串内的 = ; , {} 等被误改。
function formatCode(code, lang) {
  if (!code || code.indexOf("\n") >= 0) return code;  // 已多行不处理

  let s = code
    .replace(/"(?:\\.|[^"\\])*"/g, m => "\x01S" + m + "\x02")
    .replace(/'(?:\\.|[^'\\])*'/g, m => "\x01S" + m + "\x02")
    .replace(/`(?:\\.|[^`\\])*`/g, m => "\x01S" + m + "\x02");

  s = s
    .replace(/\b(if|for|while|switch)\s*\(/g, "$1 (")
    .replace(/\belse\s*\{/g, "else {")
    .replace(/\s*(<=|>=|==|!=|&&|\|\|)\s*/g, " $1 ")
    .replace(/([A-Za-z0-9_\]\)])\s*([<>])\s*([A-Za-z0-9_\[\(])/g, "$1 $2 $3")
    .replace(/([A-Za-z0-9_\]\)])\s*([+\-*/%])\s*([A-Za-z0-9_\[\(])/g, "$1 $2 $3")
    .replace(/([A-Za-z0-9_\]\)])\s*=\s*([A-Za-z0-9_\[\(])/g, "$1 = $2")
    .replace(/;\s*/g, "; ")
    .replace(/,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\)\s+(?=(?:for|if|while)\s*\()/g, ")\n")
    .trim();

  // 拆成语义行。只在括号深度为 0 时把分号视作语句结束。
  let out = "";
  let parenDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") parenDepth++;
    else if (c === ")" || c === "]") parenDepth = Math.max(0, parenDepth - 1);

    if (c === "{") {
      out = out.replace(/[ \t]+$/g, "");
      out += " {\n";
      while (s[i + 1] === " ") i++;
      continue;
    }

    if (c === "}") {
      out = out.replace(/[ \t]+$/g, "");
      if (out && !out.endsWith("\n")) out += "\n";
      out += "}";
      while (s[i + 1] === " ") i++;

      const rest = s.slice(i + 1);
      const elseMatch = /^else\b/.exec(rest);
      if (elseMatch) {
        out += " else";
        i += elseMatch[0].length;
        while (s[i + 1] === " ") i++;
        if (s[i + 1] === "{") {
          out += " {\n";
          i++;
          while (s[i + 1] === " ") i++;
        } else {
          out += " ";
        }
      } else {
        out += "\n";
      }
      continue;
    }

    if (c === ";" && parenDepth === 0) {
      out += ";\n";
      while (s[i + 1] === " ") i++;
      continue;
    }

    out += c;
  }

  out = out.replace(/\x01S([\s\S]*?)\x02/g, '$1');

  const lines = out.split("\n");
  let braceDepth = 0;
  const formatted = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const lineDepth = t.startsWith("}") ? Math.max(0, braceDepth - 1) : braceDepth;
    formatted.push("  ".repeat(lineDepth) + t);

    const opens = (t.match(/\{/g) || []).length;
    const closes = (t.match(/\}/g) || []).length;
    braceDepth = Math.max(0, braceDepth + opens - closes);
  }

  return formatted.join("\n");
}

// 轻量 Markdown 渲染: 块级结构在 escape 前检测(否则 '>' '#' 会被吃掉),
// 内容在 inlineMd 内 escape,XSS 安全。
function renderMarkdown(md) {
  if (!md) return "";
  md = unwrapMarkdownFence(String(md));
  // 0) KaTeX: 同时认四种语法 — $$...$$ / $...$ (Markdown) 和 \[...\] / \(...\) (LaTeX 原生)
  const katexOut = [];
  let s = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    katexOut.push(katexRender(tex, true));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, (_, tex) => {
    katexOut.push(katexRender(tex, false));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
    katexOut.push(katexRender(tex, true));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/\\\((.+?)\\\)/g, (_, tex) => {
    katexOut.push(katexRender(tex, false));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  // 1) 围栏代码块先摘出占位,raw 内容稍后在 inlineMd 之外直接 escape
  const codeBlocks = [];
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang, code });
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });
  // 单行代码块: ```lang code...```(同在一行)
  s = s.replace(/```([a-zA-Z0-9_-]*)[ \t]+([^\n`]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang, code });
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });
  // 2) 按行扫描块级结构(在原始文本上做)
  const lines = s.split("\n");
  const out = [];
  let i = 0;
  const isTableRow = (v) => /^\s*\|.+\|\s*$/.test(v || "");
  const isTableSep = (v) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(v || "");
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    // 占位行(围栏代码块)直接当块输出,避免被包进 <p>
    let ph = /^\x00CB(\d+)\x00$/.exec(line);
    if (ph) {
      const cb = codeBlocks[+ph[1]];
      const langAttr = cb.lang ? ` data-lang="${cb.lang}"` : "";
      out.push(`<pre${langAttr}><code>${highlightCode(cb.code, cb.lang)}</code></pre>`);
      i++; continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inlineMd(m[2])}</h${lvl}>`); i++; continue;
    }
    if ((m = /^\[!(note|tip|info|warning|danger|question)\]\s*(.*)$/i.exec(line.trim()))) {
      const kind = m[1].toLowerCase();
      const labelMap = { note: "Note", tip: "Tip", info: "Info", warning: "Warning", danger: "Danger", question: "Question" };
      const body = [];
      if (m[2]) body.push(m[2]);
      i++;
      while (i < lines.length && lines[i].trim() !== "" &&
             !/^(#{1,6}\s|\[!(note|tip|info|warning|danger|question)\]|>\s|[-*]\s|\d+\.\s)/i.test(lines[i]) &&
             !(isTableRow(lines[i]) && isTableSep(lines[i + 1])) &&
             !/^-{3,}$/.test(lines[i].trim())) {
        body.push(lines[i]); i++;
      }
      out.push('<aside class="md-callout md-callout-' + kind + '"><div class="md-callout-title">' + escHtml(labelMap[kind] || kind) + '</div><div class="md-callout-body">' + inlineMd(body.join(" ")) + '</div></aside>');
      continue;
    }
    if (isTableRow(lines[i]) && isTableSep(lines[i + 1])) {
      const header = splitTableRow(lines[i]);
      i += 2; // 跳过表头和分隔线
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const colCount = Math.max(header.length, ...rows.map(r => r.length), 1);
      const headHtml = normalizeTableRow(header, colCount).map(cell => "<th>" + inlineMd(cell) + "</th>").join("");
      const bodyHtml = rows.map(row => {
        const cells = normalizeTableRow(row, colCount).map(cell => "<td>" + inlineMd(cell) + "</td>").join("");
        return "<tr>" + cells + "</tr>";
      }).join("");
      out.push('<div class="ai-table-wrap"><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>');
      continue;
    }
    if (/^>\s+/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s+/, "")); i++;
      }
      out.push(`<blockquote>${inlineMd(q.join(" "))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, "")); i++;
      }
      out.push("<ul>" + items.map(it => `<li>${inlineMd(it)}</li>`).join("") + "</ul>");
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, "")); i++;
      }
      out.push("<ol>" + items.map(it => `<li>${inlineMd(it)}</li>`).join("") + "</ol>");
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) { out.push("<hr>"); i++; continue; }
    // 段落: 连续非空、非块起始行合并
    const p = [];
    while (i < lines.length && lines[i].trim() !== "" &&
           !/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/.test(lines[i]) &&
           !(isTableRow(lines[i]) && isTableSep(lines[i + 1])) &&
           !/^-{3,}$/.test(lines[i].trim())) {
      p.push(lines[i]); i++;
    }
    out.push(`<p>${inlineMd(p.join(" "))}</p>`);
  }
  // 3) 占位换回 <pre><code>(code 内容单独 escape,保留缩进/换行)
  let html = out.join("");
  html = html.replace(/\x00CB(\d+)\x00/g, (_, idx) => {
    const cb = codeBlocks[+idx];
    const langAttr = cb.lang ? ` data-lang="${cb.lang}"` : "";
    const withFmt = formatCode(cb.code, cb.lang);
    return `<pre${langAttr}><code>${highlightCode(withFmt, cb.lang)}</code></pre>`;
  });
  // 4) KaTeX 占位换回(直接拼产物,已含 escape 后的安全 HTML)
  html = html.replace(/\x00KTX(\d+)\x00/g, (_, idx) => katexOut[+idx]);
  return html;

  function inlineMd(s) {
    // 先 escape 全部,再做行内变换(inline code 的内容也会被 escape,安全)
    s = escHtml(s);
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|\s)_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
        // 链接只接受 http(s):// 和相对路径,其余返回原文
        if (/^(https?:\/\/|\/)/.test(u)) return `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
        return `${t}${u ? "" : ""}`;  // 安全回退:丢掉括号和 URL,只留文本
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
        // 兜底:含括号但 URL 头部不合法的链接,只输出可见文本
        if (!/^(https?:\/\/|\/)/.test(u)) return t;
        return `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
      });
  }

  function splitTableRow(row) {
    return String(row || "")
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(cell => cell.trim());
  }

function normalizeTableRow(row, count) {
    const cells = row.slice(0, count);
    while (cells.length < count) cells.push("");
    return cells;
  }
}

function unwrapMarkdownFence(md) {
  const text = String(md || "").trim();
  const m = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  return m ? m[1].trim() : md;
}

// 把含 LaTeX($...$ / $$...$$)、Markdown 围栏代码块(```lang ... ```)、
// 图片引用(![..](images/X.jpg))、预渲染 HTML 表格(<table>)
// 和白名单内联标签的题面/解析文本转为安全 HTML。
//
// 关键: KaTeX 和代码块的高亮器内部都会对文本做 HTML escape(把 > 变 &gt;),
// 如果先 escHtml 再喂给它们,会发生双重 escape(& > &amp;gt; 浏览器解出 &gt; 字面量)。
// 修法是所有"会自己 escape 的渲染器"都先于 escHtml 跑,产物用占位符保护。
//
// 渲染顺序: 提图片占位 → 提块级占位 → 提白名单内联占位 → 提围栏代码块占位
//         → KaTeX 渲染(原文输入,产物存占位)
//         → escape 剩余内容
//         → 还占位: 块级(递归) → 内联 → 围栏代码块 → KaTeX → 图片
const BLOCK_TAGS = /<table[\s\S]*?<\/table>/gi;
const SAFE_INLINE = /<\/?(?:tr|td|th|tbody|thead|tfoot|caption|br|p|b|i|u|strong|em|sub|sup)\b[^>]*>/gi;
// 围栏代码块: 同时认多行 (```lang\ncode\n```) 和单行 (```lang code```) 两种格式
const FENCE_RE = /```([a-zA-Z0-9_+-]*)[ \t]*\n([\s\S]*?)\n[ \t]*```/g;
const FENCE_SINGLELINE = /```([a-zA-Z0-9_+-]*)[ \t]+([^\n`]*?)```/g;
// 普通文本/伪代码标签:这些"语言"不亮词法,只走 escHtml
const PLAIN_LANGS = /^(txt|text|plain|none|console|output|伪代码|无)$/i;
function formatContent(s) {
  if (s == null) return "";
  s = String(s);
  // 0. 静默剥除 <details>...</details>: 题源里的图注、mermaid 源码、
  //    text_image 辅助块都不作为题卡内容展示。
  s = s.replace(/<details\b[\s\S]*?<\/details>/gi, "");
  // 1. 图片引用 → 占位符
  const imgs = [];
  s = s.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, src) => {
    imgs.push(src);
    return `\x00IMG${imgs.length - 1}\x00`;
  });
  // 2. 块级 HTML → 占位符
  const blocks = [];
  s = s.replace(BLOCK_TAGS, (m) => {
    blocks.push(m);
    return `\x00BLK${blocks.length - 1}\x00`;
  });
  // 3. 白名单内联标签 → 占位符
  const inlines = [];
  s = s.replace(SAFE_INLINE, (m) => {
    inlines.push(m);
    return `\x00TAG${inlines.length - 1}\x00`;
  });
  // 4. 围栏代码块 → 占位符(在 escape 之前)
  const fences = [];
  s = s.replace(FENCE_RE, (_, lang, code) => {
    fences.push({ lang: lang || "", code: code.replace(/\n$/, "") });
    return `\x00FENCE${fences.length - 1}\x00`;
  });
  s = s.replace(FENCE_SINGLELINE, (_, lang, code) => {
    fences.push({ lang: lang || "", code: code.replace(/\n$/, "") });
    return `\x00FENCE${fences.length - 1}\x00`;
  });
  // 5. KaTeX: 同时认 $$...$$ / $...$ (Markdown) 和 \[...\] / \(...\) (LaTeX 原生)
  //    原文输入给 katexRender,产物是已经 escape 过的安全 HTML,不会
  //    跟外层再 escape 冲突(占位符是 \x00XXX,不含 HTML 特殊字符)。
  const katexOut = [];
  s = s.replace(/\$\$([^$]+?)\$\$/g, (_, tex) => {
    katexOut.push(katexRender(tex, true));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    katexOut.push(katexRender(tex, false));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
    katexOut.push(katexRender(tex, true));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  s = s.replace(/\\\((.+?)\\\)/g, (_, tex) => {
    katexOut.push(katexRender(tex, false));
    return `\x00KTX${katexOut.length - 1}\x00`;
  });
  // 6. escape 剩余内容(占位符 \x00XXX 不含 <>&, 不会被破坏)
  s = escHtml(s);
  // 7. 块级占位符换回: 剥外层标签,对内部递归(防止 <table> 被再次提取造成死循环)
  s = s.replace(/\x00BLK(\d+)\x00/g, (_, i) => {
    const raw = blocks[+i];
    const m = raw.match(/^<(table|details)\b[^>]*>/i);
    if (!m) return raw;
    const tag = m[1].toLowerCase();
    const openLen = m[0].length;
    const closeIdx = raw.toLowerCase().lastIndexOf(`</${tag}>`);
    if (closeIdx < 0) return raw;
    return raw.slice(0, openLen)
         + formatContent(raw.slice(openLen, closeIdx))
         + raw.slice(closeIdx);
  });
  // 8. 白名单内联占位符换回
  s = s.replace(/\x00TAG(\d+)\x00/g, (_, i) => inlines[+i]);
  // 9. 围栏代码块占位换回:txt/text/plain 等伪代码标签不走词法高亮,只走 escHtml
  s = s.replace(/\x00FENCE(\d+)\x00/g, (_, i) => {
    const f = fences[+i];
    const langAttr = f.lang ? ` data-lang="${escHtml(f.lang)}"` : "";
    // 顺序很重要: 先 formatCode 在原始代码里插 <wbr> 软换行点,
    // 再 highlightCode 词法高亮(此时 <span> 完整,<wbr> 已经在源码里,不进 tag 属性)
    const withWbr = formatCode(f.code, f.lang);
    const inner = PLAIN_LANGS.test(f.lang) ? escHtml(withWbr) : highlightCode(withWbr, f.lang);
    return `<pre class="q-code"${langAttr}><code>${inner}</code></pre>`;
  });
  // 10. KaTeX 占位换回(直接拼产物,已含 escape 后的安全 HTML)
  s = s.replace(/\x00KTX(\d+)\x00/g, (_, i) => katexOut[+i]);
  // 11. 图片占位符换回 <img>(src 不存在时由 onerror 隐藏,避免破图)
  s = s.replace(/\x00IMG(\d+)\x00/g, (_, i) => {
    const src = imgs[+i];
    return `<img class="q-img" src="${escHtml(src)}" alt="题图" loading="lazy" onclick="zoomImg(this.src)" onerror="this.outerHTML='<span class=q-img-missing>⚠ 题图缺失: '+this.alt+'</span>'">`;
  });
  return s;
}

function katexRender(tex, displayMode) {
  // KaTeX 加载失败或语法错时回退原文,不阻塞刷题
  if (typeof katex === "undefined" || !katex.renderToString) {
    return displayMode ? `$$${tex}$$` : `$${tex}$`;
  }
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch (e) {
    return displayMode ? `$$${tex}$$` : `$${tex}$`;
  }
}

// 题图点击放大
function zoomImg(src) {
  const overlay = document.createElement("div");
  overlay.className = "q-img-zoom";
  overlay.innerHTML = `<img src="${escHtml(src)}" alt="题图放大">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============== 数据处理 ==============
