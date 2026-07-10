"use strict";

function getBooks() {
  // 按指定顺序
  return ["操作系统", "数据结构", "计算机组成原理", "计算机网络"]
    .filter(b => ALL_QUESTIONS.some(q => q.book === b));
}

function getChapters(book) {
  const set = new Map();
  ALL_QUESTIONS.filter(q => q.book === book).forEach(q => {
    if (!set.has(q.chapter)) set.set(q.chapter, q.chapter_title);
  });
  return Array.from(set.entries()).sort((a, b) => a[0] - b[0]);
}

function buildQuestionList() {
  let qs;
  if (CURRENT.book == null) {
    // 全部题
    qs = ALL_QUESTIONS.slice();
  } else {
    qs = ALL_QUESTIONS.filter(q => q.book === CURRENT.book);
    if (CURRENT.chapter != null) qs = qs.filter(q => q.chapter === CURRENT.chapter);
  }
  if (CURRENT.mode === "random") qs = shuffle(qs);
  else if (CURRENT.mode === "wrong") qs = qs.filter(q => isWrong(q.id));
  else if (CURRENT.mode === "favorite") qs = qs.filter(q => isFav(q.id));
  else if (CURRENT.mode === "unattempted") qs = qs.filter(q => !STATE.attempted[q.id]);
  // 全部模式下,默认限制题数
  if (CURRENT.book == null && CURRENT.mode !== "wrong" && CURRENT.mode !== "favorite") {
    qs = qs.slice(0, CURRENT.limit);
  }
  return qs;
}

function setMode(mode) {
  CURRENT.mode = mode;
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  render();
}

function setChapter(ch) {
  CURRENT.chapter = ch;
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  render();
}

function setBook(b) {
  CURRENT.book = b;
  if (b) localStorage.setItem("408-quiz-last-book", b);
  CURRENT.chapter = null;
  // 切到"全部"自动转 random 模式
  if (b == null) {
    CURRENT.mode = "random";
  }
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  render();
}

function nextBatch() {
  // 全部模式下,出下一组随机题
  CURRENT.questions = buildQuestionList();
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  render();
}

function toggleInstantGrade() {
  CURRENT.instantGrade = !CURRENT.instantGrade;
  localStorage.setItem("408-quiz-instant", JSON.stringify(CURRENT.instantGrade));
  scheduleServerSync();
  render();
}

// ============== 渲染 ==============
function render() {
  renderHeader();
  renderAuthUser();
  renderBookTabs();
  renderChapterSel();
  renderModeTabs();
  renderQuiz();
  renderWeakPanel();  // Feature 1
}

function closeChapterMenu() {
  [
    ["#chapter-picker", "#chapter-trigger", "#chapter-menu"],
    ["#limit-picker", "#limit-trigger", "#limit-menu"]
  ].forEach(([pickerSel, triggerSel, menuSel]) => {
    const picker = $(pickerSel);
    const trigger = $(triggerSel);
    const menu = $(menuSel);
    if (!picker || !trigger || !menu) return;
    picker.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  });
}

document.addEventListener("click", () => {
  closeChapterMenu();
  closeUserMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeChapterMenu();
    closeUserMenu();
    closeQuestionPreview();
  }
});

function renderHeader() {
  const totalQs = ALL_QUESTIONS.length;
  // 从权威源派生:已答(去重过的题目 ID 数)、错题、正确率 = (已答 - 当前错题) / 已答
  // 避免 STATE.stats.answered 累加计数器因重复作答而漂移
  const answeredCount = Object.keys(STATE.attempted).length;
  const wrongCount = Object.keys(STATE.wrong).length;
  const correctCount = Math.max(0, answeredCount - wrongCount);
  const correctRate = answeredCount > 0 ? Math.round(correctCount / answeredCount * 100) : 0;
  // 同步回计数器(防止后续代码读到漂移值)并持久化
  if (STATE.stats.answered !== answeredCount || STATE.stats.correct !== correctCount) {
    STATE.stats.answered = answeredCount;
    STATE.stats.correct = correctCount;
    persist();
  }
  $("#header-stats").innerHTML = `
    <span>题库 <strong>${totalQs}</strong></span>
    <span>已答 <strong>${answeredCount}</strong></span>
    <span>正确率 <strong>${correctRate}%</strong></span>
    <span>错题 <strong>${wrongCount}</strong></span>
  `;
}

