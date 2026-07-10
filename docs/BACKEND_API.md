# 后端接口契约

当前仓库只包含前端。要启用登录、账号同步、页面内 AI 和个人知识库，需要在同一站点下提供兼容的 `/api/*` 服务。

## 通用约定

- 前端使用 `credentials: same-origin` 或 `include`，推荐使用同源会话 Cookie。
- JSON 请求使用 `Content-Type: application/json`。
- 失败响应建议返回 `{ "error": "可读错误信息" }`。
- Cookie 建议设置 `HttpOnly`、`SameSite=Lax`，HTTPS 下增加 `Secure`。
- 密钥只保存在后端环境变量或 Secret Manager。

## 认证

### `GET /api/auth/me`

未登录：

```json
{ "user": null }
```

已登录：

```json
{ "user": { "id": "user-id", "username": "alice" } }
```

如果该接口网络失败或返回非成功状态，前端会判断后端不可用并进入 `LOCAL` 模式。因此，完整后端应在未登录时返回 `200` 和 `{ "user": null }`，不要返回 `401`。

### `POST /api/auth/login`

请求：

```json
{ "username": "alice", "password": "password" }
```

响应：

```json
{ "user": { "id": "user-id", "username": "alice" } }
```

### `POST /api/auth/register`

请求：

```json
{ "username": "alice", "password": "password" }
```

响应格式与登录相同。

### `POST /api/auth/logout`

清理会话 Cookie。响应可以是空 JSON 对象。

### `POST /api/auth/password`

已登录用户修改密码：

```json
{ "currentPassword": "old-password", "newPassword": "new-password" }
```

后端应验证当前密码、新密码至少 6 位且不能与旧密码相同。修改成功后保留当前会话，并撤销该账号的其他会话：

```json
{ "ok": true }
```

## 学习进度

### `GET /api/progress`

```json
{
  "progress": {
    "state": {
      "wrong": {},
      "favorite": {},
      "stats": { "answered": 0, "correct": 0 },
      "attempted": {},
      "reviews": {},
      "dailyActivity": {}
    },
    "session": null,
    "preferences": {}
  }
}
```

新账号可以返回：

```json
{ "progress": null }
```

### `PUT /api/progress`

请求：

```json
{ "progress": { "state": {}, "session": null, "preferences": {}, "savedAt": "ISO-8601" } }
```

后端应按当前用户覆盖或合并保存，并限制请求体大小。

`reviews` 保存逐题复习状态，包括答题次数、连续答对次数、最近作答时间、下次到期时间、复习间隔和有限历史记录；`dailyActivity` 保存按日期聚合的答题量与正确量。它们与 `wrong`、`favorite`、`attempted` 一样属于普通 JSON 进度字段，后端不需要执行排期算法，但必须原样持久化并在下一次 `GET /api/progress` 中返回。旧进度缺少这两个字段时，前端会自动补齐并迁移现有错题。

## AI

### `GET /api/ai/status`

可用：

```json
{ "enabled": true, "model": "your-model-name" }
```

不可用：

```json
{ "enabled": false, "model": "unavailable" }
```

### `POST /api/ai/chat`

请求：

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true
}
```

非流式响应：

```json
{ "content": "回答正文", "model": "your-model-name" }
```

流式响应使用 Server-Sent Events 风格的数据帧：

```text
data: {"delta":"第一段"}

data: {"delta":"第二段"}

data: [DONE]

```

反向代理应关闭响应缓冲，否则浏览器无法实时显示增量内容。

## 个人知识库

前端使用以下接口：

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/wiki/save-question` | 保存题目或概念笔记 |
| `POST` | `/api/wiki/search` | 搜索或浏览当前用户的笔记 |
| `POST` | `/api/wiki/note` | 读取一篇笔记 |
| `POST` | `/api/wiki/note/update` | 更新 Markdown 正文 |
| `POST` | `/api/wiki/note/delete` | 软删除笔记 |

### `POST /api/wiki/save-question`

请求头包含前端生成的幂等键：

```text
Idempotency-Key: quiz-408-dev-...
```

请求体：

```json
{
  "payload": {
    "question_kind": "concept",
    "source_question_id": "question-id",
    "source_question_title": "计算机网络 第1章 示例题",
    "subject": "计算机网络",
    "title": "示例概念",
    "question_markdown": "问题正文",
    "assistant_explanation": "AI 或题库解析",
    "topic_tags": ["章节", "概念问题"],
    "takeaways": ["复习要点"],
    "status": "错误"
  }
}
```

`question_kind` 当前为 `concept` 或 `exam`。实际 payload 还可能包含 `first_user_question`、`latest_user_question`、`selected`、`correct`、`status_tags`、`attempt_id`、`user_answer` 和 `mistakes`。后端应允许这些字段，并返回保存后的路径或笔记信息。

### `POST /api/wiki/search`

请求：

```json
{ "query": "TCP", "limit": 20, "kind": "all", "scope": "question" }
```

无关键词浏览时，前端会把 `query` 设为空字符串，并把 `limit` 提高到 `120`。响应至少需要包含：

```json
{
  "results": [
    {
      "path": "wiki/question/计算机网络/example.md",
      "title": "示例笔记",
      "subject": "计算机网络",
      "question_kind": "concept",
      "updated_at": "ISO-8601"
    }
  ]
}
```

### `POST /api/wiki/note`

请求：

```json
{ "path": "wiki/question/计算机网络/example.md", "kind": "all" }
```

响应应包含用于显示和并发更新的字段：

```json
{
  "path": "wiki/question/计算机网络/example.md",
  "title": "示例笔记",
  "content": "渲染或展示用 Markdown",
  "raw_content": "原始 Markdown",
  "mtime": 1710000000
}
```

### `POST /api/wiki/note/update`

```json
{
  "path": "wiki/question/计算机网络/example.md",
  "content": "更新后的 Markdown",
  "expected_mtime": 1710000000
}
```

后端应使用 `expected_mtime` 或等价版本字段阻止静默覆盖较新的修改。

### `POST /api/wiki/note/delete`

```json
{ "path": "wiki/question/计算机网络/example.md", "reason": "user-request" }
```

前端文案约定该操作移动到当前用户知识库下的 `.trash`，而不是永久删除。

后端必须：

- 从会话中确定用户，不能信任客户端提交的用户目录。
- 对所有文件路径做规范化和路径穿越校验。
- 限制查询长度、Markdown 大小和返回条数。
- 按账号隔离搜索、读取、更新和删除。
- 删除时移动到用户自己的回收位置，而不是直接永久删除。
- 对保存操作支持 `Idempotency-Key`，避免重复点击产生重复文件。

## 推荐职责

完整后端通常包括：

- 静态文件服务或反向代理。
- 账号注册、登录、退出和会话管理。
- 按账号保存学习进度。
- AI 模型代理、超时、限流和流式转发。
- 按账号隔离的 Markdown 知识库。
- 数据库与知识库目录的备份和恢复策略。

仓库不包含这些服务端实现，也不规定后端语言或框架。
