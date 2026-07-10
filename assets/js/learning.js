"use strict";

const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];
const REVIEW_HISTORY_LIMIT = 80;

function emptyLearningState() {
  return {
    wrong: {},
    favorite: {},
    stats: { answered: 0, correct: 0 },
    attempted: {},
    sourceTags: {},
    aiHistory: {},
    reviews: {},
    dailyActivity: {},
  };
}

function normalizeLearningState(value, now = Date.now()) {
  const base = emptyLearningState();
  const input = value && typeof value === "object" ? value : {};
  const next = {
    ...base,
    ...input,
    wrong: input.wrong && typeof input.wrong === "object" ? input.wrong : {},
    favorite: input.favorite && typeof input.favorite === "object" ? input.favorite : {},
    attempted: input.attempted && typeof input.attempted === "object" ? input.attempted : {},
    sourceTags: input.sourceTags && typeof input.sourceTags === "object" ? input.sourceTags : {},
    aiHistory: input.aiHistory && typeof input.aiHistory === "object" ? input.aiHistory : {},
    reviews: input.reviews && typeof input.reviews === "object" ? input.reviews : {},
    dailyActivity: input.dailyActivity && typeof input.dailyActivity === "object" ? input.dailyActivity : {},
    stats: input.stats && typeof input.stats === "object" ? input.stats : { answered: 0, correct: 0 },
  };
  Object.keys(next.wrong).forEach((questionId) => {
    if (next.reviews[questionId]) return;
    const timestamp = Number(next.wrong[questionId]) || now;
    next.reviews[questionId] = {
      attempts: 1,
      correctCount: 0,
      wrongCount: 1,
      streak: 0,
      lastAnsweredAt: timestamp,
      lastCorrectAt: null,
      dueAt: now,
      intervalDays: 0,
      ease: 2.3,
      history: [{ at: timestamp, correct: false, shown: false, migrated: true }],
    };
  });
  return next;
}

function localDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addLocalDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  date.setHours(4, 0, 0, 0);
  return date.getTime();
}

function nextReviewInterval(streak) {
  return REVIEW_INTERVALS[Math.min(Math.max(streak - 1, 0), REVIEW_INTERVALS.length - 1)];
}

function updateReviewRecord(previous, correct, at = Date.now()) {
  const current = previous && typeof previous === "object" ? previous : {};
  const streak = correct ? (Number(current.streak) || 0) + 1 : 0;
  const intervalDays = correct ? nextReviewInterval(streak) : 0;
  const history = Array.isArray(current.history) ? current.history.slice(-(REVIEW_HISTORY_LIMIT - 1)) : [];
  history.push({ at, correct: !!correct, shown: false });
  return {
    attempts: (Number(current.attempts) || 0) + 1,
    correctCount: (Number(current.correctCount) || 0) + (correct ? 1 : 0),
    wrongCount: (Number(current.wrongCount) || 0) + (correct ? 0 : 1),
    streak,
    lastAnsweredAt: at,
    lastCorrectAt: correct ? at : (current.lastCorrectAt || null),
    dueAt: correct ? addLocalDays(at, intervalDays) : startOfLocalDay(at),
    intervalDays,
    ease: Math.max(1.3, Math.min(2.7, (Number(current.ease) || 2.3) + (correct ? 0.04 : -0.18))),
    history,
  };
}

function recordAnswerResult(question, correct, at = Date.now()) {
  if (!question || question.id == null) return null;
  STATE = normalizeLearningState(STATE, at);
  const questionId = String(question.id);
  const review = updateReviewRecord(STATE.reviews[questionId], correct, at);
  STATE.reviews[questionId] = review;
  STATE.attempted[questionId] = at;
  if (correct) {
    if (review.streak >= 2) delete STATE.wrong[questionId];
  } else {
    STATE.wrong[questionId] = at;
  }
  const dayKey = localDateKey(at);
  const activity = STATE.dailyActivity[dayKey] || { answered: 0, correct: 0, wrong: 0, questionIds: [] };
  activity.answered += 1;
  activity.correct += correct ? 1 : 0;
  activity.wrong += correct ? 0 : 1;
  activity.questionIds = Array.from(new Set([...(activity.questionIds || []), questionId])).slice(-200);
  STATE.dailyActivity[dayKey] = activity;
  STATE.stats.answered = Object.keys(STATE.attempted).length;
  STATE.stats.correct = Math.max(0, STATE.stats.answered - Object.keys(STATE.wrong).length);
  persist();
  return review;
}

function isReviewDue(questionId, now = Date.now()) {
  const review = STATE.reviews && STATE.reviews[String(questionId)];
  return !!(review && Number(review.dueAt) <= now);
}

