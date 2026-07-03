# 408 考研刷题库

一个面向 408 考研复习的网页刷题应用：题库、错题、收藏、AI 讲题和个人知识库放在同一个界面里。

页面提供：

- 刷题：题卡、模式、错题、收藏、进度、AI 讲题。
- 个人知识库：保存到知识库、搜索、预览、编辑、软删除、回收目录。
- 使用说明页：解释概念问题和题目问题的分类规则。

整个应用以静态文件方式运行，知识库后端可独立部署。

---

## 1. 对外服务（线上访问）

### 1.1 入口地址

| 页面 | 地址 |
|---|---|
| 刷题 | `https://quiz.hermesjj.com/#/quiz` |
| 个人知识库 | `https://quiz.hermesjj.com/#/wiki` |
| 使用说明 | `https://quiz.hermesjj.com/#/guide` |

打开以上任一地址即可使用。

### 1.2 对外能看到什么

- 刷题、错题、收藏、答题统计：所有本地+账号绑定数据都会随账号保留。
- AI 讲题 + 保存到知识库：依赖浏览器侧用户配置的 AI Key 或后端代理。
- 个人知识库：账号级隔离，每个用户的知识库互不干扰。
- 使用说明页：解释 AI 保存到知识库的分类规则。

### 1.3 数据和隐私

- 学习记录只保存在浏览器本地（`localStorage`），不写入仓库。
- 账号绑定数据（账号级进度、错题、收藏、知识库）由后端服务管理，不向第三方发送。
- AI Key 由用户在自己浏览器里输入，仅保存在该浏览器的 `localStorage`。
- 应用默认不会主动把任何题目发送到外部服务，只有用户主动点「询问 AI」或保存到知识库时才触发对应请求。
- 知识库后端（systemd 服务 `wiki-question-api`）只接收本机或反代调用，无对外凭证。

---

## 2. 核心特性

- 四门 408 科目题库：操作系统、数据结构、计算机组成原理、计算机网络。
- 多种刷题模式：顺序、随机、错题、收藏、未做、全部随机。
- 账号体系：不同用户的进度、错题、收藏和知识库互相隔离。
- AI 讲题：题目上下文自动整理，可复制上下文，也可直接追问 AI。
- 保存到知识库：AI 讲解和追问结果可以沉淀到个人知识库。
- 知识库浏览：支持概念问题、题目问题、全部问题三类筛选。
- 知识库预览与维护：支持预览、编辑正文、软删除到回收目录。
- 使用说明页：独立页面解释概念问题和题目问题的分类规则。
- Markdown/公式/代码渲染：题面、解析和 AI 输出支持 Markdown、KaTeX 和代码块。
- 导入导出学习记录：可用 JSON 迁移学习数据。

---

## 3. 页面结构

| 路由 | 说明 |
|---|---|
| `#/quiz` | 默认刷题页：题卡、模式、进度、AI 讲题 |
| `#/wiki` | 个人知识库：目录树、搜索、预览、编辑、软删除 |
| `#/guide` | 使用说明：说明保存规则、概念/题目分类和常见用法 |

---

## 4. 如何使用

### 4.1 登录或注册

服务使用账号隔离数据。注册/登录后，以下内容会绑定到当前账号：

- 刷题进度
- 错题
- 收藏
- 偏好设置
- 个人知识库

新账号会创建空的个人知识库，不会继承其他账号或旧共享内容。

### 4.2 刷题

左侧选择科目、章节和刷题模式：

| 模式 | 说明 |
|---|---|
| 顺序 | 按题库顺序刷 |
| 随机 | 当前范围内随机打乱 |
| 错题 | 只刷当前范围内做错过的题 |
| 收藏 | 只刷收藏题 |
| 未做 | 只刷还没有答过的题 |
| 全部随机 | 跨科目随机刷题，可选每组 20/50/100/200 题 |

默认答题流程：

1. 点击 A/B/C/D 选择答案。
2. 点击「提交」判分。
3. 查看正确答案和解析。
4. 点击「下一题」继续。

