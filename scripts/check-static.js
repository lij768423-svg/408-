"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const prefix = "/408/";
const expectedQuestionCount = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"))
  .questions.filter((question) => question.hidden !== true).length;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (!requestUrl.pathname.startsWith(prefix)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const relativePath = decodeURIComponent(requestUrl.pathname.slice(prefix.length)) || "index.html";
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

async function main() {
  const server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const failedResources = [];
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().includes("/api/auth/me")) {
        failedResources.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`http://127.0.0.1:${port}${prefix}`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => typeof DATA_READY !== "undefined" && DATA_READY === true, null, { timeout: 15000 });
    } catch (error) {
      throw new Error(`${error.message}\nbrowser errors:\n${browserErrors.join("\n")}\nfailed resources:\n${failedResources.join("\n")}`);
    }
    const result = await page.evaluate(() => ({
      authDisplay: getComputedStyle(document.querySelector("#auth-card")).display,
      questionCount: ALL_QUESTIONS.length,
      syncStatus: document.querySelector("#sync-status").textContent,
      quizText: document.querySelector("#quiz-area").innerText,
      favicon: document.querySelector('link[rel="icon"]').href,
    }));
    if (result.authDisplay !== "none") throw new Error(`auth card stayed visible: ${result.authDisplay}`);
    if (result.questionCount !== expectedQuestionCount) throw new Error(`unexpected question count: ${result.questionCount}`);
    if (result.syncStatus !== "LOCAL") throw new Error(`unexpected sync status: ${result.syncStatus}`);
    if (!result.quizText.trim() || result.quizText.includes("加载题库中")) throw new Error("quiz did not render");
    if (!result.favicon.includes(`${prefix}favicon.svg`)) throw new Error(`favicon is not subpath-safe: ${result.favicon}`);
    if (failedResources.length) throw new Error(`static resources failed:\n${failedResources.join("\n")}`);
    console.log(`static mode OK: ${result.questionCount} questions, ${result.syncStatus}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