function dueReviewQuestions(questions, now = Date.now()) {
  return (questions || [])
    .filter((question) => isReviewDue(question.id, now))
    .sort((left, right) => {
      const a = STATE.reviews[String(left.id)] || {};
      const b = STATE.reviews[String(right.id)] || {};
      return (Number(a.dueAt) || 0) - (Number(b.dueAt) || 0)
        || (Number(b.wrongCount) || 0) - (Number(a.wrongCount) || 0)
        || (Number(a.streak) || 0) - (Number(b.streak) || 0)
        || (Number(a.lastAnsweredAt) || 0) - (Number(b.lastAnsweredAt) || 0);
    });
}

function dateKeysBetween(days, now = Date.now(), offsetDays = 0) {
  const keys = [];
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() - offsetDays - days + 1);
  cursor.setHours(12, 0, 0, 0);
  for (let index = 0; index < days; index += 1) {
    keys.push(localDateKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function activitySummary(dailyActivity, days = 7, now = Date.now(), offsetDays = 0) {
  return dateKeysBetween(days, now, offsetDays).reduce((summary, key) => {
    const day = dailyActivity && dailyActivity[key] || {};
    summary.answered += Number(day.answered) || 0;
    summary.correct += Number(day.correct) || 0;
    summary.wrong += Number(day.wrong) || 0;
    return summary;
  }, { answered: 0, correct: 0, wrong: 0 });
}

function questionRecentStats(questionId, now = Date.now(), days = 7, offsetDays = 0) {
  const review = STATE.reviews && STATE.reviews[String(questionId)];
  const history = review && Array.isArray(review.history) ? review.history : [];
  const end = addLocalDays(startOfLocalDay(now), -offsetDays + 1);
  const start = addLocalDays(startOfLocalDay(now), -(offsetDays + days - 1));
  return history.reduce((summary, event) => {
    const at = Number(event.at) || 0;
    if (at < start || at >= end) return summary;
    summary.answered += 1;
    summary.correct += event.correct ? 1 : 0;
    return summary;
  }, { answered: 0, correct: 0 });
}

function groupLearningMetrics(questions, now = Date.now()) {
  const total = (questions || []).length;
  let attempted = 0;
  let wrong = 0;
  let due = 0;
  let lifetimeAttempts = 0;
  let lifetimeCorrect = 0;
  let recentAnswered = 0;
  let recentCorrect = 0;
  let previousAnswered = 0;
  let previousCorrect = 0;
  (questions || []).forEach((question) => {
    const questionId = String(question.id);
    if (STATE.attempted && STATE.attempted[questionId]) attempted += 1;
    if (STATE.wrong && STATE.wrong[questionId]) wrong += 1;
    if (isReviewDue(questionId, now)) due += 1;
    const review = STATE.reviews && STATE.reviews[questionId];
    lifetimeAttempts += Number(review && review.attempts) || 0;
    lifetimeCorrect += Number(review && review.correctCount) || 0;
    const recent = questionRecentStats(questionId, now, 7, 0);
    const previous = questionRecentStats(questionId, now, 7, 7);
    recentAnswered += recent.answered;
    recentCorrect += recent.correct;
    previousAnswered += previous.answered;
    previousCorrect += previous.correct;
  });
  const accuracy = lifetimeAttempts ? Math.max(0, Math.min(100, Math.round(lifetimeCorrect / lifetimeAttempts * 100))) : 0;
  const recentAccuracy = recentAnswered ? Math.round(recentCorrect / recentAnswered * 100) : null;
  const previousAccuracy = previousAnswered ? Math.round(previousCorrect / previousAnswered * 100) : null;
  return {
    total,
    attempted,
    wrong,
    due,
    completion: total ? Math.round(attempted / total * 100) : 0,
    accuracy,
    recentAnswered,
    recentAccuracy,
    previousAccuracy,
    trend: recentAccuracy != null && previousAccuracy != null ? recentAccuracy - previousAccuracy : 0,
  };
}

function chapterPriority(metrics) {
  if (!metrics || !metrics.total) return 0;
  const dueRatio = metrics.due / metrics.total;
  const errorRatio = metrics.accuracy ? 1 - metrics.accuracy / 100 : (metrics.attempted ? 0.5 : 0.2);
  const incompleteRatio = 1 - metrics.completion / 100;
  const declineRatio = Math.max(0, -(metrics.trend || 0)) / 100;
  return Math.round((dueRatio * 0.35 + errorRatio * 0.30 + incompleteRatio * 0.20 + declineRatio * 0.15) * 1000) / 10;
}

function consecutiveStudyDays(dailyActivity, now = Date.now()) {
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  for (let index = 0; index < 365; index += 1) {
    const activity = dailyActivity && dailyActivity[localDateKey(cursor.getTime())];
    if (!activity || !(Number(activity.answered) > 0)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

if (typeof STATE !== "undefined") {
  STATE = normalizeLearningState(STATE);
  saveState(STATE);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REVIEW_INTERVALS,
    normalizeLearningState,
    localDateKey,
    startOfLocalDay,
    addLocalDays,
    nextReviewInterval,
    updateReviewRecord,
    activitySummary,
    groupLearningMetrics,
    chapterPriority,
  };
}