即时判分开启后：

- 单选题：点击选项后立即判定。
- 多选题：选错会立即判错；选全正确答案后判对。

### 4.3 AI 讲题

右侧 AI 面板会自动带上当前题目的上下文，包括：

- 题源
- 章节
- 题型
- 当前选择
- 正确答案
- 题干
- 选项
- 解析

常见用法：

- 点击「复制上下文」，把题目和解析复制给外部 AI。
- 在追问框输入「为什么选 A」「B 为什么不对」「这题考点是什么」。
- 点击「保存到知识库」，把讲解沉淀到个人知识库。

AI 输出支持 Markdown、公式和代码块。

### 4.4 保存到知识库

保存时会根据内容自动分类：

| 分类 | 路径 | 适合内容 |
|---|---|---|
| 概念问题 | `wiki/question/<科目>/<概念>.md` | 「什么是管程」「Cache 和 TLB 区别」这类知识点解释 |
| 题目问题 | `wiki/question/<科目>/<题目ID>.md` | 围绕具体题目的追问、错因、解析补充 |

同一道题的后续追问会继续写入同一个题目问题；概念类问题会按概念标题归档。

### 4.5 浏览和维护知识库

进入：

```text
#/wiki
```

可用功能：

- 搜索个人知识库。
- 用「全部问题 / 概念问题 / 题目问题」筛选。
- 左侧目录树浏览条目。
- 右侧预览 Markdown 内容。
- 编辑正文。
- 软删除到回收目录。

删除不是永久删除，文件会移动到用户目录下的回收位置，便于后续恢复。

### 4.6 使用说明页

进入：

```text
#/guide
```

该页解释：

- 什么时候会保存为概念问题。
- 什么时候会保存为题目问题。
- AI 面板和知识库如何配合使用。
- 常见操作路径。

---

## 5. 键盘快捷键

| 键 | 作用 |
|---|---|
| `A` / `B` / `C` / `D` | 选择对应选项，多选题可累积选择 |
| `Enter` | 提交或进入下一题 |
| `←` / `→` | 上一题 / 下一题 |
| `Space` | 显示答案 |
| `F` | 收藏 / 取消收藏 |

---

## 6. 浏览器兼容

建议使用现代浏览器：

- Chrome 121+
- Edge 121+
- Safari 14+
- Firefox 88+

需要支持 ES6、`fetch`、`localStorage` 和现代 CSS。

---

## 7. 本地下载、安装与 AI 配置（面向自部署用户）

这一节面向自己下载本仓库并在本地或自己服务器上运行的人。如果只想使用线上服务，可以只看前六节。

### 7.1 下载与克隆

```bash
git clone git@github.com:lij768423-svg/408-.git ~/408-quiz
cd ~/408-quiz
```

如果你只是想本地运行，不需要 `npm install`；`package.json` 只用于开发辅助，当前没有真实测试命令。

### 7.2 三种部署形态

| 形态 | 端口 | 是否需要后端 | 适用 |
|---|---|---|---|
| 纯静态（本地 HTTP） | 自己选（如 `8767`） | 否 | 单机纯刷题 |
| Docker Compose（推荐） | `8767` | 是 | 服务器长期运行 |
| 知识库后端 | `8787` | 是 | 任何需要知识库功能的部署 |

`8767` 是线上/容器默认端口，部署在 `quiz-408` 容器里；`8768` 是开发预览端口，部署在 `quiz-408-dev` 容器里。`wiki-question-api` 独立运行在 `8787`，由 systemd 管理。

### 7.3 纯静态单机

进入项目目录后直接起静态服务：

```bash
python3 -m http.server 8767
```

然后打开：

```text
http://127.0.0.1:8767/
```

纯静态模式下：

- 可以正常使用刷题、错题、收藏、导入导出。
- 可以使用「复制上下文」。
- 没有后端代理时，AI 追问需要自己在 AI 配置面板里填 API Key 和 Base URL。
- 个人知识库接口不可用（没有 `:8787` 后端支持）。

