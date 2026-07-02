"use strict";

// ============== 数据 ==============
let ALL_QUESTIONS = [];  // 全部题目
let CURRENT = {
  book: null,           // 当前选中的书(null = 全部书)
  chapter: null,        // 当前选中的章节(num), null = 全部
  mode: "sequential",   // sequential | random | wrong | favorite
  instantGrade: false,  // true = 点击选项立即判分
  limit: 50,            // 全部模式下一组题数
  questions: [],        // 当前题单
  idx: 0,               // 当前题号
  answers: {},          // qid -> { selected: [A,B], correct: bool, time: ts }
  aiOpen: false,        // 当前题 AI 助手是否展开(保留兼容,实际由 aiRailCollapsed 控制)
  aiRailCollapsed: false, // 右侧 AI 栏是否被手动折叠
  aiCfgOpen: false,     // AI 配置区是否展开
  aiOutput: "",         // AI 助手当前输出
};

// 答题反馈闪光:记录"上一次触发 flash 的题 id",切到新题/重渲染时不再误触
let LAST_FLASHED_QID = null;
let FLASH_TIMER = null;

// ============== 账号 / 服务端进度 ==============
let AUTH_USER = null;
let AUTH_MODE = "login";
let AUTH_READY = false;
let SERVER_PROGRESS_LOADED = false;
let SYNC_TIMER = null;
let SYNC_IN_FLIGHT = false;
let PREVIEW_FILTER = "all";


// ============== localStorage / progress state ==============
const LS_KEY = "408-quiz-v1";
const SESSION_KEY = "408-quiz-session-v1";
let DATA_READY = false;
let RESTORING_SESSION = false;
function loadState() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return JSON.parse(s);
  } catch (e) { console.warn("LS load error", e); }
  return { wrong: {}, favorite: {}, stats: { answered: 0, correct: 0 }, attempted: {}, sourceTags: {}, aiHistory: {} };
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  catch (e) { console.warn("LS save error", e); }
}
let STATE = loadState();

function getSessionSnapshot() {
  return {
    book: CURRENT.book,
    chapter: CURRENT.chapter,
    mode: CURRENT.mode,
    instantGrade: CURRENT.instantGrade,
    limit: CURRENT.limit,
    idx: CURRENT.idx,
    answers: CURRENT.answers,
    questionIds: CURRENT.questions.map(q => q.id),
    savedAt: new Date().toISOString()
  };
}

function saveSession() {
  if (!DATA_READY || RESTORING_SESSION) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(getSessionSnapshot()));
  } catch (e) {
    console.warn("Session save error", e);
  }
}

function loadSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.warn("Session load error", e);
    return null;
  }
}

function restoreSession() {
  const session = loadSession();
  if (!session || !ALL_QUESTIONS.length) return false;
  const books = getBooks();
  RESTORING_SESSION = true;
  try {
    CURRENT.book = session.book == null
      ? null
      : (books.includes(session.book) ? session.book : books[0]);
    CURRENT.chapter = Number.isFinite(session.chapter) ? session.chapter : null;
    CURRENT.mode = ["sequential", "random", "wrong", "favorite", "unattempted"].includes(session.mode)
      ? session.mode
      : (CURRENT.book == null ? "random" : "sequential");
    CURRENT.instantGrade = !!session.instantGrade;
    CURRENT.limit = parseInt(session.limit, 10) || CURRENT.limit;
    CURRENT.answers = session.answers && typeof session.answers === "object" ? session.answers : {};
    if (Array.isArray(session.questionIds) && session.questionIds.length) {
      const byId = new Map(ALL_QUESTIONS.map(q => [q.id, q]));
      CURRENT.questions = session.questionIds.map(id => byId.get(id)).filter(Boolean);
    }
    if (!CURRENT.questions.length) CURRENT.questions = buildQuestionList();
    CURRENT.idx = Math.min(Math.max(parseInt(session.idx, 10) || 0, 0), CURRENT.questions.length);
    return true;
  } finally {
    RESTORING_SESSION = false;
  }
}

function resetAiPanel() {
  // 切题/换章节/换模式时:只清空旧的输出(避免把 Q1 的讲解混到 Q2),
  // 保留面板的展开状态——ai-context 会随模板自动刷新到新题的题源/状态。
  CURRENT.aiOutput = "";
  // 切到新题:清掉旧题的 flash 标志,让新题"从已答 → 再答"时还能闪一次
  LAST_FLASHED_QID = null;
}

function addWrong(qid) { STATE.wrong[qid] = Date.now(); persist(); }
function removeWrong(qid) { delete STATE.wrong[qid]; persist(); }
function isWrong(qid) { return !!STATE.wrong[qid]; }
function toggleFav(qid) {
  if (STATE.favorite[qid]) delete STATE.favorite[qid];
  else STATE.favorite[qid] = Date.now();
  persist();
}
function isFav(qid) { return !!STATE.favorite[qid]; }

// ============== Image visibility toggle ==============
const IMG_VIS_KEY = "408-quiz-img-vis";
let imgVisible = localStorage.getItem(IMG_VIS_KEY) !== "0"; // default: shown
const EYE_SVG = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF_SVG = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