function renderBookTabs() {
  const books = getBooks();
  if (CURRENT.book && !books.includes(CURRENT.book)) CURRENT.book = books[0];
  // "全部" entry 在最前
  const allCount = ALL_QUESTIONS.length;
  const allEntry = `<button class="book-entry ${CURRENT.book == null ? "active" : ""}" data-book="__all__" type="button">
    <span class="be-name">全部</span>
    <span class="be-count">${allCount} 题</span>
  </button>`;
  const bookEntries = books.map(b => {
    const count = ALL_QUESTIONS.filter(q => q.book === b).length;
    return `<button class="book-entry ${b === CURRENT.book ? "active" : ""}" data-book="${escHtml(b)}" type="button">
      <span class="be-name">${escHtml(b)}</span>
      <span class="be-count">${count}</span>
    </button>`;
  }).join("");
  $("#book-tabs").innerHTML = allEntry + bookEntries;
  $$("#book-tabs .book-entry").forEach(el => {
    el.onclick = () => {
      const v = el.dataset.book;
      setBook(v === "__all__" ? null : v);
    };
  });
}

function renderChapterSel() {
  const box = $("#chapter-select");
  if (!box) return;
  if (CURRENT.book == null) {
    box.innerHTML = `
      <div class="chapter-picker is-disabled">
        <button class="chapter-trigger" type="button" disabled>全部章节 (跨 ${getBooks().length} 本书)</button>
      </div>`;
    return;
  }
  const chapters = getChapters(CURRENT.book);
  const totalAll = chapters.reduce((s, [n]) =>
    s + ALL_QUESTIONS.filter(q => q.book === CURRENT.book && q.chapter === n).length, 0);
  const items = [{ value: "", label: "全部章节", count: `${totalAll} 题` }]
    .concat(chapters.map(([num, title]) => ({
      value: String(num),
      label: `第 ${num} 章 ${title}`,
      count: ALL_QUESTIONS.filter(q => q.book === CURRENT.book && q.chapter === num).length
    })));
  const active = items.find(it => it.value === (CURRENT.chapter == null ? "" : String(CURRENT.chapter))) || items[0];
  box.innerHTML = `
    <div class="chapter-picker" id="chapter-picker">
      <button class="chapter-trigger" id="chapter-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span>${escHtml(active.label)} (${escHtml(String(active.count))})</span>
      </button>
      <div class="chapter-menu" id="chapter-menu" role="listbox" hidden>
        ${items.map(it => `
          <button class="chapter-item ${it.value === active.value ? "active" : ""}" type="button" role="option" aria-selected="${it.value === active.value ? "true" : "false"}" data-chapter="${escHtml(it.value)}">
            <span>${escHtml(it.label)}</span><span class="chapter-item-count">${escHtml(String(it.count))}</span>
          </button>
        `).join("")}
      </div>
    </div>`;

  const picker = $("#chapter-picker");
  const trigger = $("#chapter-trigger");
  const menu = $("#chapter-menu");
  const setOpen = (open) => {
    picker.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
  };
  trigger.onclick = (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  };
  menu.onclick = (e) => e.stopPropagation();
  $$("#chapter-menu .chapter-item").forEach(el => {
    el.onclick = () => {
      const v = el.dataset.chapter;
      setChapter(v === "" ? null : parseInt(v, 10));
    };
  });
  trigger.onkeydown = (e) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(menu.hidden);
    }
  };
}

