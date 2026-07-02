"use strict";

let SEARCH_INDEX = null;
let SEARCH_ACTIVE = -1;  // 当前高亮的搜索结果
let SEARCH_RESULTS = [];
let SEARCH_SOURCE_TYPE = "all";
let SEARCH_YEAR = "all";
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
  modal.hidden = false;
  const input = $("#search-input");
  input.value = "";
  SEARCH_SOURCE_TYPE = "all";
  SEARCH_YEAR = "all";
  renderSearchFilters();
  $("#search-results").innerHTML = `<div class="search-empty">输入关键词搜索题干 / 选项 / 解析<br>也可按来源标签和年份筛选</div>`;
  $("#search-count").textContent = "0";
  $("#search-total").textContent = ALL_QUESTIONS.length;
  setTimeout(() => input.focus(), 30);
}
function closeSearch() {
  const modal = $("#search-modal");
  if (modal) modal.hidden = true;
}
function runSearch() {
  const input = $("#search-input");
  const q = input.value;
  const ids = searchQuestions(q);
  SEARCH_RESULTS = ids;
  SEARCH_ACTIVE = ids.length > 0 ? 0 : -1;
  $("#search-count").textContent = ids.length;
  renderSearchResults();
}
function renderSearchResults() {
  const box = $("#search-results");
  if (!box) return;
  if (SEARCH_RESULTS.length === 0) {
    const q = ($("#search-input") && $("#search-input").value || "").trim();
    const msg = q || hasActiveSearchFilter() ? "没有匹配的题目<br>试试其他关键词或筛选条件" : "输入关键词搜索题干 / 选项 / 解析<br>也可按来源标签和年份筛选";
    box.innerHTML = `<div class="search-empty">${msg}</div>`;
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
    return `<div class="search-result${activeCls}" data-qid="${escHtml(qid)}" data-idx="${i}">
      <div class="search-result-meta">
        ${renderSourceTag(qq)}
        <span>${escHtml(qq.book)} · ${escHtml(qq.chapter_title)} · ${escHtml(qq.section || "")}</span>
      </div>
      <div class="search-result-stem">${highlightMatch(stem, q)}</div>
    </div>`;
  }).join("");
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
  closeSearch();
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

