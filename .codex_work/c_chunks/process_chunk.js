const fs = require("fs");

const FENCE_RE = /```([a-zA-Z0-9_+-]*)[ \t]*(?:\n([\s\S]*?)\n[ \t]*```|([^\n`]*?)```)/g;
const C_LIKE_LANG = /^(c|cpp|c\+\+|cc|h|hpp|c语言|C语言)$/i;
const C_LIKE_SNIPPET = /(#include|\bint\s+main\s*\(|\b(?:int|void|char|float|double|short|long|unsigned|signed)\s+[A-Za-z_]\w*|\bfor\s*\([^\n]*;[^\n]*;|\bwhile\s*\(|\bdo\s*\{|\bprintf\s*\(|\bscanf\s*\(|\bstruct\b|\btypedef\b|\breturn\b)/;

function protectStrings(s) {
  const strings = [];
  const out = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, (m) => {
    const key = `\x01S${strings.length}\x02`;
    strings.push(m);
    return key;
  });
  return { out, strings };
}

function restoreStrings(s, strings) {
  return s.replace(/\x01S(\d+)\x02/g, (_, i) => strings[+i]);
}

function normalizeSpaces(s) {
  s = s.replace(/\s*([{}();,])\s*/g, "$1");
  s = s.replace(/\s*(==|!=|<=|>=|\+\+|--|&&|\|\|)\s*/g, " $1 ");
  s = s.replace(/\s*([=+\-*/%<>])\s*/g, " $1 ");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/\s*;\s*/g, "; ");
  s = s.replace(/\b(if|for|while|switch)\s*\(/g, "$1 (");
  s = s.replace(/\b(else)\s+/g, "$1 ");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s+([),;{}])/g, "$1");
  s = s.replace(/([({])\s+/g, "$1");
  return s.trim();
}

function splitStatements(s) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    out += c;
    if (c === ";" && depth === 0) out += "\n";
    if (c === "{" || c === "}") out += "\n";
  }
  return out;
}

function breakControlBodies(s) {
  return s
    .replace(/\)\s+(?=(?:if|for|while|printf|scanf|return|[A-Za-z_]\w*\s*(?:=|\+\+|--|\()))/g, ")\n")
    .replace(/\belse\s+(?=(?:if|for|while|printf|scanf|return|[A-Za-z_]\w*\s*(?:=|\+\+|--|\()))/g, "else\n")
    .replace(/\}\s*else\b/g, "}\nelse");
}

function indentCode(s) {
  const lines = s.split("\n").map((line) => line.trim()).filter(Boolean);
  const out = [];
  let depth = 0;
  for (const line of lines) {
    const startsClosing = line.startsWith("}") || line === "else" || line.startsWith("else ");
    const lineDepth = startsClosing ? Math.max(0, depth - 1) : depth;
    out.push(`${"  ".repeat(lineDepth)}${line}`);
    for (const c of line) {
      if (c === "{") depth++;
      if (c === "}") depth = Math.max(0, depth - 1);
    }
  }
  return out.join("\n");
}

function formatCCode(code) {
  if (!code || code.includes("\n")) return code.replace(/\r\n?/g, "\n");
  const protectedCode = protectStrings(code.replace(/\r\n?/g, "\n"));
  let s = normalizeSpaces(protectedCode.out);
  s = s.replace(/\)\s*\{/g, ") {").replace(/\belse\s*\{/g, "else {");
  s = splitStatements(s);
  s = breakControlBodies(s);
  s = restoreStrings(s, protectedCode.strings);
  return indentCode(s);
}

function isCLike(lang, code) {
  return C_LIKE_LANG.test(lang || "") || C_LIKE_SNIPPET.test(code);
}

function formatText(text, stats) {
  if (typeof text !== "string" || !text.includes("```")) return text;
  return text.replace(FENCE_RE, (match, lang, multi, single) => {
    const code = multi ?? single ?? "";
    stats.fences += 1;
    if (!isCLike(lang, code)) return match;
    stats.cLike += 1;
    if (code.includes("\n")) return match;
    stats.singleLine += 1;
    const formatted = formatCCode(code);
    if (formatted === code) return match;
    stats.changed += 1;
    return `\`\`\`${lang || "c"}\n${formatted}\n\`\`\``;
  });
}

function processQuestion(q, stats) {
  for (const key of ["question", "explanation"]) {
    q[key] = formatText(q[key], stats);
  }
  if (q.options && typeof q.options === "object") {
    for (const key of Object.keys(q.options)) {
      q.options[key] = formatText(q.options[key], stats);
    }
  }
}

const input = process.argv[2];
const output = process.argv[3] || input.replace(/\.json$/, ".formatted.json");
if (!input) {
  console.error("usage: node process_chunk.js <input.json> [output.json]");
  process.exit(2);
}

const chunk = JSON.parse(fs.readFileSync(input, "utf8"));
const stats = { book: chunk.book, questions: chunk.questions.length, fences: 0, cLike: 0, singleLine: 0, changed: 0 };
for (const q of chunk.questions) processQuestion(q, stats);
fs.writeFileSync(output, JSON.stringify(chunk, null, 2));
console.log(JSON.stringify(stats, null, 2));
