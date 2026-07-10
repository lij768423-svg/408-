"use strict";

// ============== API / server progress helpers ==============
async function apiJson(url, options = {}) {
  const resp = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "HTTP " + resp.status);
  return data;
}

function emptyProgress() {
  return {
    state: emptyLearningState(),
    session: null,
    preferences: {}
  };
}

function normalizeProgress(progress) {
  const base = emptyProgress();
  if (!progress || typeof progress !== "object") return base;
  return {
    state: normalizeLearningState(progress.state),
    session: progress.session || null,
    preferences: progress.preferences || {},
  };
}

function setSyncStatus(text) {
  const el = $("#sync-status");
  if (el) el.textContent = text;
  const userEl = $("#user-sync-status");
  if (userEl) userEl.textContent = text;
}

function scheduleServerSync() {
  if (!AUTH_USER || !AUTH_READY || !SERVER_PROGRESS_LOADED) return;
  setSyncStatus("SYNCING");
  clearTimeout(SYNC_TIMER);
  SYNC_TIMER = setTimeout(pushServerProgress, 500);
}

async function pushServerProgress() {
  if (!AUTH_USER || SYNC_IN_FLIGHT) return;
  SYNC_IN_FLIGHT = true;
  try {
    await apiJson("/api/progress", {
      method: "PUT",
      body: JSON.stringify({ progress: getProgressPayload() }),
    });
    setSyncStatus("SAVED");
  } catch (e) {
    console.warn("progress sync failed", e);
    setSyncStatus("SYNC FAIL");
  } finally {
    SYNC_IN_FLIGHT = false;
  }
}

async function loadServerProgress() {
  const data = await apiJson("/api/progress");
  const progress = normalizeProgress(data.progress);
  STATE = progress.state;
  saveState(STATE);
  if (progress.session) localStorage.setItem(SESSION_KEY, JSON.stringify(progress.session));
  if (progress.preferences) {
    if (progress.preferences.imageVisible != null) {
      imgVisible = progress.preferences.imageVisible !== false;
      localStorage.setItem(IMG_VIS_KEY, imgVisible ? "1" : "0");
    }
    if (progress.preferences.panelOpen != null) {
      panelOpen = progress.preferences.panelOpen !== false;
      localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
    }
    if (Number.isFinite(progress.preferences.limit)) {
      CURRENT.limit = parseInt(progress.preferences.limit, 10) || CURRENT.limit;
      localStorage.setItem("408-quiz-limit", String(CURRENT.limit));
    }
    if (progress.preferences.instantGrade != null) {
      CURRENT.instantGrade = !!progress.preferences.instantGrade;
      localStorage.setItem("408-quiz-instant", JSON.stringify(CURRENT.instantGrade));
    }
    if (progress.preferences.lastBook) {
      localStorage.setItem("408-quiz-last-book", String(progress.preferences.lastBook));
    }
  }
  SERVER_PROGRESS_LOADED = true;
  setSyncStatus(data.progress ? "SAVED" : "NEW");
  if (!data.progress) scheduleServerSync();
}

function getProgressPayload() {
  return {
    state: STATE,
    session: getSessionSnapshot(),
    preferences: {
      imageVisible: imgVisible,
      panelOpen,
      instantGrade: CURRENT.instantGrade,
      limit: CURRENT.limit,
      lastBook: localStorage.getItem("408-quiz-last-book") || "",
      aiRailCollapsed: !!CURRENT.aiRailCollapsed,
    },
    savedAt: new Date().toISOString()
  };
}
