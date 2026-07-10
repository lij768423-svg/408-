"use strict";

const assert = require("assert");
const { updateReviewRecord, nextReviewInterval, groupLearningMetrics, chapterPriority } = require("../assets/js/learning.js");

const now = new Date("2026-07-10T08:00:00Z").getTime();
let review = updateReviewRecord(null, false, now);
assert.equal(review.streak, 0);
assert.equal(review.intervalDays, 0);
assert.ok(review.dueAt <= now);
review = updateReviewRecord(review, true, now + 1000);
assert.equal(review.streak, 1);
assert.equal(review.intervalDays, 1);
review = updateReviewRecord(review, true, now + 2000);
assert.equal(review.streak, 2);
assert.equal(review.intervalDays, 3);
assert.deepEqual([1, 2, 3, 4, 5, 6].map(nextReviewInterval), [1, 3, 7, 14, 30, 60]);
assert.ok(chapterPriority({ total: 100, due: 20, accuracy: 50, attempted: 60, completion: 60, trend: -10 }) > 20);
global.STATE = {
  attempted: { q1: now }, wrong: {},
  reviews: { q1: { attempts: 1, correctCount: 3, history: [] } },
};
assert.equal(groupLearningMetrics([{ id: "q1" }], now).accuracy, 100);
console.log("learning scheduling OK");
