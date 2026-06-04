# Codex 接手说明

> 给 codex/claude-code/codeium 看的快速上下文。
> 项目根目录：`/Users/lijunjie/408-quiz` · 核心文件：`index.html`（~3000 行，所有功能都在这一个 HTML 里）+ `data.json`（题库，~2.2MB）

---

## 1. 这是什么

**408 考研刷题工具**（单页 Web 应用，无后端）。用户在浏览器里刷王道 4 本教材的选择题，支持快捷键、自动保存、错题本、收藏、AI 讲题。视觉风格刻意做成"纸面刷题册"。

**已上线的核心功能**：
- 题目切换：← / →、A-D 或 1-4 选项、Enter 提交/下一题、F 收藏
- 学习状态 localStorage 自动保存（书目/章节/模式/题号/本轮答案/题单顺序/错题/收藏/统计）
- 导入/导出 JSON 备份。**Key 故意不进导出 JSON**
- 底部进度条 UI 已去掉，只剩"学习记录 / 自动保存 · 导出记录 · 导入记录"
- 顶部品牌：408 圆形章印 + 双行品牌
- 题目卡片：题干左线 + 阅读行宽 + 克制状态标签
- **AI 讲题面板**：接真实 API（OpenAI 兼容 / Anthropic 兼容双协议，自动推断），流式 SSE + AbortController 停止 + 失败回退到本地整理。**单按钮"询问 AI" + 兜底"复制上下文"**。
- 答题反馈：判分瞬间左线变色 + bloom 光晕（**shake 震动已关**）
- 金句批注：header 内联 + 题库导航中间两个位置，10 句混合（5 CS + 5 中文古典），带 ‹/› 切换

---

## 2. 视觉系统 — **不要动**

**Atelier Zero 纸面刷题工具**（已锁定，反 SaaS、反营销页）：

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#efe7d2` | 米黄纸底 |
| `--primary` | `#ed6f5c` | 珊瑚主色（替代典型蓝） |
| `--ink` | `#15140f` | 深墨字 |
| `--panel` | `#f7f1de` | 卡片骨色 |
| 副色 | `#6e7448` 橄榄 / `#e9b94a` 芥末 / `#15140f` 墨 | 状态、批注 |
| 字体 | `Playfair Display` 斜体（只品牌/题号/数字） + `Inter Tight` 中文走系统字 + `JetBrains Mono`（题号/章节/键盘提示） | 三栈 |

**母题**：`.label` 标签（小写大写 + 0.22em 字间距 + 18px 珊瑚短线前置）、hairline 分隔线、珊瑚圆点终止符、圆圈数字环（虚/实切换）、纸张噪点纹理、暗色圆圈按钮 + 珊瑚 hover 翻填。

**绝对不要**：换成冷色科技蓝、纯白 dashboard、纯灰 SaaS 调、加 Inter/Roboto/Arial 当 display face、加渐变背景、加 emoji 装饰图标。

---

## 3. 渲染管线 — **两块都接 KaTeX + 围栏代码块**

题目区走 `formatContent()`,AI 面板走 `renderMarkdown()`。**两者共用同一套占位符协议**：

```
0. 先 KaTeX（块 $$...$$ 先吃 + 行内 $...$ 边界保护）→ \x00KTX<n>\x00
1. 再 FENCE_RE 围栏代码块 ```lang\n...\n``` → \x00CODE<n>\x00
2. escape 文本（占位符前缀是控制字符，不会被解析）
3. 行内 markdown 转换（bold/em/code/link）
4. 还原 CB 占位符 + highlightCode()
5. 还原 KTX 占位符（katexRender 产物的 HTML 直接拼）
```

**两个最易踩的坑**：
- 块级结构（`>` 引用、`#` 标题、`-` 列表）必须在 escape **之前** 检测，否则 `>` 变 `&gt;` 失效
- KaTeX 和围栏代码块都必须在 escape 之前取出来当占位符，否则会被 HTML escape 二次破坏

题目里 `$T_{CS} > T_{MS} > T_{PS}$` 这类公式 / ```awk\nP1 () { x=1; }\n``` 这类伪代码都走这条管线。

---

## 4. AI 面板架构

```
用户输入
   ↓
runAsk(ask)                       // index.html 里
   ↓
streamAiApi(messages, onDelta, askAbort.signal)   // 统一入口
   ↓
协议推断: baseUrl 含 "anthropic" → Anthropic, 否则 → OpenAI
   ↓
[OpenAI] streamOpenAI()           // SSE 解析 + ReadableStream
[Anthropic] requestAnthropic()    // 非流式（后续可加 SSE）
   ↓
onDelta(delta) 累积 → appendAiDelta() → renderMarkdown() + 保留 ▍ 光标
   ↓
endAiStream() 去光标 + bloom 效果
```

