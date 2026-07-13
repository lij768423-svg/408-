"use strict";

let DASHBOARD_CHAPTER_FILTER = "priority";
let DASHBOARD_CHAPTER_SORT = "priority";
let DASHBOARD_SHOW_ALL = false;
const DASHBOARD_VISIBLE_ROWS = 8;

function dashboardPercent(value) {
  return `${Math.max(0, Math.min(100, Math.round(Number(value) || 0)))}%`;
}

function closeDashboardHelp() {
  const button = $("#dashboard-help-button");
  const popover = $("#dashboard-help-popover");
  if (popover) popover.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function bindDashboardHelp() {
  const button = $("#dashboard-help-button");
  const popover = $("#dashboard-help-popover");
  if (!button || !popover || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  button.onclick = (event) => {
    event.stopPropagation();
    const open = popover.hidden;
    popover.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  };
  popover.onclick = (event) => event.stopPropagation();
  document.addEventListener("click", closeDashboardHelp);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDashboardHelp();
  });
}

function dashboardTrend(metrics) {
  if (!metrics || metrics.recentAccuracy == null || metrics.previousAccuracy == null) {
    return '<span class="dashboard-trend is-neutral">暂无对比</span>';
  }
  const value = metrics.trend || 0;
  const cls = value > 0 ? "is-up" : value < 0 ? "is-down" : "is-neutral";
  const symbol = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return `<span class="dashboard-trend ${cls}">${symbol} ${Math.abs(value)}%</span>`;
}

function dashboardChapterRows(now = Date.now()) {
  const rows = [];
  getBooks().forEach((book) => {
    getChapters(book).forEach(([chapter, chapterTitle]) => {
      const questions = ALL_QUESTIONS.filter(q => q.book === book && q.chapter === chapter);
      const metrics = groupLearningMetrics(questions, now);
      rows.push({ book, chapter, chapterTitle, metrics, priority: chapterPriority(metrics) });
    });
  });
  return rows;
}

function dashboardRecommendationReason(row) {
  const reasons = [];
  if (row.metrics.due) reasons.push(`${row.metrics.due} 道到期`);
  if (row.metrics.wrong) reasons.push(`${row.metrics.wrong} 道当前错题`);
  if (row.metrics.trend < 0) reasons.push(`近 7 日下降 ${Math.abs(row.metrics.trend)}%`);
  if (row.metrics.completion < 60) reasons.push(`完成度 ${row.metrics.completion}%`);
  return reasons.slice(0, 2).join(" · ") || "继续建立章节样本";
}

function dashboardActivityHtml(now = Date.now()) {
  return dateKeysBetween(14, now).map((key) => {
    const activity = STATE.dailyActivity[key] || {};
    const answered = Number(activity.answered) || 0;
    const height = answered ? Math.max(14, Math.min(100, answered * 7)) : 4;
    const label = key.slice(5).replace("-", "/");
    return `<div class="dashboard-day" title="${escHtml(key)} · ${answered} 题">
      <div class="dashboard-day-bar"><i style="height:${height}%"></i></div>
      <span>${escHtml(label)}</span>
    </div>`;
  }).join("");
}

function startDashboardReview(book = null, chapter = null) {
  CURRENT.book = book;
  CURRENT.chapter = chapter;
  CURRENT.mode = "review";
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  location.hash = "#/quiz";
  render();
  if (!CURRENT.questions.length) toast("这个范围今天没有到期题目");
}

function startDashboardChapter(row) {
  if (!row) return;
  if (row.metrics.due) {
    startDashboardReview(row.book, row.chapter);
    return;
  }
  CURRENT.book = row.book;
  CURRENT.chapter = row.chapter;
  CURRENT.mode = row.metrics.wrong ? "wrong" : "unattempted";
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  location.hash = "#/quiz";
  render();
}

function startDashboardDiagnostic() {
  CURRENT.book = null;
  CURRENT.chapter = null;
  CURRENT.mode = "random";
  CURRENT.questions = shuffle(ALL_QUESTIONS).slice(0, 20);
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  location.hash = "#/quiz";
  render();
}

function filterDashboardRows(rows) {
  if (DASHBOARD_CHAPTER_FILTER === "due") return rows.filter(row => row.metrics.due > 0);
  if (DASHBOARD_CHAPTER_FILTER === "wrong") return rows.filter(row => row.metrics.wrong > 0);
  if (DASHBOARD_CHAPTER_FILTER === "all") return rows.slice();
  return rows.filter(row => row.metrics.attempted > 0 || row.metrics.due > 0 || row.metrics.wrong > 0);
}

