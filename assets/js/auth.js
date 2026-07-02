"use strict";

// ============== Auth / account UI / preview ==============
function renderAuthUser() {
  const box = $("#auth-user");
  if (!box) return;
  if (!AUTH_USER) {
    box.innerHTML = "";
    return;
  }
  const totalQs = ALL_QUESTIONS.length;
  const answeredCount = Object.keys(STATE.attempted || {}).length;
  const wrongCount = Object.keys(STATE.wrong || {}).length;
  const favCount = Object.keys(STATE.favorite || {}).length;
  const correctCount = Math.max(0, answeredCount - wrongCount);
  const syncText = ($("#sync-status") && $("#sync-status").textContent) || "LOCAL";
  box.innerHTML =
    '<button class="header-action-btn" type="button" id="preview-open">题库预览</button>' +
    '<button class="header-action-btn" type="button" id="user-menu-toggle" aria-haspopup="menu" aria-expanded="false">账号 <strong>' + escHtml(AUTH_USER.username) + '</strong></button>' +
    '<div class="user-menu" id="user-menu" hidden>' +
      '<div class="user-menu-title">' + escHtml(AUTH_USER.username) + '</div>' +
      '<div class="user-menu-meta">当前账号 · 独立进度 · 自动同步</div>' +
      '<div class="user-menu-grid">' +
        '<div class="user-menu-stat"><strong>' + answeredCount + '</strong>已答</div>' +
        '<div class="user-menu-stat"><strong>' + correctCount + '</strong>做对</div>' +
        '<div class="user-menu-stat"><strong>' + favCount + '</strong>收藏</div>' +
      '</div>' +
      '<div class="user-menu-actions">' +
        '<button class="backup-btn" type="button" id="user-export-progress">导出记录</button>' +
        '<button class="backup-btn" type="button" id="user-import-progress">导入记录</button>' +
        '<button class="backup-btn" type="button" id="logout-btn">退出登录</button>' +
      '</div>' +
      '<div class="user-menu-meta" style="margin:10px 0 0;">题库 ' + totalQs + ' 题 · 错题 ' + wrongCount + ' · 同步 <span id="user-sync-status">' + escHtml(syncText) + '</span></div>' +
    '</div>';
  $("#preview-open").onclick = openQuestionPreview;
  const toggle = $("#user-menu-toggle");
  const menu = $("#user-menu");
  toggle.onclick = (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  menu.onclick = (e) => e.stopPropagation();
  $("#logout-btn").onclick = logout;
  $("#user-export-progress").onclick = exportProgress;
  $("#user-import-progress").onclick = () => {
    const input = $("#import-file");
    if (input) input.click();
  };
}

function closeUserMenu() {
  const menu = $("#user-menu");
  const toggle = $("#user-menu-toggle");
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function questionStatusClass(q) {
  if (isWrong(q.id)) return "wrong";
  if (isFav(q.id)) return "fav";
  if (STATE.attempted && STATE.attempted[q.id]) return "correct";
  return "todo";
}

function questionStatusLabel(q) {
  const cls = questionStatusClass(q);
  if (cls === "wrong") return "错题";
  if (cls === "fav") return "收藏";
  if (cls === "correct") return "做对";
  return "未做";
}

function openQuestionPreview() {
  const modal = $("#preview-modal");
  const body = $("#preview-body");
  const sub = $("#preview-sub");
  if (!modal || !body) return;
  if (!ALL_QUESTIONS.length) { toast("题库还没加载完"); return; }
  const answeredCount = Object.keys(STATE.attempted || {}).length;
  const wrongCount = Object.keys(STATE.wrong || {}).length;
  const favCount = Object.keys(STATE.favorite || {}).length;
  if (sub) sub.textContent = "共 " + ALL_QUESTIONS.length + " 题 · 已答 " + answeredCount + " · 错题 " + wrongCount + " · 收藏 " + favCount + "。点色块跳转到对应题目。";

  const keepByFilter = (q) => {
    const cls = questionStatusClass(q);
    return PREVIEW_FILTER === "all" || cls === PREVIEW_FILTER;
  };
  const books = getBooks();
  body.innerHTML = books.map(book => {
    const qsInBook = ALL_QUESTIONS.filter(q => q.book === book);
    const chapters = getChapters(book);
    const chapterHtml = chapters.map(([chapter, title]) => {
      const qsAll = qsInBook.filter(q => q.chapter === chapter);
      const qs = qsAll.filter(keepByFilter);
      if (!qs.length) return "";
      const cells = qs.map((q, idx) => {
        const cls = questionStatusClass(q);
        const active = CURRENT.questions[CURRENT.idx] && CURRENT.questions[CURRENT.idx].id === q.id ? " current" : "";
        const titleText = q.book + " 第 " + q.chapter + " 章 · " + (q.section || q.chapter_title || "") + " · " + questionStatusLabel(q);
        const originalIndex = qsAll.findIndex(item => item.id === q.id) + 1;
        return '<button class="preview-cell ' + cls + active + '" type="button" data-qid="' + escHtml(q.id) + '" title="' + escHtml(titleText) + '">' + originalIndex + '</button>';
      }).join("");
      return '<div class="preview-chapter">' +
        '<div class="preview-chapter-title">' +
          '<strong>第 ' + chapter + ' 章</strong>' +
          '<span class="preview-chapter-name">' + escHtml(title || "") + '</span>' +
          '<span class="preview-chapter-count">' + qs.length + (PREVIEW_FILTER === "all" ? " 题" : " / " + qsAll.length + " 题") + '</span>' +
        '</div>' +
        '<div class="preview-grid">' + cells + '</div>' +
      '</div>';
    }).join("");
    if (!chapterHtml) return "";
    return '<section class="preview-book">' +
      '<div class="preview-book-title">' + escHtml(book) + '<small>' + qsInBook.length + ' 题</small></div>' +
      chapterHtml +
    '</section>';
  }).join("");
  if (!body.innerHTML.trim()) {
    body.innerHTML = '<div class="empty">这个筛选下暂时没有题目</div>';
  }

  $$("#preview-body .preview-cell").forEach(btn => {
    btn.onclick = () => jumpToQuestion(btn.dataset.qid);
  });
  $$("#preview-filters .preview-filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.previewFilter === PREVIEW_FILTER);
    btn.onclick = () => {
      PREVIEW_FILTER = btn.dataset.previewFilter || "all";
      openQuestionPreview();
    };
  });
  modal.hidden = false;
}

function closeQuestionPreview() {
  const modal = $("#preview-modal");
  if (modal) modal.hidden = true;
}

function jumpToQuestion(qid) {
  const q = ALL_QUESTIONS.find(item => String(item.id) === String(qid));
  if (!q) return;
  CURRENT.book = q.book;
  localStorage.setItem("408-quiz-last-book", q.book);
  CURRENT.chapter = q.chapter;
  CURRENT.mode = "sequential";
  CURRENT.questions = buildQuestionList();
  let idx = CURRENT.questions.findIndex(item => String(item.id) === String(qid));
  if (idx < 0) {
    CURRENT.chapter = null;
    CURRENT.questions = buildQuestionList();
    idx = CURRENT.questions.findIndex(item => String(item.id) === String(qid));
  }
  CURRENT.idx = Math.max(0, idx);
  CURRENT.answers = {};
  resetAiPanel();
  closeQuestionPreview();
  closeUserMenu();
  render();
}

function setAuthMode(mode) {
  AUTH_MODE = mode;
  $("#auth-login-tab").classList.toggle("active", mode === "login");
  $("#auth-register-tab").classList.toggle("active", mode === "register");
  $("#auth-submit").textContent = mode === "login" ? "登录" : "注册并进入";
  $("#auth-password").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  const inviteField = $("#auth-invite-field");
  if (inviteField) inviteField.hidden = mode !== "register";
  $("#auth-error").textContent = "";
}

function bindAuthControls() {
  $("#auth-login-tab").onclick = () => setAuthMode("login");
  $("#auth-register-tab").onclick = () => setAuthMode("register");
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const username = $("#auth-username").value.trim();
    const password = $("#auth-password").value;
    const inviteCode = $("#auth-invite") ? $("#auth-invite").value.trim() : "";
    const submit = $("#auth-submit");
    const error = $("#auth-error");
    error.textContent = "";
    submit.disabled = true;
    try {
      const url = AUTH_MODE === "login" ? "/api/auth/login" : "/api/auth/register";
      const data = await apiJson(url, { method: "POST", body: JSON.stringify({ username, password, inviteCode }) });
      AUTH_USER = data.user;
      $("#auth-card").style.display = "none";
      renderAuthUser();
      await loadServerProgress();
      startAppAfterAuth();
      toast(AUTH_MODE === "login" ? "已登录" : "注册成功");
    } catch (err) {
      error.textContent = err.message || "操作失败";
    } finally {
      submit.disabled = false;
    }
  };
}

async function logout() {
  await pushServerProgress();
  await apiJson("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  AUTH_USER = null;
  AUTH_READY = false;
  SERVER_PROGRESS_LOADED = false;
  location.reload();
}

async function initAuth() {
  bindAuthControls();
  setAuthMode("login");
  try {
    const data = await apiJson("/api/auth/me");
    AUTH_USER = data.user || null;
  } catch {
    AUTH_USER = null;
  }
  if (!AUTH_USER) {
    $("#auth-card").style.display = "grid";
    setSyncStatus("LOGIN");
    return;
  }
  $("#auth-card").style.display = "none";
  renderAuthUser();
  await loadServerProgress();
  startAppAfterAuth();
}
