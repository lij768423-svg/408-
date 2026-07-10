# 408 考研刷题库

![408 刷题复盘闭环：选择科目、刷题作答、AI 讲题、错题回炉和本地保存](docs/screenshots/hero.png)

一个无需构建即可运行的 408 网页题库。它把章节刷题、错题、收藏、全文搜索、AI 讲题和个人知识库放在同一个界面里。

- **只想本地刷题：** 启动普通静态服务器即可，页面会自动进入 `LOCAL` 模式。
- **需要账号、AI 和知识库：** 额外提供兼容的 `/api/*` 后端。

## 在线体验

- [首页](https://quiz.hermesjj.com/)
- [刷题页](https://quiz.hermesjj.com/#/quiz)
- [个人知识库](https://quiz.hermesjj.com/#/wiki)
- [使用说明](https://quiz.hermesjj.com/#/guide)

如果线上页面没有更新，可尝试强制刷新：Windows/Linux 使用 `Ctrl + F5`，macOS 使用 `Cmd + Shift + R`。

## 功能概览

- 四门 408 科目：操作系统、数据结构、计算机组成原理、计算机网络。
- `data.json` 包含 `2386` 条题目记录；过滤隐藏项后，页面当前展示 `2378` 题。
- 顺序、随机、错题、收藏、未做和全部随机等刷题范围。
- 即时判分、题目解析、题图放大、来源/年份筛选和全文搜索。
- 错题、收藏、已答记录、偏好设置与当前会话保存在浏览器 `localStorage`。
- 学习记录支持 JSON 导入和导出。
- AI 面板可整理并复制当前题目上下文；完整后端模式支持页面内流式追问。
- 个人知识库支持保存、搜索、预览、编辑、继续追问和软删除 Markdown 笔记。
- 题面、解析和 AI 输出支持 Markdown、KaTeX 公式和代码块。

![登录首页：408 AI 刷题库的账号入口、题库能力介绍和视觉拼贴](docs/screenshots/main.png)

## 30 秒启动

需要 Python 3 或 Node.js，任选一种方式启动 HTTP 静态服务器。

### Python

```bash
git clone https://github.com/lij768423-svg/408-.git
cd 408-
python3 -m http.server 8767
```

### Node.js

```bash
git clone https://github.com/lij768423-svg/408-.git
cd 408-
npx serve . -l 8767
```

浏览器打开：

```text
http://127.0.0.1:8767/
```

> 不建议直接双击 `index.html`。应用需要通过 `fetch()` 读取 `data.json`，部分浏览器会阻止 `file://` 页面读取本地资源。

## 两种运行模式

| 能力 | `LOCAL` 静态模式 | 完整后端模式 |
|---|---:|---:|
| 章节刷题、搜索和解析 | ✅ | ✅ |
| 错题、收藏和已答记录 | 浏览器本地 | 账号同步，同时保留本地缓存 |
| 学习记录导入/导出 | ✅ | ✅ |
| 复制题目上下文给外部 AI | ✅ | ✅ |
| 页面内 AI 追问 | ❌ | ✅ |
| 登录和多用户隔离 | ❌ | ✅ |
| 个人知识库 | ❌ | ✅ |

普通静态服务器没有 `/api/*` 时，页面会自动隐藏登录层并显示 `LOCAL`。无需创建账号即可开始刷题。

## 新用户上手

1. 打开页面；静态部署会直接进入题库，完整后端部署可先登录账号。
2. 在左侧选择科目、章节和刷题模式。
3. 点击选项作答；多选题可连续选择多个选项。
4. 点击“提交”判分，查看正确答案、你的答案和题库解析。
5. 看不懂时点击“复制上下文”，粘贴到任意外部 AI；完整后端模式也可直接在右侧追问。
6. 一章结束后切换到错题、收藏或未做模式集中复盘。
7. 定期导出学习记录，避免清理浏览器数据后丢失本地进度。

![章节选择：按科目和章节快速切换题目范围](docs/screenshots/chapter-menu.png)

![答题反馈：提交后显示正确答案、你的答案和解析](docs/screenshots/feedback.png)

## 刷题与搜索

| 模式 | 适合场景 |
|---|---|
| 顺序 | 第一遍按章节建立知识上下文 |
| 随机 | 检查是否真正掌握，而不是记住题目顺序 |
| 错题 | 集中复盘当前仍未做对的题目 |
| 收藏 | 回看典型题、易混题和高价值题 |
| 未做 | 补齐尚未作答的章节进度 |
| 全部 | 跨科目随机抽取一组题目 |

“即时判分”开启后，单选题会在选择后立即判定；多选题选错时立即判错，选全正确答案时判对。

顶部搜索支持题干、选项和解析全文检索，并可按来源和年份筛选。使用 `Ctrl + K` 或 `Cmd + K` 可打开搜索，`Esc` 可关闭搜索、批量串讲等弹窗。

![题库搜索：按关键词、来源和年份筛选题目](docs/screenshots/search.png)

完整后端模式登录后，顶部“题库预览”还会按章节展示做对、错题、收藏和未做状态，并支持点击跳题。

![题库预览：按章节展示做对、错题、收藏和未做状态](docs/screenshots/preview.png)

## AI 讲题

AI 面板会整理当前题目的题源、章节、题型、当前选择、正确答案、题干、选项和解析。

- 所有模式都可使用“复制上下文”，再粘贴给任意外部 AI。
- 页面内追问固定调用同源后端的 `GET /api/ai/status` 和 `POST /api/ai/chat`。
- 仓库没有浏览器侧 Base URL、模型或 API Key 配置入口；模型地址和密钥应由后端管理。
- 后端 AI 不可用时，页面会提示复制上下文，不影响基础刷题。
- AI 回答可能出错，重要结论应回到教材或题目解析确认。

![AI 讲题：流式讲解、上下文复制、保存到知识库和题目关联](docs/screenshots/ai-explain.png)

“批量讲错题”可以选择一组错题并生成串讲上下文，适合整章复盘。

![批量串讲：选择错题并生成一组复盘材料](docs/screenshots/batch-menu.png)

## 个人知识库

个人知识库只在完整后端模式下可用。保存内容是 Markdown 笔记，并按账号隔离。

- 首次追问偏概念时，通常保存为“概念问题”。
- 首次追问明确引用本题、选项或正确答案时，通常保存为“题目问题”。
- 同一道题后续追问沿用首次分类。
- 知识库支持按科目浏览、全文搜索、预览、编辑、继续追问和软删除。
- 删除操作是否可恢复由后端实现决定；本前端调用的是软删除接口。

![个人知识库：按科目浏览、搜索和预览 Markdown 笔记](docs/screenshots/wiki.png)

## 页面路由

| 路由 | 说明 |
|---|---|
| `#/quiz` | 刷题、搜索、学习记录和 AI 面板 |
| `#/wiki` | 个人知识库，需要完整后端 |
| `#/guide` | 应用内使用说明 |

![使用说明：刷题、AI 讲解、个人知识库的学习链路](docs/screenshots/guide.png)

## 数据与隐私

- `LOCAL` 模式的错题、收藏、会话和偏好只保存在当前浏览器。
- 清理站点数据、更换浏览器或更换域名后，本地记录不会自动迁移；请使用导出/导入功能。
- 完整后端模式使用同源 Cookie 维持登录，并按账号同步进度。
- AI 密钥应只存在于后端环境变量或 Secret Manager，不应写进仓库或浏览器存储。
- 导出的学习记录包含刷题状态和偏好，不包含 AI API Key。

## 开发与验证

项目没有前端构建步骤；修改 HTML、CSS 或 JavaScript 后刷新页面即可。

安装测试依赖并执行检查：

```bash
npm install
npm test
```

`npm test` 会执行：

1. 检查 `assets/js/*.js` 和 `scripts/*.js` 的 JavaScript 语法。
2. 验证 `data.json` 的 JSON 格式、题量统计、重复 ID、答案和本地图片引用。
3. 使用 Playwright 在 `/408/` 子路径启动纯静态服务，验证 API 404 时能进入 `LOCAL` 模式并成功渲染题库。

当前脚本：

```text
scripts/check-data.js    题库一致性检查
scripts/check-static.js  纯静态模式浏览器烟测
```

`assets/js/*.js` 使用 classic `<script>` 按固定顺序加载，不是 ES modules。依赖顺序记录在 [`assets/js/README.md`](assets/js/README.md)。

## 项目结构

```text
408-quiz/
├── index.html                 # 单页入口和三个 hash 路由视图
├── data.json                  # 题库数据：2386 条记录，当前展示 2378 题
├── favicon.svg
├── package.json               # 语法、数据和 Playwright 静态烟测
├── scripts/
│   ├── check-data.js
│   └── check-static.js
├── assets/
│   ├── app.css                # 全局样式和响应式布局
│   ├── app.js                 # 未被当前 index.html 加载的旧版脚本
│   ├── auth/login-intro.html  # 登录介绍页和本地模式提示
│   └── js/                    # 状态、路由、刷题、认证、AI、知识库和搜索
├── docs/
│   ├── DEPLOYMENT.md          # GitHub Pages、Nginx、Caddy 和 Docker
│   ├── BACKEND_API.md         # 完整后端接口契约
│   └── screenshots/           # README 截图
├── images/                    # 题图资源
└── README.md
```

## 部署与后端

- 静态部署、缓存策略和容器示例：[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- `/api/*` 接口、Cookie、AI 流式响应和知识库安全要求：[`docs/BACKEND_API.md`](docs/BACKEND_API.md)
- README 新用户、一致性和去重检查记录：[`docs/README_AUDIT.md`](docs/README_AUDIT.md)

仓库本身不包含完整后端实现。只部署当前仓库时，应预期进入 `LOCAL` 模式。

## 浏览器支持

推荐使用最新版 Chrome、Edge、Firefox 或 Safari。应用需要支持 ES6、`fetch`、`localStorage` 和现代 CSS。

KaTeX 资源来自 CDN；离线或 CDN 不可用时，公式会回退为原始文本，基础刷题仍可使用。

## 常见问题

### 为什么显示 `LOCAL`？

页面没有检测到 `GET /api/auth/me`，因此自动进入纯静态模式。这不是错误，基础刷题和本地进度仍可使用。

### GitHub Pages 上为什么不能登录、页面内问 AI 或打开知识库？

GitHub Pages 只能托管静态文件，不提供 `/api/*`。这些功能需要额外部署兼容后端。

### 页面内 AI 没反应怎么办？

先检查后端的 `/api/ai/status` 与 `/api/ai/chat`。后端不可用时，可以继续使用“复制上下文”并粘贴到外部 AI。

### 为什么更换浏览器后没有原来的进度？

`LOCAL` 模式的数据保存在浏览器 `localStorage`，不会自动跨浏览器同步。请在旧浏览器导出记录，再在新浏览器导入。

### 为什么线上页面看起来还是旧版？

可能是浏览器或代理缓存。先尝试强制刷新，并检查服务器是否为 `index.html` 和 `data.json` 配置了 `no-cache`。

### 删除知识库条目能恢复吗？

前端调用软删除接口，但最终回收位置和恢复方式由后端实现决定。

## 数据来源

`data.json` 由题库提取流程生成，字段包括题目 ID、科目、章节、题型、题干、选项、答案、解析和来源信息。

新增或修改题目后请运行：

```bash
npm test
```

题图使用 Markdown 图片语法，资源地址应为 `images/实际图片文件名.jpg` 这样的相对路径。

请避免提交包含版权风险、隐私信息或敏感数据的内容。

## License

本项目基于 ISC License 开源，详见 [`LICENSE`](LICENSE)。