function renderModeTabs() {
  // 全部模式下,只显示 顺序/随机 (因为跨书,顺序没意义 -> 用 random)
  // 单书模式下显示 顺序/随机/错题/收藏/未做
  const wrongCount = CURRENT.book
    ? ALL_QUESTIONS.filter(q => q.book === CURRENT.book && (CURRENT.chapter == null || q.chapter === CURRENT.chapter) && isWrong(q.id)).length
    : 0;
  const favCount = CURRENT.book
    ? ALL_QUESTIONS.filter(q => q.book === CURRENT.book && (CURRENT.chapter == null || q.chapter === CURRENT.chapter) && isFav(q.id)).length
    : 0;
  const unattemptedCount = CURRENT.book
    ? ALL_QUESTIONS.filter(q => q.book === CURRENT.book && (CURRENT.chapter == null || q.chapter === CURRENT.chapter) && !STATE.attempted[q.id]).length
    : 0;
  const modes = [];
  if (CURRENT.book != null) modes.push({ id: "sequential", label: "顺序" });
  modes.push({ id: "random", label: "随机" });
  if (CURRENT.book != null) {
    modes.push({ id: "wrong", label: "错题", badge: wrongCount });
    modes.push({ id: "favorite", label: "收藏", badge: favCount });
    modes.push({ id: "unattempted", label: "未做", badge: unattemptedCount });
  }
  // 全部模式下的题量调节
  let limitCtrl = "";
  if (CURRENT.book == null) {
    const limits = [20, 50, 100, 200];
    limitCtrl = `
      <div class="chapter-picker limit-picker" id="limit-picker">
        <button class="chapter-trigger limit-trigger mode-btn" id="limit-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span>每刷 ${CURRENT.limit} 题</span>
        </button>
        <div class="chapter-menu limit-menu" id="limit-menu" role="listbox" hidden>
          ${limits.map(n => `
            <button class="chapter-item ${CURRENT.limit === n ? "active" : ""}" type="button" role="option" aria-selected="${CURRENT.limit === n ? "true" : "false"}" data-limit="${n}">
              <span>每刷 ${n} 题</span>
            </button>
          `).join("")}
        </div>
      </div>`;
  }
  // 即时判分开关
  const instantCtrl = `<button id="instant-toggle" class="mode-btn ${CURRENT.instantGrade ? "active" : ""}" title="点击选项立即判分">即时判分</button>`;
  // 刷新题库(进度归零:错题 + 已答 + 正确率)按钮 — 收藏保留
  const resetCtrl = `<button id="reset-wrong" class="mode-btn mode-btn-danger" title="刷新题库:清空错题 + 已答 + 正确率(收藏保留)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>刷新题库</button>`;
  $("#mode-tabs").innerHTML = modes.map(m =>
    `<button class="mode-btn ${m.id === CURRENT.mode ? "active" : ""}" data-mode="${m.id}">${m.label}${m.badge != null && m.badge > 0 ? `<span class="badge">${m.badge}</span>` : ""}</button>`
  ).join("");
  const extras = $("#mode-extras");
  if (extras) extras.innerHTML = limitCtrl + instantCtrl + resetCtrl;
  $$("#mode-tabs .mode-btn[data-mode]").forEach(el => {
    el.onclick = () => setMode(el.dataset.mode);
  });
  const limitPicker = $("#limit-picker");
  const limitTrigger = $("#limit-trigger");
  const limitMenu = $("#limit-menu");
  if (limitPicker && limitTrigger && limitMenu) {
    const setLimitOpen = (open) => {
      limitPicker.classList.toggle("is-open", open);
      limitTrigger.setAttribute("aria-expanded", open ? "true" : "false");
      limitMenu.hidden = !open;
    };
    limitTrigger.onclick = (e) => {
      e.stopPropagation();
      setLimitOpen(limitMenu.hidden);
    };
    limitTrigger.onkeydown = (e) => {
      if (e.key === "Escape") setLimitOpen(false);
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setLimitOpen(limitMenu.hidden);
      }
    };
    limitMenu.onclick = (e) => e.stopPropagation();
    $$("#limit-menu .chapter-item").forEach(el => {
      el.onclick = () => {
        CURRENT.limit = parseInt(el.dataset.limit, 10);
        localStorage.setItem("408-quiz-limit", String(CURRENT.limit));
        CURRENT.questions = buildQuestionList();
        CURRENT.idx = 0;
        CURRENT.answers = {};
        resetAiPanel();
        render();
      };
    });
  }
  const limitSel = document.querySelector("#limit-sel");
  if (limitSel) {
    limitSel.onchange = (e) => {
      CURRENT.limit = parseInt(e.target.value, 10);
      localStorage.setItem("408-quiz-limit", String(CURRENT.limit));
      CURRENT.questions = buildQuestionList();
      CURRENT.idx = 0;
      CURRENT.answers = {};
      resetAiPanel();
      render();
    };
  }
  const instantBtn = document.querySelector("#instant-toggle");
  if (instantBtn) instantBtn.onclick = () => toggleInstantGrade();
  const resetBtn = document.querySelector("#reset-wrong");
  if (resetBtn) resetBtn.onclick = () => resetProgress();
}

