"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const questions = data.questions;
const errors = [];

function fail(message) {
  errors.push(message);
}

function markdownImageRefs(text) {
  const refs = [];
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    refs.push(match[1].trim().replace(/^<|>$/g, "").split(/[?#]/)[0]);
  }
  return refs;
}

if (!Array.isArray(questions)) {
  fail("data.questions must be an array");
} else {
  const stats = {};
  const seenIds = new Set();

  for (const [index, q] of questions.entries()) {
    const label = q && q.id ? q.id : `question[${index}]`;

    if (!q || typeof q !== "object") {
      fail(`${label}: must be an object`);
      continue;
    }

    for (const field of ["id", "book", "chapter", "section", "num", "type", "question", "options", "answer", "explanation"]) {
      if (q[field] === undefined || q[field] === null || q[field] === "") {
        fail(`${label}: missing ${field}`);
      }
    }

    if (seenIds.has(q.id)) fail(`${label}: duplicate id`);
    seenIds.add(q.id);

    stats[q.book] = (stats[q.book] || 0) + 1;

    if (!["single_choice", "multiple_choice"].includes(q.type)) {
      fail(`${label}: unsupported type ${q.type}`);
    }

    if (!q.options || typeof q.options !== "object" || Array.isArray(q.options)) {
      fail(`${label}: options must be an object`);
    }

    if (!Array.isArray(q.answer) || q.answer.length === 0) {
      fail(`${label}: answer must be a non-empty array`);
    } else if (q.options && typeof q.options === "object") {
      for (const answer of q.answer) {
        if (!Object.prototype.hasOwnProperty.call(q.options, answer)) {
          fail(`${label}: answer ${answer} is not present in options`);
        }
      }
      if (q.type === "single_choice" && q.answer.length !== 1) {
        fail(`${label}: single_choice must have exactly one answer`);
      }
    }

    const imageRefs = [
      ...markdownImageRefs(q.question),
      ...markdownImageRefs(q.explanation),
      ...Object.values(q.options || {}).flatMap(markdownImageRefs),
    ];
    for (const ref of imageRefs) {
      if (/^(?:https?:|data:)/i.test(ref)) continue;
      if (!fs.existsSync(path.join(root, ref))) {
        fail(`${label}: missing image ${ref}`);
      }
    }
  }

  if (data.total !== questions.length) {
    fail(`data.total ${data.total} does not match questions.length ${questions.length}`);
  }

  if (JSON.stringify(data.stats || {}) !== JSON.stringify(stats)) {
    fail(`data.stats does not match actual counts: ${JSON.stringify(stats)}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`data.json OK: ${questions.length} questions`);
