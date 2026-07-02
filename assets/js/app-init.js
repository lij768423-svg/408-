"use strict";

// ============== App boot ==============
function loadPersistedPreferences() {
  try {
    const instant = localStorage.getItem("408-quiz-instant");
    if (instant != null) CURRENT.instantGrade = JSON.parse(instant);
    const lim = localStorage.getItem("408-quiz-limit");
    if (lim != null) CURRENT.limit = parseInt(lim, 10) || 50;
  } catch (e) {}
}

function setQuizLoadingSlowHint() {
  const el = $("#quiz-loading");
  if (!el) return;
  el.innerHTML = '加载题库中...<div style="margin-top:10px;color:var(--muted);font-size:13px;">如果一直停在这里，可以先点下面重试。</div><button class="btn btn-ghost" type="button" id="retry-load-data" style="margin-top:12px;">重新加载题库</button>';
  const retry = $("#retry-load-data");
  if (retry) retry.onclick = () => startAppAfterAuth();
}

function setQuizLoadError(err) {
  const msg = err && err.message ? err.message : String(err || "未知错误");
  $("#quiz-area").innerHTML = '<div class="empty">加载题库失败：' + escHtml(msg) + '<br><button class="btn btn-primary btn-accent" type="button" id="retry-load-data">重新加载题库</button></div>';
  const retry = $("#retry-load-data");
  if (retry) retry.onclick = () => startAppAfterAuth();
}

function startAppAfterAuth() {
  AUTH_READY = true;
  loadPersistedPreferences();
  $("#quiz-area").innerHTML = '<div class="loading" id="quiz-loading">加载题库中...</div>';
  const slowTimer = setTimeout(setQuizLoadingSlowHint, 3200);
  fetch("data.json")
    .then(r => r.json())
    .then(data => {
      clearTimeout(slowTimer);
      ALL_QUESTIONS = (data.questions || []).filter(q => q.hidden !== true);
      if (ALL_QUESTIONS.length === 0) {
        $("#quiz-area").innerHTML = '<div class="empty">题库为空。请先运行提取脚本</div>';
        return;
      }
      DATA_READY = true;
      buildSearchIndex();  // Feature 6: 构建搜索索引
      bindNewFeatureControls();  // Feature 1/3/5/6 一次性绑定
      if (restoreSession()) {
        render();
      } else {
        const lastBook = localStorage.getItem("408-quiz-last-book");
        if (lastBook && getBooks().includes(lastBook)) CURRENT.book = lastBook;
        else CURRENT.book = getBooks()[0];
        setBook(CURRENT.book);
      }
      scheduleServerSync();
    })
    .catch(err => {
      clearTimeout(slowTimer);
      setQuizLoadError(err);
    });
}

