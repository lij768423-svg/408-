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
  const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9M9.5 19v-5h5v5"/></svg>';
  const previewIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>';
  const userIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>';
  box.innerHTML =
    '<div class="header-account-tools">' +
      '<button class="header-action-btn" type="button" id="home-landing-open">' + homeIcon + '<span>首页</span></button>' +
      '<button class="header-action-btn" type="button" id="preview-open">' + previewIcon + '<span>题库预览</span></button>' +
      '<button class="header-action-btn is-account" type="button" id="user-menu-toggle" aria-haspopup="menu" aria-expanded="false">' + userIcon + '<span>账号</span><strong>' + escHtml(AUTH_USER.username) + '</strong><i aria-hidden="true">⌄</i></button>' +
    '</div>' +
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
        '<button class="backup-btn" type="button" id="change-password-btn">更改密码</button>' +
        '<button class="backup-btn" type="button" id="logout-btn">退出登录</button>' +
      '</div>' +
      '<div class="user-menu-meta" style="margin:10px 0 0;">题库 ' + totalQs + ' 题 · 错题 ' + wrongCount + ' · 同步 <span id="user-sync-status">' + escHtml(syncText) + '</span></div>' +
    '</div>';
  $("#home-landing-open").onclick = openHomeLanding;
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
  $("#change-password-btn").onclick = openPasswordModal;
  $("#user-export-progress").onclick = exportProgress;
  $("#user-import-progress").onclick = () => {
    const input = $("#import-file");
    if (input) input.click();
  };
}

function openPasswordModal() {
  closeUserMenu();
  const modal = $("#password-modal");
  const form = $("#password-form");
  const message = $("#password-message");
  if (!modal || !form) return;
  form.reset();
  if (message) message.textContent = "";
  modal.hidden = false;
  setTimeout(() => $("#password-current")?.focus(), 0);
}

function closePasswordModal() {
  const modal = $("#password-modal");
  if (modal) modal.hidden = true;
}

async function submitPasswordChange(event) {
  event.preventDefault();
  const currentPassword = $("#password-current").value;
  const newPassword = $("#password-new").value;
  const confirmPassword = $("#password-confirm").value;
  const message = $("#password-message");
  const submit = $("#password-submit");
  if (newPassword !== confirmPassword) {
    message.textContent = "两次输入的新密码不一致";
    return;
  }
  if (currentPassword === newPassword) {
    message.textContent = "新密码不能与当前密码相同";
    return;
  }
  submit.disabled = true;
  message.textContent = "正在修改...";
  try {
    await apiJson("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    closePasswordModal();
    toast("密码已修改，其他设备已退出登录");
  } catch (error) {
    message.textContent = error.message || "密码修改失败";
  } finally {
    submit.disabled = false;
  }
}

function bindPasswordControls() {
  const modal = $("#password-modal");
  const form = $("#password-form");
  if (!modal || !form) return;
  form.onsubmit = submitPasswordChange;
  $("#password-close").onclick = closePasswordModal;
  $("#password-cancel").onclick = closePasswordModal;
  modal.onclick = (event) => {
    if (event.target === modal) closePasswordModal();
  };
}

function openHomeLanding() {
  closeUserMenu();
  const card = $("#auth-card");
  if (!card) return;
  const frame = card.querySelector(".auth-frame");
  if (frame) {
    const base = (frame.getAttribute("src") || "assets/auth/login-intro.html").split("?")[0];
    frame.setAttribute("src", base + "?v=20260710-1740&from=home&t=" + Date.now());
  }
  card.style.display = "grid";
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
  if (sub) sub.textContent = "共 " + ALL_QUESTIONS.length + " 题 · 已答 " + answeredCount + " · 错题 " + wrongCount + "。";

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
  const loginTab = $("#auth-login-tab");
  const registerTab = $("#auth-register-tab");
  const submitButton = $("#auth-submit");
  const password = $("#auth-password");
  const inviteField = $("#auth-invite-field");
  const modeNote = $("#auth-mode-note");
  const inlineNote = $("#auth-inline-note");
  const card = $("#auth-card");
  if (!loginTab || !registerTab || !submitButton || !password || !inviteField) return;
  AUTH_MODE = mode;
  loginTab.classList.toggle("active", mode === "login");
  registerTab.classList.toggle("active", mode === "register");
  submitButton.textContent = mode === "login" ? "登录并继续" : "注册并进入";
  password.setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  inviteField.hidden = mode !== "register";
  if (modeNote) {
    modeNote.textContent = mode === "login"
      ? "错题、收藏、已答记录和当前会话都会跟随账号同步。"
      : "创建独立账号后，刷题记录和个人知识库会自动归档到你的空间。";
  }
  if (inlineNote) {
    inlineNote.textContent = mode === "login"
      ? "已有账号直接登录。"
      : "前 20 个账号可直接注册，之后需要邀请码。";
  }
  if (card) card.dataset.authMode = mode;
  const error = $("#auth-error");
  if (error) error.textContent = "";
}

function bindAuthControls() {
  const loginTab = $("#auth-login-tab");
  const registerTab = $("#auth-register-tab");
  const form = $("#auth-form");
  if (!loginTab || !registerTab || !form) return false;
  loginTab.onclick = () => setAuthMode("login");
  registerTab.onclick = () => setAuthMode("register");
  form.onsubmit = async (e) => {
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
  return true;
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
  bindPasswordControls();
  const hasInlineAuth = bindAuthControls();
  if (hasInlineAuth) setAuthMode("login");
  let authApiAvailable = true;
  try {
    const data = await apiJson("/api/auth/me");
    AUTH_USER = data.user || null;
  } catch {
    authApiAvailable = false;
    AUTH_USER = null;
  }
  if (!authApiAvailable) {
    const authCard = $("#auth-card");
    if (authCard) authCard.style.display = "none";
    SERVER_PROGRESS_LOADED = false;
    setSyncStatus("LOCAL");
    startAppAfterAuth();
    return;
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
