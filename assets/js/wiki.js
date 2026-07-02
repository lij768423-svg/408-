"use strict";

// ============== Wiki save integration ==============
function buildWikiSavePayload(q, state) {
  const selected = state.selected && state.selected.length ? state.selected.join("、") : "未作答";
  const result = state.submitted
    ? (state.shown ? "查看答案" : (state.correct ? "正确" : "错误"))
    : "未提交";
  const options = ["A", "B", "C", "D"]
    .filter(L => q.options && q.options[L])
    .map(L => `${L}. ${plainText(q.options[L] || "")}`)
    .join("\n");
  const questionMarkdown = [
    plainText(q.question),
    options ? "\n## 选项\n" + options : ""
  ].join("\n").trim();
  const aiText = (CURRENT.aiOutput || "").trim();
  const explanationParts = [];
  if (q.explanation) explanationParts.push("## 题库解析\n" + plainText(q.explanation));
  if (aiText) explanationParts.push("## AI 讲解\n" + aiText);
  return {
    question_id: String(q.id || `${q.book}-${q.chapter}-${q.question || ""}`),
    attempt_id: `${q.id || "q"}-${Date.now()}`,
    source: "408-quiz-dev",
    title: `${q.book || "408"} 第${q.chapter || "?"}章 ${plainText(q.section || q.chapter_title || "错题")}`,
    subject: q.book,
    topic_tags: [q.section || q.chapter_title || "", result].filter(Boolean),
    question_markdown: questionMarkdown || plainText(q.question || ""),
    user_answer: `我的答案：${selected}\n正确答案：${(q.answer || []).join("、")}\n结果：${result}`,
    assistant_explanation: explanationParts.join("\n\n") || "待补充",
    mistakes: result === "错误" ? ["本题作答错误，需复盘题干限定条件与选项判断依据"] : [],
    takeaways: [plainText(q.explanation || aiText || "已保存本题复习记录").slice(0, 120)].filter(Boolean),
    status: result
  };
}

function safeHeaderToken(value, prefix = "quiz-408-dev") {
  const raw = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const asciiHint = raw.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${prefix}-${asciiHint || "q"}-${(hash >>> 0).toString(16)}`;
}

async function saveQuestionToWiki(q, state) {
  const payload = buildWikiSavePayload(q, state);
  const rawKey = `quiz-408-dev:${payload.question_id}:${payload.status}:${(state.selected || []).join("")}`;
  const key = safeHeaderToken(rawKey);
  const data = await apiJson("/api/wiki/save-question", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ payload })
  });
  return data;
}

async function copyText(text, okMsg = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast(okMsg);
  }
}