// ============== Feature 7: 题目相似度 / 关联 ==============
// 简化版"关联":同章节 + 同题型 + 题干有共同关键词 → 同章节其他题
function getRelatedQuestions(q, max = 5) {
  if (!q) return [];
  const sameChapter = ALL_QUESTIONS.filter(qq =>
    qq.id !== q.id && qq.book === q.book && qq.chapter === q.chapter
  );
  if (sameChapter.length === 0) return [];
  // 用题干首 20 个汉字作为关键词
  const curText = plainText(q.question).slice(0, 50);
  // 同章节按章节内编号排序
  sameChapter.sort((a, b) => (a.num || 0) - (b.num || 0));
  // 如果题干太短(纯定义题),直接返回章节里前后各几道
  if (curText.length < 10) {
    const idx = sameChapter.findIndex(qq => qq.id === q.id);
    const near = idx >= 0
      ? sameChapter.slice(Math.max(0, idx - 2), idx).concat(sameChapter.slice(idx + 1, idx + 4))
      : sameChapter.slice(0, max);
    return near.slice(0, max).map(qq => ({
      q: qq,
      reason: "同章节",
    }));
  }
  // 计算杰卡德相似度(用 2-gram 切词)
  function shingles(text) {
    const clean = text.replace(/\s+/g, "");
    const set = new Set();
    for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
    return set;
  }
  const curSet = shingles(curText);
  const scored = sameChapter.map(qq => {
    const otherSet = shingles(plainText(qq.question).slice(0, 50));
    let inter = 0;
    for (const s of curSet) if (otherSet.has(s)) inter += 1;
    const union = curSet.size + otherSet.size - inter;
    const sim = union > 0 ? inter / union : 0;
    return { q: qq, sim };
  });
  scored.sort((a, b) => b.sim - a.sim);
  // 取相似度 > 0.05 的,或前 max 条
  const results = scored.filter(s => s.sim > 0.05).slice(0, max);
  if (results.length === 0) {
    return scored.slice(0, max).map(s => ({ q: s.q, reason: "同章节" }));
  }
  return results.map(s => ({
    q: s.q,
    reason: s.sim > 0.2 ? "题干相似" : "同章节",
    sim: s.sim,
  }));
}
function renderRelated(q) {
  const wrap = $("#related-wrap");
  if (!wrap) return;
  const related = getRelatedQuestions(q, 5);
  if (related.length === 0) {
    wrap.innerHTML = "";
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="related-head">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M5 4h6M5 8h6M5 12h4"/><circle cx="3" cy="4" r="1.2" fill="currentColor"/><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="3" cy="12" r="1.2" fill="currentColor"/>
      </svg>
      关联题目 · 同章节
    </div>
    <div class="related-list">
      ${related.map(r => {
        const stem = plainText(r.q.question);
        const short = stem.length > 38 ? stem.slice(0, 38) + "…" : stem;
        const idxInBook = ALL_QUESTIONS.filter(qq => qq.book === r.q.book && qq.chapter === r.q.chapter).findIndex(qq => qq.id === r.q.id);
        return `<div class="related-item" data-qid="${escHtml(r.q.id)}">
          <span class="related-pos">${(r.q.num || "?").toString().padStart(2, "0")}</span>
          <div style="flex:1; min-width:0;">
            <div class="related-text">${escHtml(short)}</div>
            <div class="related-meta">${escHtml(r.reason)}${r.sim ? ` · ${Math.round(r.sim * 100)}%` : ""}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
  $$("#related-wrap .related-item").forEach(el => {
    el.onclick = () => {
      const qid = el.dataset.qid;
      const rq = ALL_QUESTIONS.find(x => x.id === qid);
      if (!rq) return;
      // 切到对应书目+章节+顺序模式
      if (CURRENT.book !== rq.book || CURRENT.chapter !== rq.chapter) {
        CURRENT.book = rq.book;
        CURRENT.chapter = rq.chapter;
        setMode("sequential");
      }
      const idx = CURRENT.questions.findIndex(qq => qq.id === qid);
      if (idx >= 0) CURRENT.idx = idx;
      else { CURRENT.questions = [rq]; CURRENT.idx = 0; }
      render();
    };
  });
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

// ============== Feature 3: 批量讲错题 ==============
let BATCH_SELECTED = new Set();
let BATCH_SORT_MODE = "default";
function openBatchModal() {
  const modal = $("#batch-modal");
  if (!modal) return;
  const wrongIds = Object.keys(STATE.wrong || {});
  if (wrongIds.length === 0) {
    toast("当前没有错题");
    return;
  }
  BATCH_SELECTED = new Set(wrongIds.slice(0, Math.min(20, wrongIds.length)));
  BATCH_SORT_MODE = "default";
  modal.hidden = false;
  renderBatchList();
}
function closeBatchModal() {
  const modal = $("#batch-modal");
  if (modal) modal.hidden = true;
}
function renderBatchList() {
  const box = $("#batch-list");
  if (!box) return;
  const wrongIds = Object.keys(STATE.wrong || {});
  $("#batch-total").textContent = wrongIds.length;
  let items = wrongIds.map(qid => ALL_QUESTIONS.find(q => q.id === qid)).filter(Boolean);
  if (BATCH_SORT_MODE === "chapter") {
    items.sort((a, b) => {
      if (a.book !== b.book) return a.book.localeCompare(b.book);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return (a.num || 0) - (b.num || 0);
    });
  } else {
    // 默认:最近答错的优先
    items.sort((a, b) => (STATE.wrong[b.id] || 0) - (STATE.wrong[a.id] || 0));
  }
  if (items.length === 0) {
    box.innerHTML = `<div class="batch-empty">错题本为空</div>`;
    return;
  }
  box.innerHTML = items.map(q => {
    const selected = BATCH_SELECTED.has(q.id);
    const stem = plainText(q.question);
    const short = stem.length > 80 ? stem.slice(0, 80) + "…" : stem;
    return `<div class="batch-item ${selected ? "selected" : ""}" data-qid="${escHtml(q.id)}">
      <div class="batch-check">${selected ? "✓" : ""}</div>
      <div class="batch-item-body">
        <div class="batch-item-meta">${renderSourceTag(q)}${escHtml(q.book)} · 第${q.chapter}章 · ${escHtml(q.section || "")} · ${escHtml(q.chapter_title)}</div>
        <div class="batch-item-stem">${escHtml(short)}</div>
      </div>
    </div>`;
  }).join("");
  $("#batch-selected").textContent = BATCH_SELECTED.size;
  $$(".batch-item").forEach(el => {
    el.onclick = () => {
      const qid = el.dataset.qid;
      if (BATCH_SELECTED.has(qid)) BATCH_SELECTED.delete(qid);
      else BATCH_SELECTED.add(qid);
      renderBatchList();
    };
  });
}
