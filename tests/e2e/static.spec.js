"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const { startServer } = require("./helpers");

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("dialog", dialog => dialog.accept());
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof DATA_READY !== "undefined" && DATA_READY === true);
    assert.equal(await page.locator("#sync-status").textContent(), "LOCAL");

    await page.locator('[data-book="操作系统"]').click();
    assert.match(await page.locator("#chapter-trigger").textContent(), /全部章节/);
    await page.locator("#chapter-trigger").click();
    await page.locator('#chapter-menu [data-chapter="1"]').click();
    assert.match(await page.locator("#chapter-trigger").textContent(), /第 1 章/);

    const answer = await page.evaluate(() => CURRENT.questions[CURRENT.idx].answer[0]);
    const wrongAnswer = ["A", "B", "C", "D"].find(letter => letter !== answer);
    await page.locator(`.option[data-letter="${wrongAnswer}"]`).click();
    await page.locator("#btn-submit").click();
    await page.waitForSelector(".feedback.show.wrong");
    const questionId = await page.evaluate(() => CURRENT.questions[CURRENT.idx].id);
    const wrongState = await page.evaluate(id => ({ wrong: !!STATE.wrong[id], due: isReviewDue(id), attempts: STATE.reviews[id].attempts }), questionId);
    assert.deepEqual(wrongState, { wrong: true, due: true, attempts: 1 });

    await page.locator("#btn-fav").click();
    assert.equal(await page.evaluate(id => !!STATE.favorite[id], questionId), true);
    await page.locator('[data-mode="wrong"]').click();
    assert.ok(await page.locator(".q-stem").isVisible());
    await page.locator('[data-mode="favorite"]').click();
    assert.ok(await page.locator(".q-stem").isVisible());
    await page.locator('[data-mode="review"]').click();
    assert.equal(await page.evaluate(() => CURRENT.mode), "review");

    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("进程");
    await page.waitForTimeout(80);
    assert.ok(Number(await page.locator("#search-count").textContent()) > 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#search-modal").getAttribute("hidden"), "");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-progress").click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    assert.ok(exportPath);
    const exported = JSON.parse(require("fs").readFileSync(exportPath, "utf8"));
    assert.equal(exported.version, 2);
    assert.ok(exported.state.reviews[questionId]);
    await page.evaluate(() => {
      STATE = normalizeLearningState({});
      saveState(STATE);
    });
    await page.setInputFiles("#import-file", exportPath);
    await page.waitForTimeout(700);
    await page.waitForFunction(id => !!STATE.reviews[id] && !!STATE.favorite[id], questionId);

    await page.goto(server.url + "#/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof DATA_READY !== "undefined" && DATA_READY === true);
    await page.waitForSelector(".dashboard-summary-grid article");
    assert.match(await page.locator("#dashboard-content").innerText(), /待复习/);
    assert.match(await page.locator("#dashboard-start-review").textContent(), /开始今日复习/);
    await page.locator("#dashboard-help-button").click();
    assert.ok(await page.locator("#dashboard-help-popover").isVisible());
    assert.match(await page.locator("#dashboard-help-popover").innerText(), /连续做对 2 次/);
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("#dashboard-help-popover").isHidden());

    await page.evaluate((id) => {
      const review = STATE.reviews[id];
      STATE.wrong[id] = Date.now();
      STATE.reviews[id] = { ...review, streak: 0, dueAt: Date.now() - 1000 };
      saveState(STATE);
    }, questionId);
    await page.locator("#dashboard-start-review").click();
    assert.equal(await page.evaluate(() => CURRENT.mode), "review");
    assert.ok((await page.locator(".q-stem").innerText()).trim());

    console.log("static E2E OK: quiz, wrong/favorite/review, search, export, dashboard");
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
