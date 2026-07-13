"use strict";

let SEARCH_INDEX = null;
let SEARCH_ACTIVE = -1;  // 当前高亮的搜索结果
let SEARCH_RESULTS = [];
let SEARCH_SOURCE_TYPE = "all";
let SEARCH_YEAR = "all";
let SEARCH_RETURN_FOCUS = null;
function buildSearchIndex() {
  const idx = [];  // [{qid, plain}]
  for (const q of ALL_QUESTIONS) {
    const meta = getQuestionSourceMeta(q);
    const text = [
      q.question || "",
      q.options?.A || "", q.options?.B || "", q.options?.C || "", q.options?.D || "",
      q.explanation || "",
      q.book || "", q.chapter_title || "", q.section_title || "", q.section || "",
      meta.label || "", meta.type || "", meta.year || "", meta.unified ? "统考真题" : "",
    ].join(" ");
    idx.push({ qid: q.id, plain: text.toLowerCase() });
  }
  SEARCH_INDEX = idx;
}
function getSearchFilterState() {
  return { sourceType: SEARCH_SOURCE_TYPE || "all", year: SEARCH_YEAR || "all" };
}
function hasActiveSearchFilter() {
  const filters = getSearchFilterState();
  return filters.sourceType !== "all" || filters.year !== "all";
}
function filterSearchQuestionIds(ids) {
  const filters = getSearchFilterState();
  return ids.filter(qid => {
    const q = ALL_QUESTIONS.find(qq => qq.id === qid);
    if (!q) return false;
    const meta = getQuestionSourceMeta(q);
    if (filters.sourceType !== "all" && meta.type !== filters.sourceType) return false;
    if (filters.year !== "all" && String(meta.year || "") !== String(filters.year)) return false;
    return true;
  });
}
function getDiscoveredSourceYears() {
  const years = new Set();
  for (const q of ALL_QUESTIONS) {
    const meta = getQuestionSourceMeta(q);
    if (meta.year && (meta.type === "exam" || meta.type === "mock")) years.add(String(meta.year));
  }
  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}