function renderQuiz() {
  const area = $("#quiz-area");
  const qs = CURRENT.questions;
  if (qs.length === 0) {
    let emptyMsg = "该章节暂无题目";
    if (CURRENT.mode === "wrong") emptyMsg = "当前没有错题";
    else if (CURRENT.mode === "favorite") emptyMsg = "还没有收藏的题";
    else if (CURRENT.mode === "unattempted") emptyMsg = "本章节已全部做过，可切到顺序 / 随机继续。";
    area.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    const rail = $("#ai-rail"); if (rail) rail.innerHTML = "";
    syncSession();
    return;
  }
  // 全部模式做完一组
  if (CURRENT.idx >= qs.length) {
    area.innerHTML = `
      <div class="empty">
        <div style="font-size: 18px; margin-bottom: 12px;">本组 ${qs.length} 题完成</div>
        <button class="btn btn-primary btn-accent" id="btn-next-batch">下一组 ${qs.length} 题</button>
        <button class="btn btn-ghost" id="btn-review" style="margin-left: 8px;">重新做这组</button>
      </div>
    `;
    const rail = $("#ai-rail"); if (rail) rail.innerHTML = "";
    $("#btn-next-batch").onclick = () => nextBatch();
    $("#btn-review").onclick = () => { CURRENT.idx = 0; CURRENT.answers = {}; resetAiPanel(); render(); };
    syncSession();
    return;
  }
  if (CURRENT.idx < 0) CURRENT.idx = 0;

  const q = qs[CURRENT.idx];
  const state = CURRENT.answers[q.id] || { selected: [], submitted: false };
  const isMulti = q.type === "multiple_choice";
  const instant = CURRENT.instantGrade;

  area.innerHTML = `
    <div class="q-meta">
      <span class="q-pos">
        <span class="q-pos-num-wrap">
          <span class="q-pos-handwritten-prefix">Q.</span><span class="q-pos-handwritten">${CURRENT.idx + 1}</span>
        </span>
        <span class="q-pos-total">/ ${qs.length}</span>
      </span>
      <span class="q-source">${renderSourceTag(q)}${escHtml(q.book)} · ${escHtml(q.chapter_title)} · ${escHtml(q.section)}${isMulti ? " · 多选" : ""}</span>
      <button class="img-toggle" type="button" id="imgToggle" aria-pressed="true" title="收起 / 展开题图">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span class="img-toggle-label">图</span>
      </button>
    </div>
    <div class="q-stem-wrap">
      <div class="q-stem">${formatContent(q.question)}</div>
    </div>
    <div class="options" id="opts">
      ${["A", "B", "C", "D"].map(L => {
        const text = q.options[L] || "";
        let cls = "option";
        if (state.submitted) {
          cls += " disabled";
          if (q.answer.includes(L)) cls += " correct";
          else if (state.selected.includes(L)) cls += " wrong";
        } else if (state.selected.includes(L)) {
          cls += " selected";
        }
        return `<div class="${cls}" data-letter="${L}">
          <span class="opt-letter">${L}</span>
          <span class="opt-text">${formatContent(text)}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="actions">
      ${!state.submitted
        ? (instant && !isMulti)
          ? `<span class="action-hint">即时判分已开</span>
             <button class="btn btn-ghost action-spacer" id="btn-skip">跳过</button>`
          : instant && isMulti
          ? `<button class="btn btn-primary btn-accent" id="btn-submit">提交 (${state.selected.length || 0}/${q.answer.length})</button>
             <button class="btn btn-ghost" id="btn-skip">跳过</button>
             <span class="action-hint action-spacer">多选题：错选即判错，选全即判对</span>`
          : `<button class="btn btn-primary btn-accent" id="btn-submit">提交${isMulti ? " (多选)" : ""}</button>
             <button class="btn btn-ghost" id="btn-skip">跳过</button>
             <button class="btn btn-ghost action-spacer" id="btn-show">显示答案</button>`
        : `<button class="btn btn-primary btn-accent" id="btn-next">下一题 →</button>`}
      <button class="btn btn-fav ${isFav(q.id) ? "active" : ""}" id="btn-fav">${isFav(q.id) ? "★ 已收藏" : "☆ 收藏"}</button>
    </div>
    <div class="feedback ${state.submitted ? "show" : ""} ${state.submitted ? (state.shown ? "info" : (state.correct ? "correct" : "wrong")) : ""}" id="fb">
      ${state.submitted ? `
        <div class="fb-head"><span class="status-pill ${state.shown ? "" : (state.correct ? "correct" : "wrong")}">${state.shown ? "已查看答案" : (state.correct ? "正确" : "错误")}</span></div>
        <div class="fb-answer">正确答案: <strong>${q.answer.join("、")}</strong>${state.selected.length ? ` · 你的答案: ${state.selected.join("、")}${state.shown ? " (仅供参考)" : ""}` : ""}</div>
        <div class="fb-expl">${formatContent(q.explanation)}</div>
      ` : ""}
    </div>
    <div class="actions actions-secondary">
      <button class="btn btn-ghost" id="btn-prev">← 上一题</button>
      <button class="btn btn-ghost action-spacer" id="btn-next2">下一题 →</button>
    </div>
  `;

  // 单独渲染右侧 AI 栏(始终展开,折叠/抽屉态由 .ai-rail class 控制)
  renderAiPanel(q, state);

  function selectAnswer(L) {
    const cur = CURRENT.answers[q.id] || { selected: [], submitted: false };
    if (cur.submitted) return;
    let sel = cur.selected.slice();
    if (isMulti) {
      if (sel.includes(L)) sel = sel.filter(x => x !== L);
      else sel.push(L);
    } else {
      sel = [L];
    }
    // 即时判分
    if (instant) {
      if (!isMulti) {
        // 单选:点完立即判
        CURRENT.answers[q.id] = { selected: sel, submitted: false };  // 暂时不 submitted,等 grade 完
        autoGrade(q, sel);
        return;
      } else {
        // 多选:
        //  - 选了错误选项 → 立即判错
        //  - 选完所有正确答案 → 立即判对
        //  - 否则:只更新 selected,等用户继续选
        const correctSet = new Set(q.answer);
        const isCorrectSoFar = sel.length > 0 &&
          sel.every(x => correctSet.has(x)) &&
          sel.length === q.answer.length;
        const hasWrong = sel.some(x => !correctSet.has(x));
        if (hasWrong || isCorrectSoFar) {
          autoGrade(q, sel);
          return;
        }
        CURRENT.answers[q.id] = { ...cur, selected: sel };
        renderQuiz();
        return;
      }
    }
    // 普通模式
    CURRENT.answers[q.id] = { ...cur, selected: sel };
    renderQuiz();
  }

  // 绑定事件
  if (!state.submitted) {
    $$("#opts .option").forEach(el => {
      el.onclick = () => {
        selectAnswer(el.dataset.letter);
      };
    });
    const submitBtn = document.querySelector("#btn-submit");
    if (submitBtn) submitBtn.onclick = () => submit();
    const skipBtn = document.querySelector("#btn-skip");
    if (skipBtn) skipBtn.onclick = () => goNext();
    const showBtn = document.querySelector("#btn-show");
    if (showBtn) showBtn.onclick = () => showAnswer();
  } else {
    $("#btn-next").onclick = () => goNext();
  }
  $("#btn-prev").onclick = () => goPrev();
  $("#btn-next2").onclick = () => goNext();
  $("#btn-fav").onclick = () => { toggleFav(q.id); render(); };
  // Feature 5: 真题/自编题标签点击切换
  $$(".q-source-tag").forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const qid = el.dataset.qid;
      toggleSourceTag(qid);
      render();
    };
  });
  // AI 面板在右侧栏独立渲染,bindAiPanel 由 renderAiPanel 内部调用
  $("#imgToggle").onclick = () => {
    imgVisible = !imgVisible;
    localStorage.setItem(IMG_VIS_KEY, imgVisible ? "1" : "0");
    applyImgVis();
  };
  const panelToggle = $("#panelToggle");
  if (panelToggle) panelToggle.onclick = () => {
    // 收起按钮已移除,handler 保留为 noop
  };

  syncSession();
  applyImgVis();
  applyPanel();
}

function autoGrade(q, sel) {
  // 即时判分:更新 state + 统计
  const correct = arraysEqual([...sel].sort(), [...q.answer].sort());
  const state = { selected: sel, submitted: true, correct, shown: false };
  CURRENT.answers[q.id] = state;
  markAttempted(q.id);
  STATE.stats.answered += 1;
  if (correct) {
    STATE.stats.correct += 1;
    removeWrong(q.id);
  } else {
    addWrong(q.id);
  }
  persist();
  // 如果是最后一题,自动推进到 batch 完成屏
  if (CURRENT.idx === CURRENT.questions.length - 1) {
    CURRENT.idx = CURRENT.questions.length;
  }
  render();
  flashCard(q.id, correct ? "correct" : "wrong");
}

function syncSession() {
  saveSession();
  scheduleServerSync();
}

// 答题反馈闪光:答对 bloom(纸面轻拍),答错 shake(纸面轻震),查看答案 bloom(中性轻拍)
// 题面左线同步切换为 success / error / primary,题卡本体一次性动画后回归常态
function flashCard(qid, kind) {
  // 同一题重复触发(切回来查看已答题)不重复闪,避免视觉骚扰
  if (LAST_FLASHED_QID === qid) return;
  LAST_FLASHED_QID = qid;
  if (FLASH_TIMER) clearTimeout(FLASH_TIMER);
  const area = $("#quiz-area");
  const stem = area && area.querySelector(".q-stem");
  if (!area || !stem) return;
  const stemCls = kind === "correct" ? "flash-correct" : (kind === "wrong" ? "flash-wrong" : "flash-info");
  stem.classList.remove("flash-correct", "flash-wrong", "flash-info");
  stem.classList.add(stemCls);
  FLASH_TIMER = setTimeout(() => {
    stem.classList.remove(stemCls);
  }, 900);
  area.classList.remove("bloom");
  area.classList.add("bloom");
  setTimeout(() => area.classList.remove("bloom"), 600);
}

function plainText(htmlish) {
  const box = document.createElement("div");
  box.innerHTML = String(htmlish || "");
  return box.textContent.replace(/\s+/g, " ").trim();
}

function getQuestionContext(q, state, extra = "") {
  const selected = state && state.selected && state.selected.length
    ? state.selected.join("、")
    : "尚未选择";
  const lines = [
    "# 408 刷题上下文",
    "",
    `- 题源: ${q.book}`,
    `- 章节: 第 ${q.chapter} 章 ${q.chapter_title}`,
    `- 小节: ${q.section || "—"}`,
    `- 题型: ${q.type === "multiple_choice" ? "多选题" : "单选题"}`,
    `- 当前选择: ${selected}`,
    `- 正确答案: ${q.answer.join("、")}`,
    "",
    "## 题目",
    plainText(q.question),
    "",
    "## 选项",
    ...["A", "B", "C", "D"].map(L => `${L}. ${plainText(q.options[L] || "")}`),
    "",
    "## 解析",
    plainText(q.explanation || "暂无解析")
  ];
  if (extra) {
    lines.push("", "## 我的追问", extra);
  }
  return lines.join("\n");
}

function buildAiIntro(q, state) {
  const status = state.selected && state.selected.length
    ? `你当前选了 ${state.selected.join("、")}。`
    : "你还没有选择答案。";
  return [
    "已加载本题上下文。",
    status,
    "可以让我先讲解思路，也可以复制完整上下文继续追问，或保存到知识库。"
  ].join("\n");
}

function buildAiExplanation(q, state) {
  const answerLine = `这题答案是 ${q.answer.join("、")}。`;
  const typeLine = q.type === "multiple_choice"
    ? "这是多选题，先判断每个选项是否独立成立，再看是否存在互斥项。"
    : "这是单选题，先抓题干限定词，再排除明显不符合定义或条件的选项。";
  const expl = plainText(q.explanation || "");
  return [
    answerLine,
    typeLine,
    "",
    expl ? `题库解析：${expl}` : "题库暂时没有解析，可以把上下文复制给 Claudian 继续追问。"
  ].join("\n");
}

function buildMistakeReview(q, state) {
  const selected = state.selected && state.selected.length ? state.selected : [];
  const wrongPicked = selected.filter(x => !q.answer.includes(x));
  const missed = q.answer.filter(x => !selected.includes(x));
  const parts = [];
  if (!selected.length) parts.push("你还没选答案。建议先凭第一判断做一次，再看错因分析。");
  if (wrongPicked.length) parts.push(`可能误选：${wrongPicked.join("、")}。回到题干限定条件，检查这些选项是否偷换概念或范围过大。`);
  if (missed.length) parts.push(`可能漏选：${missed.join("、")}。多选题尤其要检查“成立但不显眼”的选项。`);
  if (!wrongPicked.length && !missed.length && selected.length) parts.push("你的选择和答案一致。可以把重点放在复述解题依据，而不是只记答案。");
  parts.push("", `正确答案：${q.answer.join("、")}`);
  return parts.join("\n");
}

function buildKnowledgeNote(q, state) {
  const selected = state.selected && state.selected.length ? state.selected.join("、") : "未作答";
  const result = state.submitted
    ? (state.shown ? "查看答案" : (state.correct ? "正确" : "错误"))
    : "未提交";
  return [
    "---",
    "type: 408错题",
    `book: ${q.book}`,
    `chapter: ${q.chapter}`,
    `section: ${q.section || q.chapter_title}`,
    `result: ${result}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    "---",
    "",
    `# ${q.book} 第 ${q.chapter} 章错题`,
    "",
    "## 题目",
    plainText(q.question),
    "",
    "## 选项",
    ...["A", "B", "C", "D"].map(L => `- ${L}. ${plainText(q.options[L] || "")}`),
    "",
    "## 作答",
    `- 我的答案：${selected}`,
    `- 正确答案：${q.answer.join("、")}`,
    `- 结果：${result}`,
    "",
    "## 解析",
    plainText(q.explanation || "待补充"),
    "",
    "## 下次复习提醒",
    "- [ ] 复述题干考点",
    "- [ ] 解释每个干扰项为什么不选"
  ].join("\n");
}