function applyImgVis() {
  const stem = document.querySelector("#quiz-area .q-stem");
  if (stem) stem.classList.toggle("imgs-hidden", !imgVisible);
  const btn = document.querySelector("#quiz-area .img-toggle");
  if (btn) {
    btn.classList.toggle("is-off", !imgVisible);
    btn.setAttribute("aria-pressed", imgVisible ? "true" : "false");
    btn.title = imgVisible ? "收起题图" : "展开题图";
    const svg = btn.querySelector("svg");
    if (svg) svg.innerHTML = imgVisible ? EYE_SVG : EYE_OFF_SVG;
  }
}

// === Control panel: collapse / expand ===
const PANEL_KEY = "408-quiz-control-panel";
function applyPanel() {
  // sidebar 始终展开,收起按钮已移除
}
let panelOpen = localStorage.getItem(PANEL_KEY) !== "0";
function persist() {
  saveState(STATE);
  scheduleServerSync();
}

// 刷新题库 = 全部进度归零(错题 + 已答 + 正确率),收藏保留
function resetProgress() {
  const wrongN = Object.keys(STATE.wrong).length;
  const answeredN = Object.keys(STATE.attempted).length;
  if (wrongN === 0 && answeredN === 0) { toast("还没有答题记录,无需刷新"); return; }
  if (!confirm(`确定要刷新题库(进度归零)吗?\n\n· 错题集:将清空 ${wrongN} 题\n· 已答记录:将清空 ${answeredN} 题(已答过的不再出现于「未做」模式)\n· 正确率:将归零为 —\n· 当前题面会回到第 1 题,已勾选的选项清空\n· 收藏不受影响`)) return;
  STATE.wrong = {};
  STATE.attempted = {};
  STATE.stats = { answered: 0, correct: 0 };
  persist();
  // 本轮题面与已选项也一起回到第 1 题
  CURRENT.idx = 0;
  CURRENT.answers = {};
  resetAiPanel();
  // 如果当前在"错题 / 未做"模式,题单语义会变(错题被清,未做变成全部),→ 切到"顺序"模式避免空屏/误判
  if (CURRENT.mode === "wrong" || CURRENT.mode === "unattempted") setMode("sequential");
  else render();
  saveSession();
  toast(`已刷新题库 · 错题 ${wrongN} / 已答 ${answeredN} 已清空`);
}

function markAttempted(qid) {
  STATE.attempted[qid] = Date.now();
}

// ============== 备份 / 恢复 ==============
function getBackupPayload() {
  return {
    app: "408-quiz",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: STATE,
    session: getSessionSnapshot(),
    preferences: {
      imageVisible: imgVisible,
      panelOpen,
      instantGrade: CURRENT.instantGrade,
      limit: CURRENT.limit
    }
  };
}

function exportProgress() {
  const payload = getBackupPayload();
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `408-quiz-progress-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("学习记录已导出");
}

function importProgressFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ""));
      if (payload.app !== "408-quiz" || !payload.state) {
        toast("这不是 408 刷题记录文件");
        return;
      }
      if (!confirm("导入后会覆盖当前错题、收藏、统计和本轮进度。确定继续吗?")) return;
      STATE = {
        wrong: payload.state.wrong || {},
        favorite: payload.state.favorite || {},
        stats: payload.state.stats || { answered: 0, correct: 0 },
        attempted: payload.state.attempted || {}
      };
      saveState(STATE);
      if (payload.session) localStorage.setItem(SESSION_KEY, JSON.stringify(payload.session));
      if (payload.preferences) {
        imgVisible = payload.preferences.imageVisible !== false;
        panelOpen = payload.preferences.panelOpen !== false;
        localStorage.setItem(IMG_VIS_KEY, imgVisible ? "1" : "0");
        localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
        if (Number.isFinite(payload.preferences.limit)) {
          localStorage.setItem("408-quiz-limit", String(payload.preferences.limit));
        }
        localStorage.setItem("408-quiz-instant", JSON.stringify(!!payload.preferences.instantGrade));
      }
      scheduleServerSync();
      toast("学习记录已导入");
      setTimeout(() => location.reload(), 450);
    } catch (e) {
      toast("导入失败: JSON 格式不正确");
    }
  };
  reader.readAsText(file);
}

function bindBackupControls() {
  const exportBtn = document.getElementById("export-progress");
  const importBtn = document.getElementById("import-progress");
  const importFile = document.getElementById("import-file");
  if (exportBtn) exportBtn.onclick = exportProgress;
  if (importBtn && importFile) importBtn.onclick = () => importFile.click();
  if (importFile) {
    importFile.onchange = () => {
      importProgressFile(importFile.files && importFile.files[0]);
      importFile.value = "";
    };
  }
  const previewClose = document.getElementById("preview-close");
  const previewModal = document.getElementById("preview-modal");
  if (previewClose) previewClose.onclick = closeQuestionPreview;
  if (previewModal) {
    previewModal.onclick = (e) => {
      if (e.target === previewModal) closeQuestionPreview();
    };
  }
}

