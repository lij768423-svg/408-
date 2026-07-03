"use strict";

// ============== Wiki save integration ==============
function wikiQuestionId(q) {
  return String(q && (q.id || `${q.book}-${q.chapter}-${q.question || ""}`) || "");
}

function getWikiUserQuestionEntry(q) {
  const qid = wikiQuestionId(q);
  const store = CURRENT.aiLatestUserQuestions || {};
  const entry = store[qid] || store.__current;
  if (entry && typeof entry === "object") {
    const first = String(entry.first || entry.text || entry.latest || "").trim();
    const latest = String(entry.latest || entry.text || entry.first || "").trim();
    return { first, latest };
  }
  const text = entry ? String(entry).trim() : String(CURRENT.aiLatestUserQuestion || "").trim();
  return { first: text, latest: text };
}

function getLatestWikiUserQuestion(q) {
  return getWikiUserQuestionEntry(q).latest;
}

function getFirstWikiUserQuestion(q) {
  return getWikiUserQuestionEntry(q).first;
}

function hasStrongExamReference(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  const optionRef = /(^|[^A-Za-z0-9])[A-D]([^A-Za-z0-9]|$)|选项\s*[A-D]|[A-D]\s*(项|选项|为什么|为啥|哪里|哪儿|错|对)|不选\s*[A-D]|选\s*[A-D]/i;
  const examRef = /(这|本|该|此)\s*(道)?\s*题|题干|选项|为什么不选|为啥不选|不选|为啥错|为什么错|哪里错|哪儿错|错在哪|正确答案|已选|我选|我的答案|当前选择|作答|答案是|为什么选|为啥选/;
  return optionRef.test(s) || examRef.test(s);
}

function hasConceptReference(text) {
  return /(什么是|是什么|概念|区别|对比|原理|怎么理解|如何理解|总结|汇总|关系|联系|含义|定义)/.test(String(text || ""));
}

function refersToCurrentAnswer(text) {
  return /(当前|已选|选择|选了|我的?答案|作答|错了|对吗|哪里错|哪儿错|错在哪|我.*(选|错|答案|作答)|为什么.*(错|不对))/.test(String(text || ""));
}

function classifyWikiQuestionKind(prompt, aiText, state) {
  if (!String(prompt || "").trim()) return "exam";
  const promptHasConcept = hasConceptReference(prompt || "");
  const strongExam = hasStrongExamReference(prompt || "") || (!promptHasConcept && hasStrongExamReference(aiText || ""));
  if (strongExam) return "exam";
  const hasAnsweredState = !!(state && ((state.selected && state.selected.length) || state.submitted));
  if (hasAnsweredState && refersToCurrentAnswer(prompt || "")) return "exam";
  if (promptHasConcept || hasConceptReference(aiText || "")) return "concept";
  return "exam";
}

