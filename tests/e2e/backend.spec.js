"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const { startServer, readJsonBody, json } = require("./helpers");

async function main() {
  let loggedIn = false;
  let passwordChanged = false;
  let savedProgress = null;
  let savedNote = null;
  let noteContent = "# Mock\n\n模拟讲解";
  const aiRequests = [];
  const wikiSaveRequests = [];
  const server = await startServer(async (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/api/auth/me") return json(response, 200, { user: loggedIn ? { id: "u1", username: "demo" } : null });
    if (path === "/api/auth/login") { loggedIn = true; return json(response, 200, { user: { id: "u1", username: "demo" } }); }
    if (path === "/api/auth/register") { loggedIn = true; return json(response, 200, { user: { id: "u1", username: "demo" } }); }
    if (path === "/api/auth/logout") { loggedIn = false; return json(response, 200, {}); }
    if (path === "/api/auth/password" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (body.currentPassword !== "oldpass") return json(response, 401, { error: "当前密码不正确" });
      if (body.newPassword !== "newpass") return json(response, 400, { error: "新密码无效" });
      passwordChanged = true;
      return json(response, 200, { ok: true });
    }
    if (path === "/api/progress" && request.method === "GET") return json(response, 200, { progress: savedProgress });
    if (path === "/api/progress" && request.method === "PUT") { savedProgress = (await readJsonBody(request)).progress; return json(response, 200, { ok: true }); }
    if (path === "/api/ai/status") return json(response, 200, { enabled: true, model: "mock-model" });
    if (path === "/api/ai/chat") {
      aiRequests.push(await readJsonBody(request));
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.write('data: {"delta":"这是"}\n\n');
      response.write('data: {"delta":"模拟讲解"}\n\n');
      response.end("data: [DONE]\n\n");
      return;
    }
    if (path === "/api/wiki/save-question") {
      savedNote = (await readJsonBody(request)).payload;
      wikiSaveRequests.push(savedNote);
      const folder = savedNote.question_kind === "concept" ? "concept" : "question";
      return json(response, 200, { question_path: `wiki/${folder}/操作系统/mock.md` });
    }
    if (path === "/api/wiki/search") return json(response, 200, { results: savedNote ? [{ path: "wiki/question/操作系统/mock.md", title: savedNote.title, subject: "操作系统", question_kind: savedNote.question_kind }] : [] });
    if (path === "/api/wiki/note") return json(response, 200, { path: "wiki/question/操作系统/mock.md", title: savedNote && savedNote.title || "Mock", content: noteContent, raw_content: noteContent, mtime: 1 });
    if (path === "/api/wiki/note/update") { noteContent = (await readJsonBody(request)).content; return json(response, 200, { ok: true }); }
    if (path === "/api/wiki/note/delete") { savedNote = null; return json(response, 200, { ok: true }); }
    return json(response, 404, { error: "not found" });
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("dialog", dialog => dialog.accept());
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    const frame = page.frames().find(item => item.url().includes("login-intro.html"));
    assert.ok(frame);
    await frame.locator("#username").fill("demo");
    await frame.locator("#password").fill("password");
    await frame.locator("#submit-button").click();
    await page.waitForFunction(() => typeof DATA_READY !== "undefined" && DATA_READY === true);
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent === "SAVED");
    assert.ok(savedProgress);

    await page.locator("#home-landing-open").click();
    const signedInFrame = page.frames().find(item => item.url().includes("login-intro.html"));
    assert.ok(signedInFrame);
    await signedInFrame.locator("#signed-in-panel").waitFor();
    assert.equal(await signedInFrame.locator("#signed-in-panel").isVisible(), true);
    assert.equal(await signedInFrame.locator("#auth-form").isVisible(), false);
    assert.equal(await signedInFrame.locator("#signed-in-name").innerText(), "demo");
    assert.equal(await signedInFrame.locator("#nav-account-action").innerText(), "demo");
    await signedInFrame.locator("#signed-in-enter").click();
    await page.waitForFunction(() => typeof DATA_READY !== "undefined" && DATA_READY === true);

    await page.locator('[data-book="操作系统"]').click();
    const answer = await page.evaluate(() => CURRENT.questions[CURRENT.idx].answer[0]);
    await page.locator(`.option[data-letter="${answer}"]`).click();
    await page.locator("#btn-submit").click();
    await page.waitForTimeout(700);
    assert.ok(savedProgress && savedProgress.state.reviews);

    await page.locator("#ai-question").fill("解释这道题");
    await page.locator("#ai-ask").click();
    await page.waitForFunction(() => document.querySelector("#ai-output").innerText.includes("模拟讲解"));
    assert.match(await page.locator("#ai-output").innerText(), /模拟讲解/);
    const conceptPayload = await page.evaluate(() => {
      const question = CURRENT.questions[CURRENT.idx];
      CURRENT.aiLatestUserQuestions[question.id] = {
        first: "你好",
        latest: "什么是实时操作系统",
        firstTs: Date.now() - 1000,
        latestTs: Date.now()
      };
      CURRENT.aiOutput = "实时操作系统强调在确定时间内完成响应。";
      return buildWikiSavePayload(question, CURRENT.answers[question.id] || { selected: [], submitted: false }, "concept");
    });
    assert.equal(conceptPayload.question_kind, "concept");
    assert.equal(conceptPayload.user_prompt, "什么是实时操作系统");
    assert.equal(conceptPayload.question_markdown, "什么是实时操作系统");
    assert.ok(!conceptPayload.question_id);
    assert.ok(!conceptPayload.source_question_id);
    assert.ok(!conceptPayload.source_question_title);
    assert.ok(!conceptPayload.source_chapter);
    assert.ok(!conceptPayload.source_section);
    assert.ok(!conceptPayload.selected);
    assert.ok(!conceptPayload.correct);
    assert.ok(!conceptPayload.user_answer);
    await page.locator("#ai-save-concept").click();
    await page.waitForFunction(() => document.querySelector("#ai-save-concept").textContent.includes("已写入"));
    const savedConcept = wikiSaveRequests.at(-1);
    assert.equal(savedConcept.question_kind, "concept");
    assert.equal(savedConcept.question_markdown, "什么是实时操作系统");
    assert.ok(!savedConcept.question_id && !savedConcept.source_question_id && !savedConcept.user_answer);
    await page.evaluate(() => {
      const question = CURRENT.questions[CURRENT.idx];
      CURRENT.aiLatestUserQuestions[question.id] = {
        first: "解释这道题",
        latest: "解释这道题",
        firstTs: Date.now(),
        latestTs: Date.now()
      };
      CURRENT.aiOutput = "这是模拟讲解";
    });
    assert.equal(await page.locator("#batch-open").count(), 0);
    assert.equal(await page.locator("#batch-modal").count(), 0);
    await page.locator("#ai-quick").waitFor({ state: "visible" });
    assert.match(await page.locator("#ai-quick").innerText(), /本组进度/);
    assert.match(await page.locator("#ai-quick").innerText(), /正确率/);
    assert.ok(!aiRequests.some(body => JSON.stringify(body).includes("错题串讲")));
    await page.locator("#ai-save-exam").click();
    await page.waitForFunction(() => document.querySelector("#ai-save-exam").textContent.includes("已写入"));
    assert.equal(savedNote.question_kind, "exam");
    assert.ok(savedNote.question_id);
    assert.match(savedNote.question_markdown, /选项/);

    await page.goto(server.url + "#/wiki", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    await page.locator('[data-wiki-kind="exam"]').click();
    await page.locator("#wiki-search-input").fill("Mock");
    await page.locator("#wiki-search-button").click();
    await page.waitForSelector(".wiki-tree-item");
    await page.locator(".wiki-tree-item").first().click();
    await page.waitForFunction(() => document.querySelector("#wiki-note-preview").innerText.includes("模拟讲解"));
    await page.locator('[data-wiki-edit="1"]').click();
    await page.locator("#wiki-note-editor").fill("# Mock\n\n已编辑内容");
    await page.locator('[data-wiki-save-edit="1"]').click();
    await page.waitForFunction(() => document.querySelector("#wiki-note-preview").innerText.includes("已编辑内容"));
    assert.match(noteContent, /已编辑内容/);
    await page.locator('[data-wiki-delete="1"]').click();
    await page.waitForTimeout(150);
    assert.equal(savedNote, null);

    await page.locator("#user-menu-toggle").click();
    await page.locator("#change-password-btn").click();
    await page.locator("#password-current").fill("oldpass");
    await page.locator("#password-new").fill("newpass");
    await page.locator("#password-confirm").fill("newpass");
    await page.locator("#password-submit").click();
    await page.waitForFunction(() => document.querySelector("#password-modal").hidden);
    assert.equal(passwordChanged, true);

    console.log("backend E2E OK: login, password, progress sync, AI stream/summary, wiki save/search/edit/delete");
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