function sortDashboardRows(rows) {
  const sorted = rows.slice();
  if (DASHBOARD_CHAPTER_SORT === "completion") {
    return sorted.sort((a, b) => a.metrics.completion - b.metrics.completion || b.priority - a.priority);
  }
  if (DASHBOARD_CHAPTER_SORT === "accuracy") {
    return sorted.sort((a, b) => {
      if (!a.metrics.attempted && b.metrics.attempted) return 1;
      if (a.metrics.attempted && !b.metrics.attempted) return -1;
      return a.metrics.accuracy - b.metrics.accuracy || b.priority - a.priority;
    });
  }
  if (DASHBOARD_CHAPTER_SORT === "due") {
    return sorted.sort((a, b) => b.metrics.due - a.metrics.due || b.priority - a.priority);
  }
  return sorted.sort((a, b) => b.priority - a.priority || b.metrics.due - a.metrics.due || a.book.localeCompare(b.book, "zh-CN") || a.chapter - b.chapter);
}

function renderDashboard() {
  bindDashboardHelp();
  const content = $("#dashboard-content");
  if (!content || !DATA_READY || !ALL_QUESTIONS.length) return;
  STATE = normalizeLearningState(STATE);
  const now = Date.now();
  const today = STATE.dailyActivity[localDateKey(now)] || {};
  const totalMetrics = groupLearningMetrics(ALL_QUESTIONS, now);
  const dueCount = dueReviewQuestions(ALL_QUESTIONS, now).length;
  const rows = dashboardChapterRows(now);
  const hasLearningData = totalMetrics.attempted > 0;
  const recommendations = rows
    .filter(row => row.metrics.attempted || row.metrics.due || row.metrics.wrong)
    .sort((a, b) => b.priority - a.priority || b.metrics.due - a.metrics.due)
    .slice(0, 3);
  const subjects = getBooks().map((book) => ({
    book,
    metrics: groupLearningMetrics(ALL_QUESTIONS.filter(q => q.book === book), now),
  }));
  const filteredRows = sortDashboardRows(filterDashboardRows(rows));
  const visibleRows = DASHBOARD_SHOW_ALL ? filteredRows : filteredRows.slice(0, DASHBOARD_VISIBLE_ROWS);
  const summaryHtml = `
    <div class="dashboard-summary-grid">
      <article><span>今日已答</span><strong>${Number(today.answered) || 0}</strong><small>正确 ${Number(today.correct) || 0} · 错误 ${Number(today.wrong) || 0}</small></article>
      <article><span>今日正确率</span><strong>${today.answered ? Math.round(today.correct / today.answered * 100) : 0}%</strong></article>
      <article><span>待复习</span><strong>${dueCount}</strong></article>
      <article><span>覆盖进度</span><strong>${totalMetrics.completion}%</strong><small>${totalMetrics.attempted} / ${totalMetrics.total} 题</small></article>
      <article><span>连续学习</span><strong>${consecutiveStudyDays(STATE.dailyActivity, now)}</strong></article>
    </div>`;

  if (!hasLearningData) {
    content.innerHTML = `${summaryHtml}
      <section class="dashboard-card dashboard-onboarding">
        <div>
          <span class="dashboard-kicker">FIRST SIGNAL</span>
          <h3>先做 20 道随机诊断题</h3>
          <p>建立第一组答题样本后，仪表盘会开始推荐优先复习章节，并显示正确率、错题和复习计划。</p>
        </div>
        <button class="btn btn-primary btn-accent" type="button" id="dashboard-start-diagnostic">开始诊断</button>
      </section>`;
  } else {
    content.innerHTML = `${summaryHtml}

    <div class="dashboard-main-grid">
      <section class="dashboard-card dashboard-activity-card">
        <div class="dashboard-card-head"><div><span>最近 14 天</span><h3>学习节奏</h3></div></div>
        <div class="dashboard-activity">${dashboardActivityHtml(now)}</div>
      </section>
      <section class="dashboard-card dashboard-priority-card">
        <div class="dashboard-card-head"><div><span>今日建议</span><h3>优先复习章节</h3></div></div>
        <div class="dashboard-priority-list">
          ${recommendations.length ? recommendations.map((row, index) => `
            <button type="button" data-dashboard-priority="${index}">
              <b>0${index + 1}</b>
              <span><strong>${escHtml(row.book)} · ${escHtml(row.chapterTitle || `第 ${row.chapter} 章`)}</strong><small>${escHtml(dashboardRecommendationReason(row))}</small></span>
              <i>${row.priority}</i>
            </button>`).join("") : '<div class="dashboard-empty">完成几道题后，这里会出现更准确的优先建议。</div>'}
        </div>
      </section>
    </div>

    <section class="dashboard-card">
      <div class="dashboard-card-head"><div><span>科目分布</span><h3>掌握度概览</h3></div></div>
      <div class="dashboard-subject-grid">
        ${subjects.map(({ book, metrics }) => `<article>
          <div class="dashboard-subject-title"><strong>${escHtml(book)}</strong>${dashboardTrend(metrics)}</div>
          <div class="dashboard-metric-line"><span>完成度</span><b>${metrics.completion}%</b></div>
          <div class="dashboard-progress"><i style="width:${dashboardPercent(metrics.completion)}"></i></div>
          <div class="dashboard-subject-stats"><span>正确率 <b>${metrics.accuracy}%</b></span><span>错题 <b>${metrics.wrong}</b></span><span>待复习 <b>${metrics.due}</b></span></div>
        </article>`).join("")}
      </div>
    </section>

    <section class="dashboard-card dashboard-table-card">
      <div class="dashboard-card-head dashboard-chapter-head">
        <div><span>按需展开</span><h3>章节明细</h3></div>
        <div class="dashboard-chapter-controls">
          <div class="dashboard-filter-group" role="group" aria-label="章节范围">
            <button type="button" data-dashboard-filter="priority" aria-pressed="${DASHBOARD_CHAPTER_FILTER === "priority"}">重点章节</button>
            <button type="button" data-dashboard-filter="due" aria-pressed="${DASHBOARD_CHAPTER_FILTER === "due"}">待复习</button>
            <button type="button" data-dashboard-filter="wrong" aria-pressed="${DASHBOARD_CHAPTER_FILTER === "wrong"}">有错题</button>
            <button type="button" data-dashboard-filter="all" aria-pressed="${DASHBOARD_CHAPTER_FILTER === "all"}">全部章节</button>
          </div>
          <label class="dashboard-sort-label">排序
            <select id="dashboard-chapter-sort">
              <option value="priority"${DASHBOARD_CHAPTER_SORT === "priority" ? " selected" : ""}>推荐优先级</option>
              <option value="due"${DASHBOARD_CHAPTER_SORT === "due" ? " selected" : ""}>待复习数量</option>
              <option value="accuracy"${DASHBOARD_CHAPTER_SORT === "accuracy" ? " selected" : ""}>正确率最低</option>
              <option value="completion"${DASHBOARD_CHAPTER_SORT === "completion" ? " selected" : ""}>完成度最低</option>
            </select>
          </label>
        </div>
      </div>
      <div class="dashboard-table-wrap"><table class="dashboard-table">
        <thead><tr><th>章节</th><th>完成度</th><th>正确率</th><th>错题</th><th>待复习</th><th>7 日变化</th><th></th></tr></thead>
        <tbody>${visibleRows.length ? visibleRows.map((row, index) => `<tr>
          <td><strong>${escHtml(row.book)}</strong><span>${escHtml(row.chapterTitle || `第 ${row.chapter} 章`)}</span></td>
          <td><div class="dashboard-cell-progress"><i style="width:${dashboardPercent(row.metrics.completion)}"></i></div><b>${row.metrics.completion}%</b></td>
          <td>${row.metrics.accuracy}%</td><td>${row.metrics.wrong}</td><td>${row.metrics.due}</td><td>${dashboardTrend(row.metrics)}</td>
          <td><button type="button" data-dashboard-row="${index}" aria-label="开始练习 ${escHtml(row.book)} ${escHtml(row.chapterTitle || `第 ${row.chapter} 章`)}">练习</button></td>
        </tr>`).join("") : '<tr><td class="dashboard-table-empty" colspan="7">当前筛选下没有章节记录，可以切换到“全部章节”继续浏览。</td></tr>'}</tbody>
      </table></div>
      <div class="dashboard-table-footer">
        <span>显示 ${visibleRows.length} / ${filteredRows.length} 章</span>
        ${filteredRows.length > DASHBOARD_VISIBLE_ROWS ? `<button type="button" id="dashboard-toggle-all">${DASHBOARD_SHOW_ALL ? "收起" : `查看全部 ${filteredRows.length} 章`}</button>` : ""}
      </div>
    </section>`;
  }

  const reviewButton = $("#dashboard-start-review");
  if (reviewButton) {
    reviewButton.disabled = dueCount === 0;
    reviewButton.textContent = dueCount ? `开始今日复习 · ${Math.min(dueCount, CURRENT.reviewLimit)} 题` : "今天已清空";
    reviewButton.onclick = () => startDashboardReview();
  }
  const diagnosticButton = $("#dashboard-start-diagnostic");
  if (diagnosticButton) diagnosticButton.onclick = startDashboardDiagnostic;
  $$('[data-dashboard-priority]').forEach((button) => {
    button.onclick = () => startDashboardChapter(recommendations[Number(button.dataset.dashboardPriority)]);
  });
  $$('[data-dashboard-row]').forEach((button) => {
    button.onclick = () => startDashboardChapter(visibleRows[Number(button.dataset.dashboardRow)]);
  });
  $$('[data-dashboard-filter]').forEach((button) => {
    button.onclick = () => {
      DASHBOARD_CHAPTER_FILTER = button.dataset.dashboardFilter || "priority";
      DASHBOARD_SHOW_ALL = false;
      renderDashboard();
    };
  });
  const sortSelect = $("#dashboard-chapter-sort");
  if (sortSelect) sortSelect.onchange = () => {
    DASHBOARD_CHAPTER_SORT = sortSelect.value || "priority";
    DASHBOARD_SHOW_ALL = false;
    renderDashboard();
  };
  const toggleAll = $("#dashboard-toggle-all");
  if (toggleAll) toggleAll.onclick = () => {
    DASHBOARD_SHOW_ALL = !DASHBOARD_SHOW_ALL;
    renderDashboard();
  };
}