function firstMarkdownTitle(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function cleanupWikiTitle(value) {
  let title = plainText(value || "")
    .replace(/^[#\s>：:、，。！？?！-]+/, "")
    .replace(/^(请问|能否|能不能|帮我|请|解释一下|讲一下|总结一下|汇总一下)/, "")
    .replace(/[？?。！!]+$/g, "")
    .trim();
  title = title.replace(/^(什么是|什么叫|何为)/, "").trim();
  title = title.replace(/^(请解释|解释|说明)/, "").trim();
  return title.slice(0, 80);
}

function conceptWikiTitle(prompt, aiText, q) {
  const fromPrompt = cleanupWikiTitle(prompt);
  if (fromPrompt) return fromPrompt;
  const fromAi = cleanupWikiTitle(firstMarkdownTitle(aiText));
  if (fromAi) return fromAi;
  return cleanupWikiTitle(q && (q.section || q.chapter_title || q.book)) || "概念问题";
}

function examWikiTitle(q) {
  return `${q.book || "408"} 第${q.chapter || "?"}章 ${plainText(q.section || q.chapter_title || "错题")}`;
}

function wikiTakeaway(text, fallback) {
  const clean = plainText(text || "").replace(/^(答案|结论)[:：]\s*/, "").trim();
  return (clean || fallback || "").slice(0, 120);
}

function buildWikiSavePayload(q, state) {
  const selected = state.selected && state.selected.length ? state.selected.join("、") : "未作答";
  const result = state.submitted
    ? (state.shown ? "查看答案" : (state.correct ? "正确" : "错误"))
    : "未提交";
  const sourceQuestionId = wikiQuestionId(q);
  const sourceTitle = examWikiTitle(q);
  const firstUserQuestion = getFirstWikiUserQuestion(q);
  const latestUserQuestion = getLatestWikiUserQuestion(q);
  const aiText = (CURRENT.aiOutput || "").trim();
  const questionKind = classifyWikiQuestionKind(firstUserQuestion, aiText, state);
  const options = ["A", "B", "C", "D"]
    .filter(L => q.options && q.options[L])
    .map(L => `${L}. ${plainText(q.options[L] || "")}`)
    .join("\n");
  const questionMarkdown = [
    plainText(q.question),
    options ? "\n## 选项\n" + options : ""
  ].join("\n").trim();
  const explanationParts = [];
  if (q.explanation) explanationParts.push("## 题库解析\n" + plainText(q.explanation));
  if (aiText) explanationParts.push("## AI 讲解\n" + aiText);
  const statusTags = [
    `状态:${result}`,
    `已选:${selected}`,
    `答案:${(q.answer || []).join("、") || "未知"}`
  ].filter(Boolean);
  const base = {
    question_kind: questionKind,
    first_user_question: firstUserQuestion || undefined,
    user_prompt: firstUserQuestion || latestUserQuestion || undefined,
    latest_user_question: latestUserQuestion || firstUserQuestion || undefined,
    source_question_id: sourceQuestionId,
    source_question_title: sourceTitle,
    source_chapter: q.chapter == null ? undefined : String(q.chapter),
    source_section: q.section || q.chapter_title || undefined,
    selected: Array.isArray(state.selected) ? state.selected : [],
    correct: Array.isArray(q.answer) ? q.answer : [],
    status_tags: statusTags,
    attempt_id: `${sourceQuestionId || "q"}-${Date.now()}`,
    source: "408-quiz-dev",
    subject: q.book,
  };
  if (questionKind === "concept") {
    const title = conceptWikiTitle(firstUserQuestion || latestUserQuestion, aiText, q);
    return {
      ...base,
      title,
      topic_tags: [q.section || q.chapter_title || "", "概念问题"].filter(Boolean),
      question_markdown: firstUserQuestion || latestUserQuestion || firstMarkdownTitle(aiText) || plainText(q.section || q.question || "概念问题"),
      assistant_explanation: aiText || "待补充",
      mistakes: [],
      takeaways: [wikiTakeaway(aiText, "概念问题需复习")].filter(Boolean),
      status: result
    };
  }
  return {
    ...base,
    question_id: sourceQuestionId,
    title: sourceTitle,
    topic_tags: [q.section || q.chapter_title || "", result, "题目问题"].filter(Boolean),
    question_markdown: questionMarkdown || plainText(q.question || ""),
    user_answer: `我的答案：${selected}\n正确答案：${(q.answer || []).join("、")}\n结果：${result}`,
    assistant_explanation: explanationParts.join("\n\n") || "待补充",
    mistakes: result === "错误" ? ["本题作答错误，需复盘题干限定条件与选项判断依据"] : [],
    takeaways: [plainText(q.explanation || aiText || "已保存本题复习记录").slice(0, 120)].filter(Boolean),
    status: result
  };
}

function safeHeaderToken(value, prefix = "quiz-408-dev") {
  const raw = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const asciiHint = raw.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${prefix}-${asciiHint || "q"}-${(hash >>> 0).toString(16)}`;
}

async function saveQuestionToWiki(q, state) {
  const payload = buildWikiSavePayload(q, state);
  const rawKey = [
    "quiz-408-dev",
    payload.question_kind,
    payload.question_id || payload.source_question_id,
    payload.status,
    (state.selected || []).join(""),
    payload.user_prompt || "",
    payload.assistant_explanation || ""
  ].join(":");
  const key = safeHeaderToken(rawKey);
  const data = await apiJson("/api/wiki/save-question", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ payload })
  });
  return data;
}

async function copyText(text, okMsg = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast(okMsg);
  }
}


// ============== Wiki read-only search page ==============
let WIKI_SEARCH_TIMER = null;
let WIKI_BROWSE_LOADED = false;
let WIKI_LAST_RESULTS = [];
let WIKI_PREVIEW_REQUEST = 0;
let WIKI_PREVIEW_PATH = "";
let WIKI_PREVIEW_NOTE = null;
let WIKI_FOLLOWUP_STATE = { path: "", question: "", answer: "", busy: false, saving: false, error: "" };
let WIKI_SELECTED_KIND = "concept";
const WIKI_TREE_COLLAPSED = Object.create(null);

function wikiPageActive() {
  return document.body.dataset.route === "wiki" || (window.location.hash || "").startsWith("#/wiki");
}

function setWikiStatus(message, tone = "") {
  const el = $("#wiki-search-status");
  if (!el) return;
  el.textContent = message || "";
  el.dataset.tone = tone;
}

function setWikiResultsMeta(title, kicker, count) {
  const titleEl = $("#wiki-results-title");
  const kickerEl = $("#wiki-results-kicker");
  const countEl = $("#wiki-results-count");
  if (titleEl) titleEl.textContent = title;
  if (kickerEl) kickerEl.textContent = kicker;
  if (countEl) countEl.textContent = String(count || 0);
}

function wikiTypeLabel(type) {
  const labels = {
    question: "题目",
    concept: "概念",
    summary: "总结",
    sources: "来源",
    source: "来源",
    tools: "工具",
  };
  return labels[type] || type || "笔记";
}

function wikiKindFilterLabel(kind) {
  const labels = {
    all: "全部问题",
    concept: "概念问题",
    exam: "题目问题",
  };
  return labels[kind] || labels.all;
}

function isWikiQuestionItem(item) {
  const path = String(item && item.path || "");
  return (item && item.type === "question") || /^wiki\/questions?\//.test(path);
}

function filterWikiQuestionResults(results) {
  return (Array.isArray(results) ? results : []).filter(item => {
    if (!isWikiQuestionItem(item)) return false;
    const kind = String(item && item.question_kind || "");
    return WIKI_SELECTED_KIND === "all" || kind === WIKI_SELECTED_KIND;
  });
}

function wikiItemKindLabel(item) {
  const kind = String(item && item.question_kind || "");
  if (isWikiQuestionItem(item)) {
    if (kind === "concept") return "概念问题";
    if (kind === "exam") return "题目问题";
  }
  return wikiTypeLabel(item && item.type);
}

function syncWikiKindTabs() {
  $$("[data-wiki-kind]").forEach(btn => {
    const active = btn.dataset.wikiKind === WIKI_SELECTED_KIND;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function formatWikiDate(value) {
  if (!value) return "";
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  return date.toISOString().slice(0, 10);
}

const WIKI_SUBJECT_ORDER = ["数据结构", "操作系统", "计算机组成原理", "计算机网络", "数学", "其他"];

function wikiSubjectLabel(item) {
  const raw = String(item && item.subject || "").trim();
  const path = String(item && item.path || "");
  const haystack = raw + " " + path;
  if (/数据结构|data\s*structure|ds\b/i.test(haystack)) return "数据结构";
  if (/操作系统|operating\s*system|os\b/i.test(haystack)) return "操作系统";
  if (/计算机组成原理|组成原理|计算机组成|computer\s*organization|computer\s*architecture|co\b/i.test(haystack)) return "计算机组成原理";
  if (/计算机网络|网络|computer\s*network|cn\b/i.test(haystack)) return "计算机网络";
  if (/数学|math|高数|线代|概率/i.test(haystack)) return "数学";
  return "其他";
}

function wikiItemTitle(item) {
  return item && (item.title || item.path) || "未命名笔记";
}

function groupWikiResultsBySubject(results) {
  const grouped = new Map();
  results.forEach((item, index) => {
    const subject = wikiSubjectLabel(item);
    if (!grouped.has(subject)) grouped.set(subject, []);
    grouped.get(subject).push({ item, index });
  });
  return Array.from(grouped.entries()).sort((a, b) => {
    const ai = WIKI_SUBJECT_ORDER.indexOf(a[0]);
    const bi = WIKI_SUBJECT_ORDER.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a[0].localeCompare(b[0], "zh-Hans-CN");
  });
}

function wikiTreeItemHtml(item, index) {
  const selected = WIKI_PREVIEW_PATH && item && item.path === WIKI_PREVIEW_PATH;
  return '<li class="wiki-tree-leaf">' +
    '<button class="wiki-tree-item' + (selected ? " is-selected" : "") + '" type="button" data-wiki-index="' + index + '"' + (selected ? ' aria-current="page"' : "") + '>' +
      '<span class="wiki-tree-rail" aria-hidden="true"></span>' +
      '<span class="wiki-tree-doc-icon" aria-hidden="true"></span>' +
      '<span class="wiki-tree-title">' + escHtml(wikiItemTitle(item)) + "</span>" +
    "</button>" +
  "</li>";
}

function wikiSubjectTreeHtml(subject, entries) {
  const collapsed = !!WIKI_TREE_COLLAPSED[subject];
  return '<section class="wiki-tree-subject" aria-label="' + escHtml(subject) + '">' +
    '<button class="wiki-tree-subject-row" type="button" data-wiki-subject="' + escHtml(subject) + '" aria-expanded="' + (collapsed ? "false" : "true") + '">' +
      '<span class="wiki-tree-chevron" aria-hidden="true">' + (collapsed ? "›" : "⌄") + "</span>" +
      '<span class="wiki-tree-subject-name">' + escHtml(subject) + "</span>" +
      '<span class="wiki-tree-count">' + entries.length + "</span>" +
    "</button>" +
    (collapsed ? "" : '<ul class="wiki-tree-children">' + entries.map(({ item, index }) => wikiTreeItemHtml(item, index)).join("") + "</ul>") +
  "</section>";
}

function syncWikiTreeSelection() {
  $$(".wiki-tree-item").forEach(el => {
    const index = parseInt(el.dataset.wikiIndex || "-1", 10);
    const item = WIKI_LAST_RESULTS[index];
    const selected = !!(WIKI_PREVIEW_PATH && item && item.path === WIKI_PREVIEW_PATH);
    el.classList.toggle("is-selected", selected);
    if (selected) {
      el.setAttribute("aria-current", "page");
    } else {
      el.removeAttribute("aria-current");
    }
  });
}

function wikiWelcomeHtml(results, query, message) {
  const hasQuery = !!(query || "").trim();
  const filterLabel = wikiKindFilterLabel(WIKI_SELECTED_KIND);
  const grouped = groupWikiResultsBySubject(results || []);
  const subjectSummary = grouped.length
    ? '<div class="wiki-welcome-subjects">' + grouped.map(([subject, entries]) =>
        '<button class="wiki-welcome-subject" type="button" data-wiki-welcome-subject="' + escHtml(subject) + '">' +
          '<span><b>' + escHtml(subject) + '</b><small>' + escHtml(subject === "数据结构" ? "算法 / 结构" : subject === "操作系统" ? "进程 / 内存" : subject === "计算机组成原理" ? "CPU / 存储" : subject === "计算机网络" ? "协议 / 分层" : "补充笔记") + '</small></span>' +
          '<strong>' + entries.length + '</strong>' +
        '</button>'
      ).join("") + "</div>"
    : "";
  const title = hasQuery ? "选择一条搜索结果" : "从左侧目录开始阅读";
  const detail = message || (results && results.length
    ? "目录已按科目整理好。点左侧任意笔记，右侧会打开完整 Markdown 预览。"
    : (hasQuery ? "没有匹配的" + filterLabel + "。换个关键词，或者切换全部 / 题目问题再试。" : filterLabel + "暂无可展示的 Markdown 笔记。"));
  return '<div class="wiki-welcome">' +
    '<section class="wiki-welcome-hero">' +
      '<div>' +
        '<span class="wiki-card-label">' + escHtml(hasQuery ? "SEARCH" : "BROWSE") + "</span>" +
        "<h3>" + escHtml(title) + "</h3>" +
        "<p>" + escHtml(detail) + "</p>" +
      '</div>' +
      '<aside class="wiki-welcome-quick" aria-label="知识库概览">' +
        '<span>当前视图</span>' +
        '<b>' + escHtml(filterLabel) + '</b>' +
        '<strong>' + (results ? results.length : 0) + '</strong>' +
        '<small>' + escHtml(hasQuery ? "搜索结果" : "可浏览笔记") + '</small>' +
      '</aside>' +
    "</section>" +
    '<div class="wiki-welcome-actions" aria-label="知识库使用提示">' +
      '<div class="wiki-welcome-card"><span>01</span><b>浏览目录</b><p>左侧是双栏目录，按科目展开。</p></div>' +
      '<div class="wiki-welcome-card"><span>02</span><b>全文预览</b><p>选择笔记后在这里阅读，保留标题、表格和 callout。</p></div>' +
      '<div class="wiki-welcome-card"><span>03</span><b>智能归档</b><p>AI 追问会按首次问题保存为概念或题目问题。</p></div>' +
    "</div>" +
    (subjectSummary ? '<div class="wiki-welcome-section"><div class="wiki-welcome-section-head"><b>科目索引</b><span>' + escHtml(filterLabel) + '</span></div>' + subjectSummary + '</div>' : "") +
  "</div>";
}

function renderWikiWelcome(results, query, message) {
  const preview = $("#wiki-note-preview");
  if (!preview) return;
  preview.hidden = false;
  preview.innerHTML = wikiWelcomeHtml(results || [], query || "", message || "");
}

function renderWikiState(kind, message) {
  const box = $("#wiki-results");
  const preview = $("#wiki-note-preview");
  if (!box) return;
  const cls = kind === "error" ? "wiki-error" : "wiki-empty";
  box.innerHTML = '<div class="' + cls + '">' + escHtml(message) + "</div>";
  WIKI_LAST_RESULTS = [];
  WIKI_PREVIEW_REQUEST += 1;
  WIKI_PREVIEW_PATH = "";
  WIKI_PREVIEW_NOTE = null;
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = '<div class="' + cls + '">' + escHtml(message) + "</div>";
  }
  setWikiResultsMeta(kind === "loading" ? "加载中" : wikiKindFilterLabel(WIKI_SELECTED_KIND), kind === "error" ? "错误" : "状态", 0);
}

function renderWikiResults(data, query) {
  const box = $("#wiki-results");
  if (!box) return;
  WIKI_PREVIEW_REQUEST += 1;
  WIKI_PREVIEW_PATH = "";
  WIKI_PREVIEW_NOTE = null;
  const results = filterWikiQuestionResults(data.results);
  WIKI_LAST_RESULTS = results;
  const hasQuery = !!(query || "").trim();
  const filterLabel = wikiKindFilterLabel(WIKI_SELECTED_KIND);
  setWikiResultsMeta(hasQuery ? "搜索结果" : "按科目浏览", hasQuery ? "搜索" : "浏览", results.length);
  if (results.length === 0) {
    box.innerHTML = '<div class="wiki-empty">' + escHtml(hasQuery ? "没有匹配的" + filterLabel + "。" : filterLabel + "暂无可展示的 Markdown 笔记。") + "</div>";
    renderWikiWelcome(results, query || "");
    setWikiStatus((hasQuery ? "搜索" : "浏览") + "完成：0 条结果。");
    return;
  }
  const grouped = groupWikiResultsBySubject(results);
  box.innerHTML = grouped.map(([subject, entries]) => wikiSubjectTreeHtml(subject, entries)).join("");
  attachWikiTreeHandlers();
  renderWikiWelcome(results, query || "");
  setWikiStatus(filterLabel + (hasQuery ? "搜索" : "浏览") + "完成：" + results.length + " 条结果。");
}

function attachWikiTreeHandlers() {
  $$(".wiki-tree-subject-row").forEach(el => {
    el.onclick = () => {
      const subject = el.dataset.wikiSubject || "";
      WIKI_TREE_COLLAPSED[subject] = !WIKI_TREE_COLLAPSED[subject];
      const box = $("#wiki-results");
      if (!box) return;
      box.innerHTML = groupWikiResultsBySubject(WIKI_LAST_RESULTS).map(([nextSubject, entries]) => wikiSubjectTreeHtml(nextSubject, entries)).join("");
      attachWikiTreeHandlers();
      syncWikiTreeSelection();
    };
  });
  $$(".wiki-tree-item").forEach(el => {
    el.onclick = () => showWikiPreview(parseInt(el.dataset.wikiIndex || "-1", 10));
  });
}

function collapseWikiPreview() {
  WIKI_PREVIEW_REQUEST += 1;
  WIKI_PREVIEW_PATH = "";
  WIKI_PREVIEW_NOTE = null;
  syncWikiTreeSelection();
  renderWikiWelcome(WIKI_LAST_RESULTS, $("#wiki-search-input") && $("#wiki-search-input").value || "");
}

function wikiPreviewMetaHtml(item) {
  return [
    wikiItemKindLabel(item),
    item && item.subject,
    item && item.updated ? formatWikiDate(item.updated) : "",
  ].filter(Boolean).map(value => "<span>" + escHtml(value) + "</span>").join("");
}

function wikiPreviewTagsHtml(item) {
  const tags = Array.isArray(item && item.tags) ? item.tags.slice(0, 12) : [];
  return tags.length
    ? '<div class="wiki-preview-tags">' + tags.map(tag => "<i>" + escHtml(tag) + "</i>").join("") + "</div>"
    : "";
}

function wikiPreviewContentHtml(content) {
  if (typeof renderMarkdown === "function") return renderMarkdown(content || "");
  return '<pre class="wiki-preview-fallback">' + escHtml(content || "") + "</pre>";
}

function resetWikiFollowupState(path) {
  WIKI_FOLLOWUP_STATE = { path: path || "", question: "", answer: "", busy: false, saving: false, error: "" };
}

function wikiFollowupQuestionValue(value, maxLen = 1000) {
  const text = String(value || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return text.length > maxLen ? text.slice(0, maxLen).trim() : text;
}

function wikiFollowupMarkdownText(value, maxLen = 1000) {
  return wikiFollowupQuestionValue(value, maxLen)
    .split("\n")
    .map(line => line
      .replace(/^(\s{0,3})(#{1,6}\s+)/, "$1\\$2")
      .replace(/^(\s{0,3})([-*_])\2\2+\s*$/, "$1\\$2$2$2"))
    .join("\n")
    .trim();
}

function wikiFollowupTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function wikiFollowupSummary(question) {
  const text = (typeof plainText === "function" ? plainText(question || "") : String(question || ""))
    .replace(/\s+/g, " ")
    .replace(/^[#\s>：:、，。！？?！-]+/, "")
    .trim();
  return (text || "追问").slice(0, 42);
}

function wikiFollowupMessages(note, question) {
  const content = typeof note.raw_content === "string" ? note.raw_content : (note.content || "");
  return [
    {
      role: "system",
      content: "你是 408 考研个人知识库助手。中文作答，使用 Markdown。只基于用户给出的当前笔记内容回答；如果笔记信息不足，明确说明不足并给出可验证的推理。不要寒暄。"
    },
    {
      role: "user",
      content: [
        "【任务】继续追问这篇笔记。请基于当前笔记回答用户问题，输出可直接追加到 Markdown 笔记的回答。",
        "",
        "【笔记标题】",
        note.title || "",
        "",
        "【笔记路径】",
        note.path || "",
        "",
        "【笔记内容】",
        content || "",
        "",
        "【用户问题】",
        question
      ].join("\n")
    }
  ];
}

function wikiFollowupHtml() {
  const answerHtml = WIKI_FOLLOWUP_STATE.answer
    ? '<div class="wiki-followup-answer-body">' + wikiPreviewContentHtml(WIKI_FOLLOWUP_STATE.answer) + "</div>"
    : '<div class="wiki-followup-empty">AI 回答会显示在这里。确认后再手动保存到当前笔记。</div>';
  return '<section class="wiki-followup-card" aria-label="继续追问这篇笔记">' +
    '<div class="wiki-followup-head">' +
      '<div><h3>继续追问这篇笔记</h3><p>AI 会基于当前笔记内容回答，确认后可追加到当前笔记。</p></div>' +
      '<span>AI</span>' +
    "</div>" +
    '<label class="wiki-followup-label" for="wiki-followup-question">你的问题</label>' +
    '<textarea id="wiki-followup-question" class="wiki-followup-input" rows="3" maxlength="1000" placeholder="例如：这篇笔记里 TCP 拥塞控制和流量控制的区别再解释一下？"></textarea>' +
    '<div class="wiki-followup-actions">' +
      '<button class="wiki-preview-action wiki-followup-ask" type="button" data-wiki-followup-ask="1">询问 AI</button>' +
      '<button class="wiki-preview-action wiki-preview-save wiki-followup-save" type="button" data-wiki-followup-save="1"' + (WIKI_FOLLOWUP_STATE.answer ? "" : " disabled") + '>保存到当前笔记</button>' +
      '<span class="wiki-followup-status" data-wiki-followup-status></span>' +
    "</div>" +
    '<div class="wiki-followup-answer" data-wiki-followup-answer>' + answerHtml + "</div>" +
  "</section>";
}

function syncWikiFollowupUi() {
  const card = $(".wiki-followup-card");
  if (!card) return;
  const input = $("#wiki-followup-question");
  const askBtn = card.querySelector("[data-wiki-followup-ask]");
  const saveBtn = card.querySelector("[data-wiki-followup-save]");
  const statusEl = card.querySelector("[data-wiki-followup-status]");
  const answerEl = card.querySelector("[data-wiki-followup-answer]");
  const busy = !!WIKI_FOLLOWUP_STATE.busy;
  const saving = !!WIKI_FOLLOWUP_STATE.saving;
  if (input) input.disabled = busy || saving;
  if (askBtn) askBtn.disabled = busy || saving;
  if (saveBtn) saveBtn.disabled = busy || saving || !WIKI_FOLLOWUP_STATE.answer;
  if (statusEl) {
    statusEl.textContent = WIKI_FOLLOWUP_STATE.error || (busy ? "正在询问 AI……" : (saving ? "正在追加到当前笔记……" : ""));
    statusEl.dataset.tone = WIKI_FOLLOWUP_STATE.error ? "error" : "";
  }
  if (answerEl) {
    answerEl.innerHTML = WIKI_FOLLOWUP_STATE.answer
      ? '<div class="wiki-followup-answer-body">' + wikiPreviewContentHtml(WIKI_FOLLOWUP_STATE.answer) + (busy ? '<span class="ai-cursor">▍</span>' : "") + "</div>"
      : '<div class="wiki-followup-empty">AI 回答会显示在这里。确认后再手动保存到当前笔记。</div>';
  }
}

function attachWikiFollowupHandlers(preview, item) {
  const card = preview.querySelector(".wiki-followup-card");
  if (!card || !item || !item.path) return;
  const input = card.querySelector("#wiki-followup-question");
  const askBtn = card.querySelector("[data-wiki-followup-ask]");
  const saveBtn = card.querySelector("[data-wiki-followup-save]");
  if (WIKI_FOLLOWUP_STATE.path !== item.path) resetWikiFollowupState(item.path);
  if (input) {
    input.value = WIKI_FOLLOWUP_STATE.question || "";
    input.oninput = () => {
      const value = wikiFollowupQuestionValue(input.value);
      if (WIKI_FOLLOWUP_STATE.answer && value !== WIKI_FOLLOWUP_STATE.question) {
        WIKI_FOLLOWUP_STATE.question = value;
        WIKI_FOLLOWUP_STATE.answer = "";
        WIKI_FOLLOWUP_STATE.error = "";
        syncWikiFollowupUi();
      }
    };
  }
  if (askBtn) askBtn.onclick = askWikiNoteFollowup;
  if (saveBtn) saveBtn.onclick = saveWikiNoteFollowup;
  syncWikiFollowupUi();
}

function renderWikiPreviewCard(item, bodyHtml, badgeText, options = {}) {
  const preview = $("#wiki-note-preview");
  if (!item || !preview) return;
  const canMutate = !!(options.canMutate && item && item.path && typeof item.raw_content === "string");
  const editing = !!options.editing;
  if (!editing && canMutate && WIKI_FOLLOWUP_STATE.path !== item.path) resetWikiFollowupState(item.path);
  preview.hidden = false;
  preview.innerHTML = '<div class="wiki-preview-head">' +
      "<div>" +
        "<strong>" + escHtml(item && (item.title || item.path || "未命名笔记")) + "</strong>" +
        '<div class="wiki-preview-meta">' + wikiPreviewMetaHtml(item || {}) + "</div>" +
      "</div>" +
      '<div class="wiki-preview-head-actions">' +
        "<span>" + escHtml(badgeText || "") + "</span>" +
        (editing ? '<button class="wiki-preview-action wiki-preview-save" type="button" data-wiki-save-edit="1">保存</button>' : "") +
        (editing ? '<button class="wiki-preview-action" type="button" data-wiki-cancel-edit="1">取消</button>' : "") +
        (!editing && canMutate ? '<button class="wiki-preview-action" type="button" data-wiki-edit="1">编辑</button>' : "") +
        (!editing && canMutate ? '<button class="wiki-preview-action wiki-preview-danger" type="button" data-wiki-delete="1">删除</button>' : "") +
        '<button class="wiki-preview-close" type="button" data-wiki-close="1">收起</button>' +
      "</div>" +
    "</div>" +
    '<div class="wiki-preview-path">' + escHtml(item && item.path || "") + "</div>" +
    wikiPreviewTagsHtml(item || {}) +
    '<div class="wiki-preview-body">' + bodyHtml + "</div>" +
    (!editing && canMutate ? wikiFollowupHtml() : "");
  const closeBtn = preview.querySelector("[data-wiki-close]");
  if (closeBtn) closeBtn.onclick = collapseWikiPreview;
  const editBtn = preview.querySelector("[data-wiki-edit]");
  if (editBtn) editBtn.onclick = beginWikiEdit;
  const deleteBtn = preview.querySelector("[data-wiki-delete]");
  if (deleteBtn) deleteBtn.onclick = deleteWikiPreviewNote;
  const cancelBtn = preview.querySelector("[data-wiki-cancel-edit]");
  if (cancelBtn) cancelBtn.onclick = cancelWikiEdit;
  const saveBtn = preview.querySelector("[data-wiki-save-edit]");
  if (saveBtn) saveBtn.onclick = saveWikiEdit;
  if (!editing && canMutate) attachWikiFollowupHandlers(preview, item);
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
    preview.scrollIntoView({ block: "nearest" });
  }
}

async function askWikiNoteFollowup() {
  const note = WIKI_PREVIEW_NOTE;
  const input = $("#wiki-followup-question");
  if (!note || !note.path || typeof note.raw_content !== "string") {
    setWikiStatus("笔记尚未完整加载，不能追问。", "error");
    return;
  }
  const question = wikiFollowupQuestionValue(input && input.value);
  if (!question) {
    WIKI_FOLLOWUP_STATE.error = "请先输入问题。";
    syncWikiFollowupUi();
    toast("请先输入问题");
    return;
  }
  const pathToken = note.path;
  WIKI_FOLLOWUP_STATE = { path: pathToken, question, answer: "", busy: true, saving: false, error: "" };
  syncWikiFollowupUi();
  setWikiStatus("正在询问 AI……");
  let answer = "";
  try {
    const messages = wikiFollowupMessages(note, question);
    if (typeof streamAiApi === "function" && window.ReadableStream) {
      const fullText = await streamAiApi(messages, delta => {
        if (WIKI_PREVIEW_PATH !== pathToken) return;
        answer += delta || "";
        WIKI_FOLLOWUP_STATE.answer = answer;
        syncWikiFollowupUi();
      });
      if (fullText) answer = fullText;
    } else {
      const data = await apiJson("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages })
      });
      answer = data.content || "";
    }
    if (WIKI_PREVIEW_PATH !== pathToken) return;
    WIKI_FOLLOWUP_STATE.answer = String(answer || "").trim();
    WIKI_FOLLOWUP_STATE.busy = false;
    WIKI_FOLLOWUP_STATE.error = WIKI_FOLLOWUP_STATE.answer ? "" : "AI 没有返回可保存的回答。";
    syncWikiFollowupUi();
    setWikiStatus(WIKI_FOLLOWUP_STATE.answer ? "AI 已回答，确认后可追加到当前笔记。" : "AI 没有返回可保存的回答。", WIKI_FOLLOWUP_STATE.answer ? "" : "error");
  } catch (e) {
    if (WIKI_PREVIEW_PATH !== pathToken) return;
    const message = e && e.message ? e.message : String(e);
    WIKI_FOLLOWUP_STATE.busy = false;
    WIKI_FOLLOWUP_STATE.error = "询问失败：" + message;
    syncWikiFollowupUi();
    setWikiStatus("询问 AI 失败：" + message, "error");
    toast("询问 AI 失败");
  }
}

function appendWikiFollowupRecord(content, question, answer) {
  const source = String(content || "").replace(/\s+$/g, "");
  const heading = "## 追问记录";
  const summary = wikiFollowupSummary(question);
  const block = [
    "---",
    "",
    "### " + wikiFollowupTimestamp() + " " + summary,
    "",
    "**问题：**",
    wikiFollowupMarkdownText(question),
    "",
    "**AI 回答：**",
    String(answer || "").trim()
  ].join("\n").trim();
  if (/^##\s+追问记录\s*$/m.test(source)) {
    return source + "\n\n" + block + "\n";
  }
  return source + "\n\n" + heading + "\n\n" + block + "\n";
}

async function reloadWikiPreviewNote(path) {
  if (!path) return;
  const data = await apiJson("/api/wiki/note", {
    method: "POST",
    body: JSON.stringify({ path, kind: WIKI_SELECTED_KIND })
  });
  if (WIKI_PREVIEW_PATH !== path) return;
  WIKI_PREVIEW_NOTE = data;
  resetWikiFollowupState(path);
  renderWikiPreviewCard(data, wikiPreviewContentHtml(data.content || ""), "MARKDOWN", { canMutate: true });
}

async function saveWikiNoteFollowup() {
  const note = WIKI_PREVIEW_NOTE;
  if (!note || !note.path || typeof note.raw_content !== "string") {
    setWikiStatus("笔记尚未完整加载，不能保存追问。", "error");
    return;
  }
  const question = wikiFollowupQuestionValue(WIKI_FOLLOWUP_STATE.question);
  const answer = String(WIKI_FOLLOWUP_STATE.answer || "").trim();
  if (!question) {
    WIKI_FOLLOWUP_STATE.error = "请先输入问题。";
    syncWikiFollowupUi();
    toast("请先输入问题");
    return;
  }
  if (!answer) {
    WIKI_FOLLOWUP_STATE.error = "请先询问 AI，确认回答后再保存。";
    syncWikiFollowupUi();
    toast("请先询问 AI");
    return;
  }
  const pathToken = note.path;
  const nextContent = appendWikiFollowupRecord(note.raw_content, question, answer);
  WIKI_FOLLOWUP_STATE.saving = true;
  WIKI_FOLLOWUP_STATE.error = "";
  syncWikiFollowupUi();
  setWikiStatus("正在追加追问记录……");
  try {
    await apiJson("/api/wiki/note/update", {
      method: "POST",
      body: JSON.stringify({ path: note.path, content: nextContent, expected_mtime: note.mtime })
    });
    if (WIKI_PREVIEW_PATH !== pathToken) return;
    setWikiStatus("已追加到当前笔记。");
    toast("已追加到当前笔记");
    await reloadWikiPreviewNote(pathToken);
  } catch (e) {
    if (WIKI_PREVIEW_PATH !== pathToken) return;
    const message = e && e.message ? e.message : String(e);
    WIKI_FOLLOWUP_STATE.saving = false;
    WIKI_FOLLOWUP_STATE.error = "保存失败：" + message;
    syncWikiFollowupUi();
    setWikiStatus("保存追问失败：" + message, "error");
    toast("保存失败：" + message);
  }
}

function beginWikiEdit() {
  const note = WIKI_PREVIEW_NOTE;
  if (!note || !note.path || typeof note.raw_content !== "string") {
    setWikiStatus("笔记尚未完整加载，不能编辑。", "error");
    return;
  }
  renderWikiPreviewCard(
    note,
    '<div class="wiki-editor-wrap">' +
      '<textarea class="wiki-editor" id="wiki-note-editor" spellcheck="false" aria-label="编辑 Markdown 笔记"></textarea>' +
      '<p class="wiki-editor-hint">保存会覆盖当前 Markdown 文件；删除会移动到个人知识库 .trash，不会永久删除。</p>' +
    '</div>',
    "EDITING",
    { editing: true }
  );
  const editor = $("#wiki-note-editor");
  if (editor) {
    editor.value = note.raw_content;
    editor.focus();
  }
}

function cancelWikiEdit() {
  const note = WIKI_PREVIEW_NOTE;
  if (!note) return collapseWikiPreview();
  renderWikiPreviewCard(note, wikiPreviewContentHtml(note.content || ""), "MARKDOWN", { canMutate: true });
}

async function refreshWikiAfterMutation(path, reopen) {
  const input = $("#wiki-search-input");
  const query = input ? input.value : "";
  await runWikiSearch(query, 20);
  if (!reopen || !path) return;
  const index = WIKI_LAST_RESULTS.findIndex(item => item && item.path === path);
  if (index >= 0) await showWikiPreview(index);
}

async function saveWikiEdit() {
  const note = WIKI_PREVIEW_NOTE;
  const editor = $("#wiki-note-editor");
  if (!note || !note.path || typeof note.raw_content !== "string" || !editor) {
    setWikiStatus("笔记尚未完整加载，不能保存。", "error");
    return;
  }
  const preview = $("#wiki-note-preview");
  const buttons = preview ? preview.querySelectorAll("button") : [];
  buttons.forEach(btn => { btn.disabled = true; });
  setWikiStatus("正在保存笔记……");
  try {
    await apiJson("/api/wiki/note/update", {
      method: "POST",
      body: JSON.stringify({ path: note.path, content: editor.value, expected_mtime: note.mtime })
    });
    setWikiStatus("笔记已保存。");
    await refreshWikiAfterMutation(note.path, true);
  } catch (e) {
    buttons.forEach(btn => { btn.disabled = false; });
    const message = e && e.message ? e.message : String(e);
    setWikiStatus("保存失败：" + message, "error");
  }
}

async function deleteWikiPreviewNote() {
  const note = WIKI_PREVIEW_NOTE;
  if (!note || !note.path) {
    setWikiStatus("笔记尚未完整加载，不能删除。", "error");
    return;
  }
  const title = note.title || note.path;
  if (!window.confirm("删除笔记「" + title + "」？\n\n这会移动到个人知识库 .trash，不会永久删除。")) return;
  setWikiStatus("正在移动笔记到回收站……");
  try {
    await apiJson("/api/wiki/note/delete", {
      method: "POST",
      body: JSON.stringify({ path: note.path, reason: "user-request" })
    });
    WIKI_PREVIEW_NOTE = null;
    setWikiStatus("笔记已移动到回收站。");
    await refreshWikiAfterMutation("", false);
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    setWikiStatus("删除失败：" + message, "error");
  }
}

async function showWikiPreview(index) {
  const item = WIKI_LAST_RESULTS[index];
  const preview = $("#wiki-note-preview");
  if (!item || !preview || !item.path) return;
  const requestId = ++WIKI_PREVIEW_REQUEST;
  WIKI_PREVIEW_PATH = item.path;
  WIKI_PREVIEW_NOTE = null;
  syncWikiTreeSelection();
  renderWikiPreviewCard(item, '<div class="wiki-empty">正在加载笔记全文预览……</div>', "LOADING");
  try {
    const data = await apiJson("/api/wiki/note", {
      method: "POST",
      body: JSON.stringify({ path: item.path, kind: WIKI_SELECTED_KIND })
    });
    if (requestId !== WIKI_PREVIEW_REQUEST || WIKI_PREVIEW_PATH !== item.path) return;
    WIKI_PREVIEW_NOTE = data;
    renderWikiPreviewCard(data, wikiPreviewContentHtml(data.content || ""), "MARKDOWN", { canMutate: true });
  } catch (e) {
    if (requestId !== WIKI_PREVIEW_REQUEST || WIKI_PREVIEW_PATH !== item.path) return;
    const message = e && e.message === "未登录"
      ? "请先登录，再读取笔记全文预览。"
      : "笔记预览失败：" + (e.message || e);
    renderWikiPreviewCard(item, '<div class="wiki-error">' + escHtml(message) + "</div>", "ERROR");
  }
}

async function runWikiSearch(query, limit = 20) {
  const hasQuery = !!(query || "").trim();
  const effectiveLimit = hasQuery ? limit : 120;
  renderWikiState("loading", "正在读取" + wikiKindFilterLabel(WIKI_SELECTED_KIND) + "索引……");
  try {
    const data = await apiJson("/api/wiki/search", {
      method: "POST",
      body: JSON.stringify({ query: query || "", limit: effectiveLimit, kind: WIKI_SELECTED_KIND, scope: "question" })
    });
    renderWikiResults(data, query || "");
    WIKI_BROWSE_LOADED = WIKI_BROWSE_LOADED || !hasQuery;
  } catch (e) {
    const message = e && e.message === "未登录"
      ? "请先登录，再读取知识库搜索。"
      : "知识库搜索失败：" + (e.message || e);
    renderWikiState("error", message);
    setWikiStatus(message, "error");
  }
}

function scheduleWikiSearch() {
  const input = $("#wiki-search-input");
  if (!input) return;
  clearTimeout(WIKI_SEARCH_TIMER);
  WIKI_SEARCH_TIMER = setTimeout(() => runWikiSearch(input.value, 20), 250);
}

function maybeLoadWikiBrowse() {
  if (!wikiPageActive() || WIKI_BROWSE_LOADED) return;
  runWikiSearch("", 20);
}

function initWikiPage() {
  const input = $("#wiki-search-input");
  const searchBtn = $("#wiki-search-button");
  const browseBtn = $("#wiki-browse-button");
  if (!input || !searchBtn || !browseBtn) return;
  syncWikiKindTabs();
  input.addEventListener("input", scheduleWikiSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(WIKI_SEARCH_TIMER);
      runWikiSearch(input.value, 20);
    }
  });
  searchBtn.onclick = () => {
    clearTimeout(WIKI_SEARCH_TIMER);
    runWikiSearch(input.value, 20);
  };
  browseBtn.onclick = () => {
    input.value = "";
    clearTimeout(WIKI_SEARCH_TIMER);
    WIKI_BROWSE_LOADED = false;
    runWikiSearch("", 20);
  };
  $$("[data-wiki-kind]").forEach(btn => {
    btn.onclick = () => {
      const nextKind = btn.dataset.wikiKind || "all";
      if (nextKind === WIKI_SELECTED_KIND) return;
      WIKI_SELECTED_KIND = nextKind;
      syncWikiKindTabs();
      collapseWikiPreview();
      clearTimeout(WIKI_SEARCH_TIMER);
      WIKI_BROWSE_LOADED = false;
      runWikiSearch(input.value, 20);
    };
  });
  window.addEventListener("hashchange", maybeLoadWikiBrowse);
  maybeLoadWikiBrowse();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWikiPage);
} else {
  initWikiPage();
}