注意：`file://` 和 `http://127.0.0.1:8767` 在浏览器里是两个不同来源，`localStorage` 不互通，建议长期固定使用同一种打开方式。

### 7.4 Docker Compose 部署（推荐）

正式服务由 Docker Compose 托管：

```text
/data/compose/quiz-408
```

正式容器：

```text
quiz-408 -> 0.0.0.0:8767
```

开发容器：

```text
quiz-408-dev -> 0.0.0.0:8768
```

管理/辅助容器：

```text
quiz-408-admin -> 0.0.0.0:8769
```

常用命令：

```bash
cd /data/compose/quiz-408
docker restart quiz-408
```

正式静态文件目录：

```text
/data/projects/408
```

开发静态文件目录：

```text
/data/projects/408-dev
```

### 7.5 知识库后端

知识库 API 独立运行在 systemd 服务中：

```text
wiki-question-api.service -> 0.0.0.0:8787
```

健康检查：

```bash
curl -fsS http://127.0.0.1:8787/health
```

前端通过 `/api/wiki/*` 代理调用它。systemd unit 文件示例：

```ini
[Unit]
Description=Personal knowledge base API
After=network.target

[Service]
User=lijunjie
WorkingDirectory=/home/lijunjie/services/wiki-question-api
EnvironmentFile=-/home/lijunjie/services/wiki-question-api/.env
ExecStart=/home/lijunjie/services/wiki-question-api/.venv/bin/python -m app.main --host 0.0.0.0 --port 8787
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

建议把 `.venv/`、`.env`、vault 数据目录排除在仓库外，避免密钥/缓存入库。

### 7.6 配置 AI Key

AI Key 由用户在前端 UI 里配置；也可以由后端容器代理透传。

#### 7.6.1 浏览器侧配置（推荐给个人使用）

打开任意页面，右上角 AI 面板点齿轮：

| 字段 | 说明 |
|---|---|
| Base URL | API 服务地址，例如 OpenAI 兼容接口、Ollama 或本地中转服务 |
| Model | 模型名称，例如 `qwen2.5:7b`、`deepseek-chat`、`gpt-4o-mini` |
| 协议 | 可选自动推断、OpenAI 兼容、Anthropic 兼容 |
| Key | API Key；Ollama 或本地服务通常可以留空 |

Key 只保存在当前浏览器的 `localStorage`，不会发送到仓库或导出到学习记录 JSON。换浏览器或换电脑需要重新输入。

配置完成后右上角会从 `LOCAL` 变成 `API · 模型名`。

#### 7.6.2 后端代理透传（推荐给团队/共享服务）

把用户自己的 Key 放在后端容器的环境变量：

```bash
QUIZ_AI_BASE_URL=https://api.deepseek.com
QUIZ_AI_MODEL=deepseek-chat
QUIZ_AI_PROVIDER=openai_compat
QUIZ_AI_TOKEN=sk-xxxxxxxxxxxxxxxx
```

这些变量写在 `/data/compose/quiz-408/.env` 中，`docker compose up` 时被加载，不会进入仓库。

#### 7.6.3 Ollama / 本地模型示例

如果你本地启动了 Ollama 并开启 OpenAI 兼容接口：

| 字段 | 示例 |
|---|---|
| Base URL | `http://127.0.0.1:11434/v1` |
| Model | `qwen2.5:7b` |
| 协议 | OpenAI 兼容 |
| Key | 留空 |

#### 7.6.4 OpenAI 兼容接口示例

如果你使用 DeepSeek、OpenAI 或其他兼容 `/chat/completions` 的服务：

| 字段 | 示例 |
|---|---|
| Base URL | `https://api.deepseek.com` |
| Model | `deepseek-chat` |
| 协议 | OpenAI 兼容 |
| Key | 填自己的 API Key |

#### 7.6.5 Anthropic 兼容接口示例

