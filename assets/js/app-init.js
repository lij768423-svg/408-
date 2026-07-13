"use strict";

// ============== App boot ==============
function loadPersistedPreferences() {
  try {
    const instant = localStorage.getItem("408-quiz-instant");
    if (instant != null) CURRENT.instantGrade = JSON.parse(instant);
    const lim = localStorage.getItem("408-quiz-limit");
    if (lim != null) CURRENT.limit = parseInt(lim, 10) || 50;
    const aiCollapsed = localStorage.getItem(AI_RAIL_KEY);
    if (aiCollapsed != null) CURRENT.aiRailCollapsed = aiCollapsed !== "0";
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
  if (AUTH_API_AVAILABLE && typeof refreshAiStatus === "function") {
    refreshAiStatus();
  } else if (typeof AI_STATUS !== "undefined") {
    AI_STATUS = { enabled: false, model: "unavailable" };
  }
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
  $$(".guide-doc-nav [data-guide-target]").forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.guideTarget || "";
      const target = document.getElementById(targetId);
      if (!target) return;
      $$(".guide-doc-nav [data-guide-target]").forEach(item => item.classList.remove("is-active"));
      $$(".guide-doc-nav [data-guide-target]").forEach(item => item.setAttribute("aria-pressed", "false"));
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      $$(".guide-doc-section").forEach(section => {
        const isCurrent = section === target;
        section.hidden = !isCurrent;
        section.classList.toggle("is-active", isCurrent);
      });
    };
  });
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
        SEARCH_ACTIVE = Math.min(SEARCH_ACTIVE + 1, Math.min(SEARCH_RESULTS.length, 100) - 1);
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
        e.preventDefault();
        e.stopPropagation();
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
    searchModal.onkeydown = trapSearchFocus;
    searchModal.onclick = (e) => {
      if (e.target === searchModal) closeSearch();
    };
  }
  const searchClose = $("#search-close");
  if (searchClose) searchClose.onclick = () => closeSearch();
  // Ctrl+K / Cmd+K 打开搜索
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if ($("#search-modal") && !$("#search-modal").hidden) closeSearch();
      else openSearch();
    } else if (e.key === "Escape") {
      if ($("#search-modal") && !$("#search-modal").hidden) closeSearch();
    }
  });
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.type !== "408-quiz-enter-main") return;
  location.hash = "#/quiz";
  location.reload();
});

initAuth();