// ============== 新功能事件绑定 ==============
let NEW_FEATURES_BOUND = false;
function bindNewFeatureControls() {
  if (NEW_FEATURES_BOUND) return;
  NEW_FEATURES_BOUND = true;
  // Feature 6: 搜索
  const searchOpen = $("#search-open");
  if (searchOpen) searchOpen.onclick = () => openSearch();
  const searchInput = $("#search-input");
  if (searchInput) {
    searchInput.oninput = () => runSearch();
    searchInput.onkeydown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (SEARCH_RESULTS.length === 0) return;
        SEARCH_ACTIVE = Math.min(SEARCH_ACTIVE + 1, SEARCH_RESULTS.length - 1);
        renderSearchResults();
        const active = $(".search-result.is-active");
        if (active) active.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (SEARCH_RESULTS.length === 0) return;
        SEARCH_ACTIVE = Math.max(SEARCH_ACTIVE - 1, 0);
        renderSearchResults();
        const active = $(".search-result.is-active");
        if (active) active.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (SEARCH_ACTIVE >= 0 && SEARCH_RESULTS[SEARCH_ACTIVE]) {
          jumpToSearchResult(SEARCH_RESULTS[SEARCH_ACTIVE]);
        }
      } else if (e.key === "Escape") {
        closeSearch();
      }
    };
  }
  $$(".search-source-filter").forEach(btn => {
    btn.onclick = () => {
      SEARCH_SOURCE_TYPE = btn.dataset.sourceType || "all";
      renderSearchFilters();
      runSearch();
      if (searchInput) searchInput.focus();
    };
  });
  const searchYearFilter = $("#search-year-filter");
  if (searchYearFilter) {
    searchYearFilter.onchange = () => {
      SEARCH_YEAR = searchYearFilter.value || "all";
      renderSearchFilters();
      runSearch();
      if (searchInput) searchInput.focus();
    };
  }
  const searchModal = $("#search-modal");
  if (searchModal) {
    searchModal.onclick = (e) => {
      if (e.target === searchModal) closeSearch();
    };
  }
  // Ctrl+K / Cmd+K 打开搜索
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if ($("#search-modal") && !$("#search-modal").hidden) closeSearch();
      else openSearch();
    } else if (e.key === "Escape") {
      if ($("#search-modal") && !$("#search-modal").hidden) closeSearch();
      if ($("#batch-modal") && !$("#batch-modal").hidden) closeBatchModal();
    }
  });
  // Feature 3: 批量讲错题入口位于 AI 面板内，随 renderAiPanel 重渲染后在 bindAiPanel 中绑定。
  const batchClose = $("#batch-close");
  if (batchClose) batchClose.onclick = () => closeBatchModal();
  const batchModal = $("#batch-modal");
  if (batchModal) {
    batchModal.onclick = (e) => {
      if (e.target === batchModal) closeBatchModal();
    };
  }
  const batchSelectAll = $("#batch-select-all");
  if (batchSelectAll) batchSelectAll.onclick = () => {
    $$(".batch-item").forEach(el => BATCH_SELECTED.add(el.dataset.qid));
    renderBatchList();
  };
  const batchSelectNone = $("#batch-select-none");
  if (batchSelectNone) batchSelectNone.onclick = () => {
    BATCH_SELECTED.clear();
    renderBatchList();
  };
  const batchSort = $("#batch-sort");
  if (batchSort) batchSort.onclick = () => {
    BATCH_SORT_MODE = BATCH_SORT_MODE === "chapter" ? "default" : "chapter";
    batchSort.textContent = BATCH_SORT_MODE === "chapter" ? "按时间排序" : "按章节排序";
    renderBatchList();
  };
  const batchAsk = $("#batch-ask");
  if (batchAsk) batchAsk.onclick = async () => {
    if (BATCH_SELECTED.size === 0) { toast("先选几道错题"); return; }
    // 收集选中题目的上下文,合并后发给 AI
    const selectedQs = Array.from(BATCH_SELECTED)
      .map(qid => ALL_QUESTIONS.find(q => q.id === qid))
      .filter(Boolean);
    if (selectedQs.length === 0) { toast("题目不存在"); return; }
    closeBatchModal();
    const lines = [
      `# 408 错题串讲 · 共 ${selectedQs.length} 题`,
      "",
      "请帮我串讲这些错题的共同考点和解题思路,先按章节归类,再逐题给出要点。",
      "",
      "---",
    ];
    selectedQs.forEach((q, i) => {
      const ctx = getQuestionContext(q, null, "");
      lines.push(`## 错题 ${i + 1} / ${selectedQs.length}`);
      lines.push(ctx);
      lines.push("---");
    });
    const batchText = lines.join("\n");
    // 写到剪贴板 + 打开搜索栏输入框提示
    try {
      await navigator.clipboard.writeText(batchText);
      toast(`已复制 ${selectedQs.length} 道错题上下文到剪贴板,可粘贴给任意 AI`);
    } catch (e) {
      toast("已生成串讲上下文,可在 AI 栏使用复制");
    }
    // 同时切到第一道错题 + 在 AI 栏显示
    CURRENT.book = selectedQs[0].book;
    CURRENT.chapter = selectedQs[0].chapter;
    setMode("wrong");
    const idx = CURRENT.questions.findIndex(qq => qq.id === selectedQs[0].id);
    if (idx >= 0) CURRENT.idx = idx;
    render();
    CURRENT.aiOutput = batchText;
    const out = $("#ai-output");
    if (out) out.innerHTML = renderMarkdown(batchText);
  };
}

initAuth();
