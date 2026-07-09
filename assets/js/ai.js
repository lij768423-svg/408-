"use strict";

// ============== AI panel / server AI helpers ==============
function setAiOutput(text) {
  CURRENT.aiOutput = text;
  const out = $("#ai-output");
  if (out) {
    out.innerHTML = renderMarkdown(text);
    scrollAiToBottom(true);
  }
}

let AI_RENDER_TIMER = null;
let AI_RENDER_PENDING = false;
let AI_STREAM_RAF = 0;
let AI_STREAM_TARGET = "";
let AI_STREAM_VISIBLE = "";
let AI_AUTO_SCROLL = true;
const AI_BOTTOM_THRESHOLD = 48;

function getAiOutputArea() {
  const out = $("#ai-output");
  return out ? out.closest(".ai-output-area") : null;
}

function isAiNearBottom(area = getAiOutputArea()) {
  if (!area) return true;
  return area.scrollHeight - area.scrollTop - area.clientHeight <= AI_BOTTOM_THRESHOLD;
}

function bindAiOutputScrollState() {
  const area = getAiOutputArea();
  if (!area || area.dataset.aiScrollBound === "1") return;
  area.dataset.aiScrollBound = "1";
  area.addEventListener("scroll", () => {
    AI_AUTO_SCROLL = isAiNearBottom(area);
  }, { passive: true });
}

function scrollAiToBottom(force = false) {
  const area = getAiOutputArea();
  const out = $("#ai-output");
  if (area) {
    if (force || AI_AUTO_SCROLL || isAiNearBottom(area)) {
      area.scrollTop = area.scrollHeight;
      AI_AUTO_SCROLL = true;
    }
  } else if (out && out.scrollIntoView) {
    out.scrollIntoView({ block: "end", inline: "nearest" });
  }
}

function renderAiStreamFrame(force = false) {
  const out = $("#ai-output");
  if (!out) return;
  const area = getAiOutputArea();
  const shouldStickToBottom = force || AI_AUTO_SCROLL || isAiNearBottom(area);
  const previousScrollTop = area ? area.scrollTop : 0;
  const targetText = AI_STREAM_TARGET || CURRENT.aiOutput || "";

  if (force) {
    AI_STREAM_VISIBLE = targetText;
  } else if (AI_STREAM_VISIBLE.length < targetText.length) {
    const backlog = targetText.length - AI_STREAM_VISIBLE.length;
    const step = Math.min(backlog, Math.max(2, Math.min(72, Math.ceil(backlog * 0.28))));
    AI_STREAM_VISIBLE += targetText.slice(AI_STREAM_VISIBLE.length, AI_STREAM_VISIBLE.length + step);
  }

  out.innerHTML = renderMarkdown(AI_STREAM_VISIBLE) + '<span class="ai-cursor">▍</span>';
  if (shouldStickToBottom) {
    scrollAiToBottom(true);
  } else if (area) {
    area.scrollTop = previousScrollTop;
  }
  AI_RENDER_PENDING = false;
  if (force && AI_RENDER_TIMER) {
    clearTimeout(AI_RENDER_TIMER);
    AI_RENDER_TIMER = null;
  }
  if (AI_STREAM_VISIBLE.length < targetText.length) scheduleAiStreamRender();
}

function scheduleAiStreamRender() {
  if (AI_RENDER_PENDING) return;
  AI_RENDER_PENDING = true;
  AI_STREAM_RAF = requestAnimationFrame(() => {
    AI_STREAM_RAF = 0;
    renderAiStreamFrame(false);
  });
}

