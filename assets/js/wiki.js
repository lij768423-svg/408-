"use strict";

// ============== Wiki save integration ==============
function buildWikiSavePayload(q, state) {
  const selected = state.selected && state.selected.length ? state.selected.join("、") : "未作答";
  const result = state.submitted
    ? (state.shown ? "查看答案" : (state.correct ? "正确" : "错误"))
    : "未提交";
  const options = ["A", "B", "C", "D"]
    .filter(L => q.options && q.options[L])
    .map(L => `${L}. ${plainText(q.options[L] || "")}`)
    .join("\n");
  const questionMarkdown = [
    plainText(q.question),
    options ? "\n## 选项\n" + options : ""
  ].join("\n").trim();
  const aiText = (CURRENT.aiOutput || "").trim();
  const explanationParts = [];
  if (q.explanation) explanationParts.push("## 题库解析\n" + plainText(q.explanation));
  if (aiText) explanationParts.push("## AI 讲解\n" + aiText);
  return {
    question_id: String(q.id || `${q.book}-${q.chapter}-${q.question || ""}`),
    attempt_id: `${q.id || "q"}-${Date.now()}`,
    source: "408-quiz-dev",
    title: `${q.book || "408"} 第${q.chapter || "?"}章 ${plainText(q.section || q.chapter_title || "错题")}`,
    subject: q.book,
    topic_tags: [q.section || q.chapter_title || "", result].filter(Boolean),
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
  const rawKey = `quiz-408-dev:${payload.question_id}:${payload.status}:${(state.selected || []).join("")}`;
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
let WIKI_RECENT_LOADED = false;
let WIKI_LAST_RESULTS = [];
let WIKI_PREVIEW_REQUEST = 0;
let WIKI_PREVIEW_PATH = "";
let WIKI_SELECTED_KIND = "concept";

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
    all: "知识库",
    concept: "概念问题",
    exam: "题目问题",
  };
  return labels[kind] || labels.all;
}

function isWikiQuestionItem(item) {
  const path = String(item && item.path || "");
  return (item && item.type === "question") || /^wiki\/questions?\//.test(path);
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

function renderWikiState(kind, message) {
  const box = $("#wiki-results");
  if (!box) return;
  const cls = kind === "error" ? "wiki-error" : "wiki-empty";
  box.innerHTML = '<div class="' + cls + '">' + escHtml(message) + "</div>";
  setWikiResultsMeta(kind === "loading" ? "加载中" : wikiKindFilterLabel(WIKI_SELECTED_KIND), kind.toUpperCase(), 0);
}

function renderWikiResults(data, query) {
  const box = $("#wiki-results");
  const preview = $("#wiki-note-preview");
  if (!box) return;
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = "";
  }
  WIKI_PREVIEW_REQUEST += 1;
  WIKI_PREVIEW_PATH = "";
  const results = Array.isArray(data.results) ? data.results : [];
  WIKI_LAST_RESULTS = results;
  const hasQuery = !!(query || "").trim();
  const filterLabel = wikiKindFilterLabel(WIKI_SELECTED_KIND);
  setWikiResultsMeta(hasQuery ? filterLabel + "搜索：" + query.trim() : filterLabel + " · 最近更新", hasQuery ? "SEARCH" : "RECENT", results.length);
  if (results.length === 0) {
    box.innerHTML = '<div class="wiki-empty">' + escHtml(hasQuery ? "没有匹配的" + filterLabel + "。" : filterLabel + "暂无可展示的 Markdown 笔记。") + "</div>";
    setWikiStatus((hasQuery ? "搜索" : "最近更新") + "完成：0 条结果。");
    return;
  }
  box.innerHTML = results.map((item, index) => {
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 5) : [];
    const meta = [
      wikiItemKindLabel(item),
      item.subject || "",
      item.updated ? formatWikiDate(item.updated) : "",
    ].filter(Boolean).map(value => "<span>" + escHtml(value) + "</span>").join("");
    const tagHtml = tags.length
      ? '<span class="wiki-result-tags">' + tags.map(tag => "<i>" + escHtml(tag) + "</i>").join("") + "</span>"
      : "";
    return '<button class="wiki-result" type="button" data-wiki-index="' + index + '">' +
      '<span class="wiki-result-meta">' + meta + "</span>" +
      "<strong>" + escHtml(item.title || item.path || "未命名笔记") + "</strong>" +
      '<span class="wiki-result-snippet">' + escHtml(item.snippet || item.path || "") + "</span>" +
      '<span class="wiki-result-path">' + escHtml(item.path || "") + "</span>" +
      tagHtml +
      "</button>";
  }).join("");
  $$(".wiki-result").forEach(el => {
    el.onclick = () => showWikiPreview(parseInt(el.dataset.wikiIndex || "-1", 10));
  });
  setWikiStatus(filterLabel + (hasQuery ? "搜索" : "最近更新") + "完成：" + results.length + " 条结果。");
}