function renderSearchFilters() {
  const yearSelect = $("#search-year-filter");
  if (yearSelect) {
    const years = getDiscoveredSourceYears();
    const cur = years.includes(String(SEARCH_YEAR)) ? String(SEARCH_YEAR) : "all";
    SEARCH_YEAR = cur;
    yearSelect.innerHTML = '<option value="all">全部年份</option>' + years.map(y => '<option value="' + escHtml(y) + '">' + escHtml(y) + '</option>').join("");
    yearSelect.value = cur;
    yearSelect.disabled = years.length === 0;
  }
  $$(".search-source-filter").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.sourceType === SEARCH_SOURCE_TYPE);
    btn.setAttribute("aria-pressed", btn.dataset.sourceType === SEARCH_SOURCE_TYPE ? "true" : "false");
  });
}
function searchQuestions(query) {
  if (!SEARCH_INDEX) buildSearchIndex();
  const q = (query || "").trim().toLowerCase();
  if (!q) return hasActiveSearchFilter() ? filterSearchQuestionIds(SEARCH_INDEX.map(item => item.qid)) : [];
  // 支持空格分隔的多关键词 AND 检索
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const hits = [];
  for (const item of SEARCH_INDEX) {
    let allMatch = true;
    for (const t of tokens) {
      if (!item.plain.includes(t)) { allMatch = false; break; }
    }
    if (allMatch) hits.push(item.qid);
  }
  return filterSearchQuestionIds(hits);
}
function highlightMatch(text, query) {
  const q = (query || "").trim();
  if (!q) return escHtml(text);
  const tokens = q.split(/\s+/).filter(Boolean);
  let out = escHtml(text);
  // 按 token 长度降序,避免短 token 破坏长 token 的标记
  tokens.sort((a, b) => b.length - a.length);
  for (const t of tokens) {
    if (t.length < 2) continue;
    const safeT = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp("(" + safeT + ")", "gi"), "<mark>$1</mark>");
  }
  return out;
}
function openSearch() {
  const modal = $("#search-modal");
  if (!modal) return;
  SEARCH_RETURN_FOCUS = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  const app = document.querySelector(".app");
  if (app) app.inert = true;
  document.body.classList.add("modal-open");
  const input = $("#search-input");
  input.value = "";
  input.removeAttribute("aria-activedescendant");
  SEARCH_RESULTS = [];
  SEARCH_ACTIVE = -1;
  SEARCH_SOURCE_TYPE = "all";
  SEARCH_YEAR = "all";
  renderSearchFilters();
  $("#search-results").innerHTML = `<div class="search-empty">搜索题干 / 选项 / 解析<br>也可按来源和年份筛选</div>`;
  $("#search-count").textContent = "0 条结果";
  $("#search-total").textContent = ALL_QUESTIONS.length;
  setTimeout(() => input.focus(), 30);
}
function closeSearch(restoreFocus = true) {
  const modal = $("#search-modal");
  if (modal) modal.hidden = true;
  const app = document.querySelector(".app");
  if (app) app.inert = false;
  document.body.classList.remove("modal-open");
  const input = $("#search-input");
  if (input) input.removeAttribute("aria-activedescendant");
  if (restoreFocus && SEARCH_RETURN_FOCUS && SEARCH_RETURN_FOCUS.isConnected) {
    const target = SEARCH_RETURN_FOCUS;
    requestAnimationFrame(() => target.focus());
  }
  SEARCH_RETURN_FOCUS = null;
}
function trapSearchFocus(event) {
  if (event.key !== "Tab") return;
  const modal = $("#search-modal");
  if (!modal || modal.hidden) return;
  const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
function syncSearchActiveDescendant() {
  const input = $("#search-input");
  if (!input) return;
  if (SEARCH_ACTIVE >= 0 && SEARCH_ACTIVE < Math.min(SEARCH_RESULTS.length, 100)) {
    input.setAttribute("aria-activedescendant", `search-result-${SEARCH_ACTIVE}`);
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}
function runSearch() {
  const input = $("#search-input");
  const q = input.value;
  const ids = searchQuestions(q);
  SEARCH_RESULTS = ids;
  SEARCH_ACTIVE = ids.length > 0 ? 0 : -1;
  $("#search-count").textContent = `${ids.length} 条结果`;
  renderSearchResults();
}
function renderSearchResults() {
  const box = $("#search-results");
  if (!box) return;
  if (SEARCH_RESULTS.length === 0) {
    const q = ($("#search-input") && $("#search-input").value || "").trim();
    const msg = q || hasActiveSearchFilter() ? "没有匹配的题目<br>试试其他关键词或筛选条件" : "输入关键词搜索题干 / 选项 / 解析<br>也可按来源标签和年份筛选";
    box.innerHTML = `<div class="search-empty">${msg}</div>`;
    syncSearchActiveDescendant();
    return;
  }
  const q = $("#search-input").value;
  // 渲染前 100 条,够用
  const showIds = SEARCH_RESULTS.slice(0, 100);
  box.innerHTML = showIds.map((qid, i) => {
    const qq = ALL_QUESTIONS.find(x => x.id === qid);
    if (!qq) return "";
    const stem = plainText(qq.question);
    const activeCls = i === SEARCH_ACTIVE ? " is-active" : "";
    return `<div class="search-result${activeCls}" id="search-result-${i}" role="option" aria-selected="${i === SEARCH_ACTIVE ? "true" : "false"}" data-qid="${escHtml(qid)}" data-idx="${i}">
      <div class="search-result-meta">
        ${renderSourceTag(qq)}
        <span>${escHtml(qq.book)} · ${escHtml(qq.chapter_title)} · ${escHtml(qq.section || "")}</span>
      </div>
      <div class="search-result-stem">${highlightMatch(stem, q)}</div>
    </div>`;
  }).join("");
  syncSearchActiveDescendant();
  $$(".search-result").forEach(el => {
    el.onclick = () => {
      const qid = el.dataset.qid;
      jumpToSearchResult(qid);
    };
  });
}
function jumpToSearchResult(qid) {
  const q = ALL_QUESTIONS.find(x => x.id === qid);
  if (!q) { toast("题目不存在"); return; }
  closeSearch(false);
  // 切换到对应的书目 + 章节 + 顺序模式,然后跳到该题
  CURRENT.book = q.book;
  CURRENT.chapter = q.chapter;
  setMode("sequential");
  // 找到该题在当前题单中的索引
  const idx = CURRENT.questions.findIndex(qq => qq.id === qid);
  if (idx >= 0) {
    CURRENT.idx = idx;
  } else {
    // 不在题单中(因为之前在另一本书),手动构造单题列表
    CURRENT.questions = [q];
    CURRENT.idx = 0;
  }
  render();
  toast(`已跳到 ${q.book} · ${q.chapter_title}`);
}

// ============== Feature 2: AI 对话历史保存 ==============
// 存储:STATE.aiHistory[qid] = [{role:"user"|"assistant", text, ts}]
// 切题时自动恢复,新对话追加
function pushAiHistory(qid, role, text) {
  if (!qid || !text) return;
  if (!STATE.aiHistory) STATE.aiHistory = {};
  if (!STATE.aiHistory[qid]) STATE.aiHistory[qid] = [];
  STATE.aiHistory[qid].push({ role, text, ts: Date.now() });
  // 单题历史最多 50 条,防止 localStorage 爆
  if (STATE.aiHistory[qid].length > 50) {
    STATE.aiHistory[qid] = STATE.aiHistory[qid].slice(-50);
  }
  persist();
}
function getAiHistory(qid) {
  return (STATE.aiHistory && STATE.aiHistory[qid]) || [];
}
function clearAiHistory(qid) {
  if (STATE.aiHistory && STATE.aiHistory[qid]) {
    delete STATE.aiHistory[qid];
    persist();
  }
}
function renderAiHistory(qid) {
  const wrap = $("#ai-history-list");
  if (!wrap) return;
  const history = getAiHistory(qid);
  if (history.length === 0) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = history.map(m => {
    const preview = m.text.length > 200 ? m.text.slice(0, 200) + "…" : m.text;
    return `<div class="ai-history-msg ${m.role}">
      <div class="ai-history-q">${m.role === "user" ? "❓ 你问" : "🤖 AI"}</div>
      <div>${escHtml(preview)}</div>
    </div>`;
  }).join("");
  wrap.scrollTop = wrap.scrollHeight;
}