// 流式输出:累积原始 Markdown,节流渲染整段,避免长输出每个 token 重排卡住。
// 光标用 <span class="ai-cursor">▍</span> 渲染在末尾。
function startAiStream() {
  CURRENT.aiOutput = "";
  AI_STREAM_TARGET = "";
  AI_STREAM_VISIBLE = "";
  AI_AUTO_SCROLL = true;
  if (AI_RENDER_TIMER) {
    clearTimeout(AI_RENDER_TIMER);
    AI_RENDER_TIMER = null;
  }
  if (AI_STREAM_RAF) {
    cancelAnimationFrame(AI_STREAM_RAF);
    AI_STREAM_RAF = 0;
  }
  AI_RENDER_PENDING = false;
  const out = $("#ai-output");
  if (out) {
    out.innerHTML = '<span class="ai-cursor">▍</span>';
    out.classList.add("is-streaming");
    bindAiOutputScrollState();
    scrollAiToBottom(true);
  }
}
function appendAiDelta(delta) {
  if (!delta) return;
  AI_STREAM_TARGET += delta;
  CURRENT.aiOutput = AI_STREAM_TARGET;
  scheduleAiStreamRender();
}
function endAiStream() {
  if (AI_RENDER_TIMER) {
    clearTimeout(AI_RENDER_TIMER);
    AI_RENDER_TIMER = null;
  }
  if (AI_STREAM_RAF) {
    cancelAnimationFrame(AI_STREAM_RAF);
    AI_STREAM_RAF = 0;
  }
  AI_STREAM_TARGET = CURRENT.aiOutput || AI_STREAM_TARGET;
  AI_STREAM_VISIBLE = AI_STREAM_TARGET;
  const out = $("#ai-output");
  if (out) {
    const area = getAiOutputArea();
    const shouldStickToBottom = AI_AUTO_SCROLL || isAiNearBottom(area);
    const previousScrollTop = area ? area.scrollTop : 0;
    out.innerHTML = renderMarkdown(CURRENT.aiOutput);
    out.classList.remove("is-streaming");
    if (shouldStickToBottom) {
      scrollAiToBottom(true);
    } else if (area) {
      area.scrollTop = previousScrollTop;
    }
  }
  AI_RENDER_PENDING = false;
}

// ============== AI API：服务器统一配置 ==============
let AI_STATUS = { enabled: true, model: "server" };

function aiModeLabel() {
  return AI_STATUS && AI_STATUS.model ? "API · " + AI_STATUS.model : "Server AI";
}

async function refreshAiStatus() {
  try {
    const data = await apiJson("/api/ai/status");
    AI_STATUS = data;
  } catch (e) {
    AI_STATUS = { enabled: false, model: "unavailable" };
  }
}

function buildAiMessages(mode, q, state, extra) {
  const ctx = getQuestionContext(q, state, extra);
  const sys = "你是 408 考研刷题助手。中文作答，使用 Markdown，直接给结论与依据，不要寒暄。除非用户明确要求代码，否则不要把 Markdown 内容包进代码块外壳。";
  const user = {
    explain: "【任务：讲解思路】用 3-5 步拆解本题解题路径，逐项解释每个选项为什么对/错。\n\n" + ctx,
    mistake: "【任务：错因分析】基于用户当前作答与正确答案，指出可能的误解、漏判的限定条件、容易混淆的概念。\n\n" + ctx,
    note: "【任务：知识库笔记】输出可直接保存到个人知识库的 Markdown 错题卡：yaml frontmatter + 题目 + 关键考点 + 错因 + 复习提醒。不加客套。不要使用代码块外壳，直接输出 Markdown 正文。\n\n" + ctx,
    ask: "【任务：针对性回答】用户追问：\"" + (extra || "") + "\"。基于上下文给出有依据的回答。\n\n" + ctx
  }[mode] || ctx;
  return [
    { role: "system", content: sys },
    { role: "user", content: user }
  ];
}

async function callServerAi(messages) {
  const data = await apiJson("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages })
  });
  if (data.model) AI_STATUS.model = data.model;
  return data.content || "";
}

async function streamAiApi(messages, onDelta, abortController) {
  const resp = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal: abortController ? abortController.signal : undefined,
    body: JSON.stringify({ messages, stream: true })
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || "HTTP " + resp.status);
  }
  if (!resp.body) {
    const text = await callServerAi(messages);
    if (onDelta) onDelta(text);
    return text;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const handleFrame = (frame) => {
    const lines = frame.split("\n").map(line => line.trim()).filter(line => line.startsWith("data:"));
    for (const line of lines) {
      const raw = line.slice(5).trim();
      if (!raw) continue;
      if (raw === "[DONE]") return "done";
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      if (payload.error) throw new Error(payload.error);
      if (payload.delta) {
        fullText += payload.delta;
        if (onDelta) onDelta(payload.delta);
      }
    }
    return "";
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      if (handleFrame(frame) === "done") return fullText;
    }
  }
  buffer += decoder.decode();
  if (buffer && handleFrame(buffer) === "done") return fullText;
  return fullText;
}