| 字段 | 示例 |
|---|---|
| Base URL | `https://api.anthropic.com` |
| Model | `claude-3-5-sonnet-latest` |
| 协议 | Anthropic 兼容 |
| Key | 填自己的 API Key |

#### 7.6.6 不配置 API 时能干什么

- 刷题、错题、收藏、导入导出全部可用。
- 「复制上下文」可用。
- 直接追问 AI 会回退到「复制上下文」并提示，不会把题目主动发到外部服务。

### 7.7 关于密钥的明确原则

- 仓库代码中没有任何内嵌的 API Key、Token、用户名或密码。
- 任何 AI Key 都由用户在自己浏览器输入，或由部署者在自己的 `.env` 中配置。
- 不要把包含 Key 的 `.env`、`config.toml` 加入仓库；建议 `git status` 在每次提交前检查一次。
- 学习记录 JSON 不包含 Key；账号/密码只在用户使用过程中临时存在于会话中。

---

## 8. 文件结构

```text
408-quiz/
├── index.html          # 单页入口，包含三大路由容器
├── data.json           # 题库数据
├── assets/
│   ├── app.css         # 全局样式
│   ├── app.js          # 旧版兼容脚本，保留
│   └── js/
│       ├── state.js    # 全局状态、进度、备份
│       ├── api.js      # API 请求、账号和进度辅助
│       ├── utils.js    # DOM/Markdown/Toast 工具
│       ├── router.js   # #/quiz、#/wiki、#/guide 路由
│       ├── quiz.js     # 题目列表、渲染、答题逻辑
│       ├── auth.js     # 登录注册和账号菜单
│       ├── wiki.js     # 知识库保存、搜索、预览、编辑、软删除
│       ├── ai.js       # AI 面板、提示词、追问和保存入口
│       ├── search.js   # 题库搜索、关联题目和批量弹窗
│       └── app-init.js # 加载数据并启动应用
├── images/             # 题图资源
└── README.md
```

脚本以 classic `<script>` 方式加载，不是 ES modules。加载顺序见：

```text
assets/js/README.md
```

---

## 9. 开发说明

当前没有构建步骤；修改 HTML/CSS/JS 后直接刷新页面即可。

基础检查：

```bash
node --check assets/js/*.js
```

注意：当前 `npm run test` 仍是占位脚本，会输出：

```text
Error: no test specified
```

因此提交前需要用 `node --check`、服务端 `py_compile` 和针对性 smoke/ad-hoc 脚本验证实际改动。

---

## 10. 数据来源

项目根目录的 `data.json` 是刷题数据文件。它由题库提取脚本生成，不需要应用运行时联网下载。

数据生成流程大致是：

1. 读取四门科目的章节 Markdown。
2. 找到每章的习题精选和答案解析。
3. 提取 4 选项题。
4. 配对题干、选项、答案和解析。
5. 输出标准化 JSON 到本项目目录。

只要保持 `data.json` 结构一致，也可以替换成自己的题库。

---

## 11. 常见问题

### 为什么线上页面看起来还是旧版？

通常是浏览器缓存。可以尝试：

```text
Ctrl + F5
```

或打开：

```text
https://quiz.hermesjj.com/?v=20260703#/wiki
```

### 新账号为什么看不到旧知识库？

这是预期行为。个人知识库按账号隔离，新账号默认是空知识库，不会继承其他用户的内容。

### 删除知识库条目会永久删除吗？

不会。当前删除是软删除，会移动到用户目录下的回收位置。

### 不配置 AI API 能用吗？

可以刷题，也可以复制上下文；只有直接追问 AI 和自动生成讲解需要 API 或后端代理支持。

### 我应该担心密钥泄漏吗？

不需要。仓库代码不包含任何内嵌的 API Key；用户配置的 Key 只保存在自己浏览器 `localStorage`，后端 `.env` 也不入库。建议提交前用 `git status` 确认没有意外加入 `.env`、`.toml`、包含 Key 的日志。