**关键常量**：
- 默认 `https://api.deepseek.com` + `deepseek-v4-flash`（**只在用户没保存时预填**,不写进 `getAiCfg()`,避免 ⚙ 误显示"已配置"激活态）
- 超时：流式 180s / 一次性 120s
- 失败回退：`getQuestionContext()` 拼追问上下文 + ⚠️ 前导
- 提示词模板在 `buildAiMessages()` 里，按 mode 切分 — 改这里就能调讲解风格，不用动 fetch 逻辑

**localStorage `408-quiz-ai-cfg`**：`{baseUrl, model, protocol, apiKey}` — **不在 session snapshot、不在导出 JSON**，key 单独存，备份/分享不会泄露。

**Key 处理铁律**：
- **永远不要把 API key 嵌进 HTML**（用户已在 chat 里露过 DeepSeek/Anthropic key，提醒过 rotate）
- 走 ⚙ 配置 UI 粘 key，只存 localStorage
- 部署到任何公网位置之前，把 key rotate 一次

---

## 5. localStorage 字段（导入导出要兼容）

| Key | 用途 | 导出 JSON |
|---|---|---|
| `408-quiz-v1` | session snapshot（书目/章节/模式/题号/本轮答案/题单顺序/错题/收藏/统计） | ✅ 进 |
| `408-quiz-ai-cfg` | AI 配置（含 apiKey） | ❌ **故意不进** |

**别动 session snapshot 的字段名** — 已经有用户的存档在飞，加字段要向后兼容（旧 snapshot 缺字段时给默认值）。

---

## 6. 用户偏好（行为约束）

- **动效敏感** — `prefers-reduced-motion` 媒体查询要尊重；小动作（shake / 弹跳）会被打回。答错只左线变红 + bloom，**不要再加震动**
- **不要在题卡底部加快捷键提示条** — 用户原话"题卡底部不显示快捷键提示条"。功能保留在键盘监听里即可，不显示 UI
- **短答案优先** — 不要长篇总结，1-2 句把结果摆出来，再问下一步
- **决策要 push 一下** — 用户有时会给方向但没想清楚（"加配图/像营销页"其实意思是"完成度"），要先 push 一轮再动
- **本地中文优先** — UI locale `zh-CN`，所有用户可见文字用中文；`id` / `value` / class 名不翻译
- **装饰物不污染状态** — 金句/题号书签/任何装饰性 UI，**不要写进 session snapshot 或 localStorage**

---

## 7. 已知失败 / 避免再踩

- **Playwright 装过但 macOS 沙盒拦截 Chromium 启动** — 不是项目代码问题，别浪费时间重装
- **DeepSeek/Anthropic key 在 chat 里露过** — 提醒用户 rotate，**绝不**写进 HTML
- **配置区"协议"下拉原本用裸 `<select>` 溢出** — 已在 CSS 把 `select` 拉进 `.ai-cfg-row input` 同款规则。**以后加任何 form 元素都直接继承这个 class 链**
- **KaTeX 二次 escape bug** — 之前先 escHtml 再 KaTeX，`>` 变 `&amp;gt;` 字面化。**管道顺序不能改**（占位符 → escape → 还原）
- **Anthropic 协议 + 流式** — 目前 Anthropic 走非流式，后续若要加 SSE 解析，独立写 `streamAnthropic()`,别在 `streamOpenAI()` 里加 if 分支

---

## 8. 后续可选方向（已排序的"低风险"清单）

**1. 空状态 / Loading 视觉**（~50 行）— 收藏夹空、错题本空、首次进入、API 加载占位。极简线稿 + 珊瑚点缀，跟纸面感一致。**最高杠杆**。
**2. 选项 A/B/C/D 快捷键提示**（~30 行）— 每个选项左边加 mono 字母标签，用过 5 次后淡出。纸面"涂卡"感。
**3. 题号定位书签**（~15 行）— 题号区右侧加 1.5px 珊瑚短线 + 小三角书签。边际价值最低。
**4. 完成度微调（不用找图）** — 墨迹扩散/数字滚动/入场 stagger/header 滚动渐隐。

**别做**：
- 装饰性配图（除非用户给图能过"暖米黄 + 留白 > 60% + 克制"三关）
- 营销页背景图
- 抖动 / 弹跳 / 旋转等强动效
- 把快捷键功能从键盘监听里拿出来做成 UI 按钮

---

## 9. 跑起来

```bash
cd /Users/lijunjie/408-quiz
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/index.html
```

**不要**用 `file://` 直接打开 — localStorage 行为会怪。

**git**：`main` 分支，root commit `7cf5300`，最近 `bbc863f`（金句批注）。`git log` 看历史，`git diff` 比改动。

---

## 10. 一句话精神

> "能静下心刷题"的工具，不是营销页，不是 SaaS landing，不是 AI 助手壳。
> 功能 = 真的能刷题 + 真的能记住 + 真的能讲题。
> 视觉 = 纸面感 + 克制 + 留白 + 母题延续。
> 任何改动如果让这两个变弱，停下来重新想。