function collapseWikiPreview() {
  const preview = $("#wiki-note-preview");
  WIKI_PREVIEW_REQUEST += 1;
  WIKI_PREVIEW_PATH = "";
  if (!preview) return;
  preview.hidden = true;
  preview.innerHTML = "";
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

function renderWikiPreviewCard(item, bodyHtml, badgeText) {
  const preview = $("#wiki-note-preview");
  if (!item || !preview) return;
  preview.hidden = false;
  preview.innerHTML = '<div class="wiki-preview-head">' +
      "<div>" +
        "<strong>" + escHtml(item && (item.title || item.path || "未命名笔记")) + "</strong>" +
        '<div class="wiki-preview-meta">' + wikiPreviewMetaHtml(item || {}) + "</div>" +
      "</div>" +
      '<div class="wiki-preview-head-actions">' +
        "<span>" + escHtml(badgeText || "") + "</span>" +
        '<button class="wiki-preview-close" type="button" data-wiki-close="1">收起</button>' +
      "</div>" +
    "</div>" +
    '<div class="wiki-preview-path">' + escHtml(item && item.path || "") + "</div>" +
    wikiPreviewTagsHtml(item || {}) +
    '<div class="wiki-preview-body">' + bodyHtml + "</div>";
  const closeBtn = preview.querySelector("[data-wiki-close]");
  if (closeBtn) closeBtn.onclick = collapseWikiPreview;
  preview.scrollIntoView({ block: "nearest" });
}

async function showWikiPreview(index) {
  const item = WIKI_LAST_RESULTS[index];
  const preview = $("#wiki-note-preview");
  if (!item || !preview || !item.path) return;
  const requestId = ++WIKI_PREVIEW_REQUEST;
  WIKI_PREVIEW_PATH = item.path;
  renderWikiPreviewCard(item, '<div class="wiki-empty">正在加载笔记全文预览……</div>', "LOADING");
  try {
    const data = await apiJson("/api/wiki/note", {
      method: "POST",
      body: JSON.stringify({ path: item.path, kind: WIKI_SELECTED_KIND })
    });
    if (requestId !== WIKI_PREVIEW_REQUEST || WIKI_PREVIEW_PATH !== item.path) return;
    renderWikiPreviewCard(data, wikiPreviewContentHtml(data.content || ""), "READ ONLY");
  } catch (e) {
    if (requestId !== WIKI_PREVIEW_REQUEST || WIKI_PREVIEW_PATH !== item.path) return;
    const message = e && e.message === "未登录"
      ? "请先登录，再读取笔记全文预览。"
      : "笔记预览失败：" + (e.message || e);
    renderWikiPreviewCard(item, '<div class="wiki-error">' + escHtml(message) + "</div>", "ERROR");
  }
}

async function runWikiSearch(query, limit = 20) {
  renderWikiState("loading", "正在读取" + wikiKindFilterLabel(WIKI_SELECTED_KIND) + "索引……");
  try {
    const data = await apiJson("/api/wiki/search", {
      method: "POST",
      body: JSON.stringify({ query: query || "", limit, kind: WIKI_SELECTED_KIND })
    });
    renderWikiResults(data, query || "");
    WIKI_RECENT_LOADED = WIKI_RECENT_LOADED || !(query || "").trim();
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

function maybeLoadWikiRecent() {
  if (!wikiPageActive() || WIKI_RECENT_LOADED) return;
  runWikiSearch("", 20);
}

function initWikiPage() {
  const input = $("#wiki-search-input");
  const searchBtn = $("#wiki-search-button");
  const recentBtn = $("#wiki-recent-button");
  if (!input || !searchBtn || !recentBtn) return;
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
  recentBtn.onclick = () => {
    input.value = "";
    clearTimeout(WIKI_SEARCH_TIMER);
    WIKI_RECENT_LOADED = false;
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
      WIKI_RECENT_LOADED = false;
      runWikiSearch(input.value, 20);
    };
  });
  window.addEventListener("hashchange", maybeLoadWikiRecent);
  maybeLoadWikiRecent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWikiPage);
} else {
  initWikiPage();
}