// AI 栏空态装饰文案:按题目稳定选一条,避免每次点击/渲染都跳动
const AI_EMPTY_TIPS = [
  { text: "思考是答案的一半。", author: "" },
  { text: "没有所谓的好题,只有值得想一想的题。", author: "" },
  { text: "AI 也许对,也许不对 — 先问就对了。", author: "" },
  { text: "把疑问说出来,答案就离你更近。", author: "" },
  { text: "学而不思则罔,思而不学则殆。", author: "《论语》" },
  { text: "上士闻道,勤而行之。", author: "《道德经》" },
  { text: "卡住的时候,问比想更省力。", author: "" },
  { text: "一题一世界,慢一点没关系。", author: "" },
  { text: "408 的尽头不是刷完所有题,是搞懂每一道。", author: "" },
  { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
];
const AI_EMPTY_PROMPTS = [
  { group: "理解题目", label: "讲解思路", text: "请按 3-5 步讲解这题的解题思路，并说明每个选项为什么对或错。" },
  { group: "理解题目", label: "逐项排除", text: "请用“因果链/逐项排除”的方式分析本题，先抓题干考点，再排除干扰项。" },
  { group: "整理复习", label: "错因分析", text: "请基于我当前选择，指出我最可能误解了哪些概念或限定条件。" },
  { group: "整理复习", label: "生成错题卡", text: "请生成一张可保存到知识库的 Markdown 错题卡，包含考点、错因和复习提醒。不要使用代码块外壳，直接输出 Markdown 正文。" },
];
function pickAiEmptyTip(q) {
  const seed = String(q && q.id ? q.id : "default");
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return AI_EMPTY_TIPS[Math.abs(hash) % AI_EMPTY_TIPS.length];
}

function renderAiEmpty(q) {
  const t = pickAiEmptyTip(q);
  const author = t.author ? '<div class="ai-empty-author">— ' + escHtml(t.author) + '</div>' : "";
  const groups = [...new Set(AI_EMPTY_PROMPTS.map(p => p.group))];
  const prompts = groups.map(group => {
    const buttons = AI_EMPTY_PROMPTS
      .map((p, i) => ({ ...p, index: i }))
      .filter(p => p.group === group)
      .map(p => '<button class="ai-empty-prompt" type="button" data-ai-prompt="' + p.index + '">' + escHtml(p.label) + '</button>')
      .join("");
    return '<div class="ai-empty-prompt-group"><div class="ai-empty-prompt-title">' + escHtml(group) + '</div>' + buttons + '</div>';
  }).join("");
  return '<div class="ai-empty">' +
    '<div class="ai-empty-mark">—</div>' +
    '<div class="ai-empty-quote">' + escHtml(t.text) + '</div>' +
    author +
    '<div class="ai-empty-rule"></div>' +
    '<div class="ai-empty-hint">可点预设，或直接追问</div>' +
    '<div class="ai-empty-prompts">' + prompts + '</div>' +
  '</div>';
}

function renderAiPanel(q, state) {
  const rail = $("#ai-rail");
  if (!rail || !q) return;
  // 桌面下恢复折叠态,移动端重置折叠
  if (window.matchMedia("(max-width: 1024px)").matches) {
    rail.classList.remove("is-collapsed");
  } else {
    rail.classList.toggle("is-collapsed", !!CURRENT.aiRailCollapsed);
  }
  rail.innerHTML = `
    <div class="ai-shell" id="ai-shell">
      <div class="ai-head">
        <div class="ai-title"><span class="ai-title-main">AI 讲题</span><small id="ai-mode-label">${aiModeLabel()}</small></div>
        <div class="ai-head-tools">
          <button class="ai-close" type="button" id="ai-close" aria-label="收起 AI 栏">×</button>
        </div>
      </div>
      <div class="ai-body">
        <div class="ai-context">
          <div class="ai-context-row ai-context-row-source">
            <span class="ai-context-rule" aria-hidden="true"></span>
            <svg class="ai-context-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 3.5h4M2.5 8h4M2.5 12.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>
              <path d="M9.5 3.5h4M9.5 8h4M9.5 12.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.45"/>
            </svg>
            <span class="ai-context-source" id="ai-source">${escHtml(q.book)} / 第 ${q.chapter} 章 / ${escHtml(q.section || q.chapter_title)}</span>
          </div>
          <div class="ai-context-row ai-context-row-state">
            <span class="ai-context-state" id="ai-state">${state.selected.length ? `已选 ${state.selected.join("、")}` : "尚未选择"}${state.submitted ? ` / ${state.shown ? "已查看答案" : (state.correct ? "已答对" : "已答错")}` : ""}</span>
            <button class="ai-copy-inline" id="ai-copy" type="button" title="复制 Markdown 上下文到剪贴板">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="4.5" y="4.5" width="8" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <path d="M3 11.5V3a1 1 0 0 1 1-1h7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              <span>复制上下文</span>
            </button>
            <button class="ai-copy-inline" id="ai-save-wiki" type="button" title="保存当前题目、作答和 AI 讲解到个人知识库">
              <span>保存到知识库</span>
            </button>
          </div>
        </div>
        <div class="ai-output-area">
          <div class="ai-output" id="ai-output">
            ${CURRENT.aiOutput
              ? renderMarkdown(CURRENT.aiOutput)
              : renderAiEmpty(q)
            }
          </div>
        </div>
        <div class="ai-input-row">
          <input id="ai-question" type="text" placeholder="追问：按回车发送，Shift+Enter 换行">
          <button class="btn btn-primary" type="button" id="ai-ask">询问 AI</button>
        </div>
        <!-- Feature 7: 题目关联 -->
        <div class="related-section" id="related-wrap" hidden></div>
        <button class="batch-trigger ai-batch-trigger" type="button" id="batch-open">批量讲错题 · AI 串讲</button>
        <div class="ai-quick" id="ai-quick">
          <div class="ai-quick-row">
            <span class="ai-quick-item">本组 <strong>${CURRENT.idx + 1} / ${CURRENT.questions.length}</strong></span>
            <div class="ai-quick-bar"><span style="width: ${CURRENT.questions.length > 0 ? Math.round((CURRENT.idx + 1) / CURRENT.questions.length * 100) : 0}%"></span></div>
          </div>
          <div class="ai-quick-row">
            <span class="ai-quick-item ai-quick-acc">正确率 <strong>${(STATE.stats.answered > 0 ? Math.round(STATE.stats.correct / STATE.stats.answered * 100) : 0)}%</strong></span>
            <span class="ai-quick-sep">·</span>
            <span class="ai-quick-item ai-quick-wrong">本章节错题 <strong>${CURRENT.book ? ALL_QUESTIONS.filter(qq => qq.book === CURRENT.book && (CURRENT.chapter == null || qq.chapter === CURRENT.chapter) && isWrong(qq.id)).length : Object.keys(STATE.wrong).length}</strong></span>
          </div>
        </div>
      </div>
    </div>
  `;
  bindAiPanel(q, state);
  bindAiOutputScrollState();
  // 折叠把手/抽屉把手 点击恢复 — 用 onclick 避免 renderQuiz 反复调用时 listener 累积
  rail.onclick = (e) => {
    if (window.matchMedia("(max-width: 1024px)").matches) {
      if (e.target.closest(".ai-head")) {
        rail.classList.toggle("is-open");
      }
    } else {
      // 桌面:折叠态时点 rail(除关按钮外)恢复
      if (rail.classList.contains("is-collapsed") && !e.target.closest("#ai-close")) {
        CURRENT.aiRailCollapsed = false;
        rail.classList.remove("is-collapsed");
      }
    }
  };
}

function bindAiPanel(q, state) {
  const shell = $("#ai-shell");
  if (!shell) return;
  // 关按钮 → 折叠/展开右侧 AI 栏
  $("#ai-close").onclick = () => {
    // 在移动抽屉模式下,关按钮 = 收起抽屉;桌面下 = 折叠到把手
    if (window.matchMedia("(max-width: 1024px)").matches) {
      const rail = $("#ai-rail");
      if (rail) rail.classList.remove("is-open");
    } else {
      CURRENT.aiRailCollapsed = !CURRENT.aiRailCollapsed;
      const rail = $("#ai-rail");
      if (rail) rail.classList.toggle("is-collapsed", CURRENT.aiRailCollapsed);
    }
  };

  // 追问运行器:有 API 配置就走流式(OpenAI 兼容),否则本地 builder 拼出追问上下文
  let askAbort = null;  // 当前进行中的请求 AbortController
  async function runAsk(ask) {
    const text = String(ask || "").trim();
    const qid = q && q.id ? String(q.id) : "__current";
    if (!CURRENT.aiLatestUserQuestions) CURRENT.aiLatestUserQuestions = {};
    const prev = CURRENT.aiLatestUserQuestions[qid];
    const first = prev && typeof prev === "object" ? String(prev.first || prev.text || prev.latest || "").trim() : String(prev || "").trim();
    CURRENT.aiLatestUserQuestions[qid] = {
      first: first || text,
      latest: text,
      firstTs: prev && typeof prev === "object" && prev.firstTs ? prev.firstTs : Date.now(),
      latestTs: Date.now()
    };
    CURRENT.aiLatestUserQuestion = text;
    if (!AI_STATUS.enabled) {
      await refreshAiStatus();
    }
    if (!AI_STATUS.enabled) {
      setAiOutput("⚠️ 服务器 AI 尚未配置。你仍然可以点击「复制上下文」手动粘贴给其他 AI。");
      return;
    }
    // 切到"生成中"态:按钮变"停止"
    const askBtn = $("#ai-ask");
    const origText = askBtn.textContent;
    askBtn.textContent = "停止";
    askBtn.classList.add("is-loading");
    startAiStream();
    // 重新挂一次性 abort 行为:再次点击按钮则中断
    askAbort = new AbortController();
    const onDelta = (d) => appendAiDelta(d);
    try {
      const text = await streamAiApi(buildAiMessages("ask", q, state, ask), onDelta, askAbort);
      // 末尾清理:不再追加光标
      CURRENT.aiOutput = text;
      endAiStream();
    } catch (e) {
      const fallback = getQuestionContext(q, state, ask);
      const errText = `⚠️ API 调用失败:${e.message}\n\n—— 已回退到本地整理 ——\n\n${fallback}`;
      CURRENT.aiOutput = errText;
      endAiStream();
    } finally {
      askBtn.textContent = origText;
      askBtn.classList.remove("is-loading");
      askAbort = null;
    }
  }

  $("#ai-copy").onclick = () => copyText(getQuestionContext(q, state), "上下文已复制");
  const saveWikiBtn = $("#ai-save-wiki");
  if (saveWikiBtn) {
    saveWikiBtn.onclick = async () => {
      const oldText = saveWikiBtn.textContent;
      saveWikiBtn.disabled = true;
      saveWikiBtn.textContent = "保存中…";
      try {
        const data = await saveQuestionToWiki(q, state);
        saveWikiBtn.textContent = data.cached ? "已保存" : "已写入";
        toast(data.cached ? "已保存过，无需重复写入" : "已保存到知识库");
        if (data.question_path) {
          CURRENT.aiOutput = (CURRENT.aiOutput || "") + `\n\n---\n已保存到知识库：\`${data.question_path}\``;
          endAiStream();
        }
      } catch (e) {
        toast("保存失败：" + e.message);
        saveWikiBtn.textContent = "保存失败";
      } finally {
        setTimeout(() => {
          saveWikiBtn.disabled = false;
          saveWikiBtn.textContent = oldText;
        }, 1600);
      }
    };
  }
  const batchOpen = $("#batch-open");
  if (batchOpen) batchOpen.onclick = () => openBatchModal();
  const askInput = $("#ai-question");
  $$(".ai-empty-prompt").forEach(btn => {
    btn.onclick = async () => {
      const askBtn = $("#ai-ask");
      if (askBtn && askBtn.classList.contains("is-loading")) {
        toast("AI 正在生成，稍等一下");
        return;
      }
      const preset = AI_EMPTY_PROMPTS[parseInt(btn.dataset.aiPrompt, 10)];
      if (!preset) return;
      askInput.value = preset.text;
      await runAsk(preset.text);
      askInput.value = "";
    };
  });
  askInput.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("#ai-ask").click();
    }
  };
  $("#ai-ask").onclick = async () => {
    const askBtn = $("#ai-ask");
    // 正在生成中:再次点击 = 中断
    if (askBtn.classList.contains("is-loading") && askAbort) {
      askAbort.abort();
      return;
    }
    const ask = askInput.value.trim();
    if (!ask) { toast("先写一句追问"); return; }
    askInput.value = "";
    await runAsk(ask);
  };
  // Feature 7: 渲染关联题目
  renderRelated(q);
}

function submit() {
  const q = CURRENT.questions[CURRENT.idx];
  if (!q) return;
  const cur = CURRENT.answers[q.id] || { selected: [] };
  if (cur.selected.length === 0) {
    toast("请先选择答案");
    return;
  }
  const correct = arraysEqual([...cur.selected].sort(), [...q.answer].sort());
  cur.submitted = true;
  cur.correct = correct;
  CURRENT.answers[q.id] = cur;
  markAttempted(q.id);
  STATE.stats.answered += 1;
  if (correct) {
    STATE.stats.correct += 1;
    removeWrong(q.id);  // 答对,从错题本移除
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

function showAnswer() {
  const q = CURRENT.questions[CURRENT.idx];
  if (!q) return;
  const cur = CURRENT.answers[q.id] || { selected: [] };
  cur.submitted = true;
  cur.shown = true;     // 标记为"只查看",不计入错题本
  cur.correct = false;  // 占位 - 不会被统计
  CURRENT.answers[q.id] = cur;
  // 不写入统计、不入错题本
  render();
  flashCard(q.id, "info");
}

function goNext() {
  if (CURRENT.idx < CURRENT.questions.length - 1) {
    CURRENT.idx++;
    resetAiPanel();
    renderQuiz();
  } else {
    toast("已经是最后一题");
  }
}

function goPrev() {
  if (CURRENT.idx > 0) {
    CURRENT.idx--;
    resetAiPanel();
    renderQuiz();
  } else {
    toast("已经是第一题");
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ============== 键盘快捷键 ==============
function normalizeChoiceKey(e) {
  const map = { "1": "A", "2": "B", "3": "C", "4": "D" };
  if (map[e.key]) return map[e.key];
  const k = e.key.toUpperCase();
  return ["A", "B", "C", "D"].includes(k) ? k : null;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA";
}

document.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;
  const q = CURRENT.questions[CURRENT.idx];
  if (!q) return;
  const state = CURRENT.answers[q.id] || { selected: [], submitted: false };
  const choice = normalizeChoiceKey(e);

  if (choice && !state.submitted) {
    e.preventDefault();
    const L = choice;
    const isMulti = q.type === "multiple_choice";
    let sel = state.selected.slice();
    if (isMulti) {
      if (sel.includes(L)) sel = sel.filter(x => x !== L);
      else sel.push(L);
    } else {
      sel = [L];
    }
    // 即时判分
    if (CURRENT.instantGrade) {
      if (!isMulti) {
        autoGrade(q, sel);
        return;
      } else {
        const correctSet = new Set(q.answer);
        const hasWrong = sel.some(x => !correctSet.has(x));
        const isComplete = sel.length === q.answer.length &&
          sel.every(x => correctSet.has(x));
        if (hasWrong || isComplete) {
          autoGrade(q, sel);
          return;
        }
      }
    }
    CURRENT.answers[q.id] = { ...state, selected: sel };
    renderQuiz();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (!state.submitted) {
      if (state.selected.length > 0) submit();
    } else {
      goNext();
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault(); goPrev();
  } else if (e.key === "ArrowRight") {
    e.preventDefault(); goNext();
  } else if (e.key === " ") {
    e.preventDefault();
    if (!state.submitted) showAnswer();
  } else if (e.key === "f" || e.key === "F") {
    if (q) { toggleFav(q.id); render(); }
  }
});

// ============== 启动 ==============
bindBackupControls();

// ============== 金句批注 ==============
// 每天固定一句(日期种子)起手,但题库导航那一行允许 ‹/› 手动切换;
// 手动切过的 index 不写 localStorage — 跨天会重置回"今天那句",避免装饰物污染状态。
// CS 先驱 / 西方思想 / 中文古典 5:5 混合,跟 Atelier Zero 纸面编辑感对齐。
const QUOTES = [
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" },
  { text: "In the midst of winter, I found there was, within me, an invincible summer.", author: "Albert Camus" },
  { text: "Simplicity is a great virtue but it requires hard work to achieve it.", author: "Edsger Dijkstra" },
  { text: "采菊东篱下，悠然见南山。", author: "陶渊明 · 饮酒" },
  { text: "回首向来萧瑟处，归去，也无风雨也无晴。", author: "苏轼 · 定风波" },
  { text: "大方无隅，大器晚成。", author: "老子 · 道德经" },
  { text: "为天地立心，为生民立命，为往圣继绝学，为万世开太平。", author: "张载 · 横渠四句" },
  { text: "纸上得来终觉浅，绝知此事要躬行。", author: "陆游 · 冬夜读书" },
];

// 两个金句独立随机,保证不等 — 每次刷新都是新搭配,跨天也随机。
let QUOTE_INDEX_H = Math.floor(Math.random() * QUOTES.length);
let QUOTE_INDEX_N = (QUOTE_INDEX_H + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length;

function stepQuote(delta) {
  QUOTE_INDEX_N = (QUOTE_INDEX_N + delta + QUOTES.length) % QUOTES.length;
  renderQuotes();
}

function renderQuotes() {
  const h = QUOTES[QUOTE_INDEX_H], n = QUOTES[QUOTE_INDEX_N];
  const safeH = { t: escHtml(h.text), a: escHtml(h.author) };
  const safeN = { t: escHtml(n.text), a: escHtml(n.author) };
  const hq = $("#header-quote");
  if (hq) hq.innerHTML = `<span class="hq-text">"${safeH.t}"</span><span class="hq-author">— ${safeH.a}</span>`;
  // nav 那一行多两个 18px 小方块按钮,只切 nav 不动 header
  const nq = $("#nav-quote");
  if (nq) nq.innerHTML =
    `<span class="nq-text">"${safeN.t}"</span>` +
    `<span class="nq-author">— ${safeN.a}</span>` +
    `<span class="nq-switches">` +
      `<button class="nq-btn" type="button" aria-label="上一句" onclick="stepQuote(-1)">‹</button>` +
      `<button class="nq-btn" type="button" aria-label="下一句" onclick="stepQuote(1)">›</button>` +
    `</span>`;
}

renderQuotes();

// ============== Feature 5: 真题 / 模拟题 / 课后题标签 ==============
// 默认从题干、id、题源字段推断来源；用户手动覆盖仍保存在 STATE.sourceTags[qid]。
// 兼容旧值：STATE.sourceTags[qid] = "exam" | "self"，新逻辑也接受 "mock"。
function normalizeSourceTag(tag) {
  if (tag === "exam" || tag === "mock" || tag === "self") return tag;
  const raw = String(tag || "").trim();
  const s = raw.toLowerCase();
  if (/^(exam|real|past|past_exam|unified|unified_exam)$/.test(s)) return "exam";
  if (/^(mock|simulation|simulated)$/.test(s)) return "mock";
  if (/^(self|post|practice|exercise|chapter)$/.test(s)) return "self";
  if (/真题|统考/.test(raw)) return "exam";
  if (/模拟/.test(raw)) return "mock";
  if (/课后|自编|王道/.test(raw)) return "self";
  if (tag === "真题") return "exam";
  if (tag === "模拟" || tag === "模拟题") return "mock";
  if (tag === "课后" || tag === "课后题" || tag === "自编题") return "self";
  return "";
}
function questionSourceText(q) {
  if (!q) return "";
  const parts = [
    q.id, q.question, q.source, q.source_type, q.sourceTag, q.source_tag,
    q.origin, q.origin_title, q.section, q.section_title, q.chapter_title,
    q.source_file, q.year,
  ];
  if (Array.isArray(q.tags)) parts.push(q.tags.join(" "));
  if (q.meta && typeof q.meta === "object") parts.push(JSON.stringify(q.meta));
  return parts.filter(v => v != null && v !== "").join(" ");
}
function inferQuestionSourceMeta(q) {
  const raw = questionSourceText(q);
  const text = raw.replace(/\s+/g, " ");
  const explicitType = normalizeSourceTag(q && (q.source_type || q.sourceTag || q.source_tag || q.origin_type));
  const explicitYear = q && q.year != null && /^(?:19|20)\d{2}$/.test(String(q.year)) ? String(q.year) : "";
  const bracket = (text.match(/[【\[]\s*([^】\]]{0,40}?(?:真题|模拟题?|课后题|自编题)[^】\]]{0,20})[】\]]/) || [])[1] || "";
  const src = bracket || text;
  const bracketYear = bracket.match(/(?:19|20)\d{2}/);
  const yearBeforeKind = text.match(/((?:19|20)\d{2})\s*(?:年)?\s*(?:统考)?\s*(?:真题|模拟题?)/);
  const yearAfterKind = text.match(/(?:真题|模拟题?|统考)[^【】\[\]]{0,12}((?:19|20)\d{2})/);
  const year = explicitYear || (bracketYear ? bracketYear[0] : (yearBeforeKind ? yearBeforeKind[1] : (yearAfterKind ? yearAfterKind[1] : "")));
  const hasMock = /模拟题|模拟卷|仿真题/.test(src);
  const hasExam = /(?:统考\s*)?真题|历年真题|考研真题/.test(src);
  const hasSelf = /课后题|自编题|本节试题精选|王道/.test(src);
  let type = explicitType || "self";
  if (!explicitType && hasMock && !hasExam) type = "mock";
  else if (!explicitType && hasExam) type = "exam";
  else if (!explicitType && hasSelf) type = "self";
  const unified = type === "exam" && /统考/.test(src);
  return { type, year, unified, inferred: type !== "self" || !!year };
}
function getQuestionSourceMeta(q) {
  if (!q) return { type: "self", year: "", unified: false, inferred: false, overridden: false, label: "课后题" };
  const inferred = inferQuestionSourceMeta(q);
  const override = normalizeSourceTag(STATE.sourceTags && STATE.sourceTags[q.id]);
  const meta = override ? Object.assign({}, inferred, { type: override, overridden: true }) : Object.assign({}, inferred, { overridden: false });
  if (meta.type === "exam") {
    meta.label = meta.year ? `${meta.year}真题` : (meta.unified ? "统考真题" : "真题");
  } else if (meta.type === "mock") {
    meta.label = meta.year ? `${meta.year}模拟` : "模拟题";
  } else {
    meta.label = "课后题";
  }
  return meta;
}
function getSourceTag(q) {
  return getQuestionSourceMeta(q).type;
}
function setSourceTag(qid, tag) {
  const normalized = normalizeSourceTag(tag) || "self";
  if (!STATE.sourceTags) STATE.sourceTags = {};
  STATE.sourceTags[qid] = normalized;
  persist();
  if (typeof SEARCH_INDEX !== "undefined") SEARCH_INDEX = null;
}
function toggleSourceTag(qid) {
  const q = ALL_QUESTIONS.find(qq => qq.id === qid);
  const cur = q ? getQuestionSourceMeta(q).type : normalizeSourceTag(STATE.sourceTags && STATE.sourceTags[qid]) || "self";
  setSourceTag(qid, cur === "exam" ? "self" : "exam");
}
function renderSourceTag(q) {
  const meta = getQuestionSourceMeta(q);
  const cls = meta.type === "exam" ? "tag-exam" : (meta.type === "mock" ? "tag-mock" : "tag-self");
  const yearAttr = meta.year ? ` data-source-year="${escHtml(meta.year)}"` : "";
  const title = meta.overridden ? "来源：手动标记。点击切换：真题 ↔ 课后题" : "来源：自动识别。点击切换：真题 ↔ 课后题";
  return `<span class="q-source-tag ${cls}" data-qid="${escHtml(q.id)}" data-source-type="${escHtml(meta.type)}"${yearAttr} title="${escHtml(title)}">${escHtml(meta.label)}</span>`;
}

// ============== Feature 1: 薄弱知识点 Top 10 ==============
// 按 (book, chapter) 聚合:已做正确率,至少 3 次答题才上榜
function getChapterStats() {
  const stats = {};
  for (const q of ALL_QUESTIONS) {
    const key = q.book + "::" + q.chapter;
    if (!stats[key]) {
      stats[key] = {
        book: q.book,
        chapter: q.chapter,
        chapter_title: q.chapter_title,
        attempted: 0,
        correct: 0,
      };
    }
    const ans = CURRENT.answers && CURRENT.answers[q.id];
    if (ans && ans.submitted) {
      stats[key].attempted += 1;
      if (ans.correct) stats[key].correct += 1;
    }
  }
  return Object.values(stats);
}
function renderWeakPanel() {
  const box = $("#weak-list");
  if (!box) return;
  const stats = getChapterStats().filter(s => s.attempted >= 3);
  if (stats.length === 0) {
    box.innerHTML = `<div class="weak-empty">再答几题后，<br>这里会出现薄弱章节</div>`;
    return;
  }
  // 按正确率升序,同正确率按已做数降序
  stats.sort((a, b) => {
    const accA = a.correct / a.attempted;
    const accB = b.correct / b.attempted;
    if (accA !== accB) return accA - accB;
    return b.attempted - a.attempted;
  });
  const top = stats.slice(0, 10);
  box.innerHTML = top.map((s, i) => {
    const acc = Math.round(s.correct / s.attempted * 100);
    const isGood = acc >= 80;
    return `<div class="weak-item ${isGood ? "is-good" : ""}" data-book="${escHtml(s.book)}" data-chapter="${s.chapter}">
      <span class="weak-rank">${i + 1}</span>
      <div class="weak-info">
        <div class="weak-title">${escHtml(s.book)} · ${escHtml(s.chapter_title)}</div>
        <div class="weak-meta">
          <span class="weak-acc">${acc}%</span>
          <span>${s.correct}/${s.attempted}</span>
        </div>
      </div>
      <div class="weak-bar"><span class="weak-bar-fill" style="width:${acc}%"></span></div>
    </div>`;
  }).join("");
  // 点击跳转到对应书目+章节的"错题"模式
  $$(".weak-item").forEach(el => {
    el.onclick = () => {
      const book = el.dataset.book;
      const chapter = parseInt(el.dataset.chapter, 10);
      CURRENT.book = book;
      CURRENT.chapter = chapter;
      setMode("wrong");
      // setMode 内会重建题单 + 重渲染
      toast(`已切换到 ${book} · 第 ${chapter} 章 错题`);
    };
  });
}

// ============== Feature 6: 全文搜索 ==============
// 简易倒排索引(1777 题一次性构建,内存极小)
