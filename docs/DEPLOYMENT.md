# 部署指南

本项目使用 hash 路由（`#/quiz`、`#/wiki`、`#/guide`），纯静态部署不需要服务端 SPA 路由回退。没有 `/api/*` 时，前端会自动进入 `LOCAL` 模式。

## 部署形态

| 形态 | 能力 |
|---|---|
| GitHub Pages / 静态托管 | 刷题、本地错题和收藏、搜索、导入导出、复制 AI 上下文 |
| Nginx / Caddy / Docker 静态站点 | 与静态托管相同，可绑定自己的域名与 HTTPS |
| 静态前端 + `/api/*` 后端 | 增加登录、账号同步、页面内 AI 和个人知识库 |

## GitHub Pages

1. Fork 或推送仓库到自己的 GitHub 仓库。
2. 打开 `Settings -> Pages`。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/root`。
5. 等待部署完成后访问：

```text
https://<你的用户名>.github.io/<仓库名>/
```

项目资源使用相对路径，可以部署在仓库子路径下。GitHub Pages 没有后端，因此页面会显示 `LOCAL`。

## Nginx

把仓库同步到静态目录：

```bash
sudo mkdir -p /var/www/408-quiz
sudo rsync -a --delete --exclude node_modules ./ /var/www/408-quiz/
```

示例配置：

```nginx
server {
    listen 80;
    server_name quiz.example.com;

    root /var/www/408-quiz;
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location = /data.json {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(?:css|js|svg|jpg|jpeg|png|webp|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }
}
```

验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://quiz.example.com/
```

`index.html` 和 `data.json` 不应长期缓存，否则代码或题库更新后用户可能仍看到旧版本。当前部分 JavaScript 文件没有内容哈希，因此如需强缓存，建议先统一引入版本化文件名或查询参数。

## Caddy

```caddyfile
quiz.example.com {
    root * /var/www/408-quiz

    @fresh path / /index.html /data.json
    header @fresh Cache-Control "no-cache"

    file_server
}
```

重载：

```bash
sudo systemctl reload caddy
```

## Docker

无需编写 Dockerfile，可直接挂载到 Nginx：

```bash
docker run -d \
  --name 408-quiz \
  --restart unless-stopped \
  -p 8767:80 \
  -v "$PWD:/usr/share/nginx/html:ro" \
  nginx:1.27-alpine
```

访问：

```text
http://127.0.0.1:8767/
```

这种最简方式使用镜像默认缓存策略。生产环境建议挂载自定义 Nginx 配置，参考上一节设置 `index.html` 和 `data.json` 的缓存头。

## Docker Compose

```yaml
services:
  quiz:
    image: nginx:1.27-alpine
    container_name: 408-quiz
    restart: unless-stopped
    ports:
      - "8767:80"
    volumes:
      - ./:/usr/share/nginx/html:ro
```

```bash
docker compose up -d
curl -I http://127.0.0.1:8767/
```

## 接入后端

前端使用同源 `/api/*`。如果后端监听 `127.0.0.1:8787`，Nginx 可增加：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

这里保留了原始 `/api/...` 路径。若后端路由不包含 `/api` 前缀，需要相应调整 `proxy_pass` 和重写规则。

接口契约见 [`BACKEND_API.md`](BACKEND_API.md)。

## 部署检查

```bash
npm install
npm test
curl -I https://quiz.example.com/
curl -I https://quiz.example.com/data.json
```

浏览器中至少检查：

1. `#/quiz` 能加载题库。
2. 静态模式显示 `LOCAL`。
3. 子路径部署时 CSS、JavaScript、favicon 和题图无 404。
4. 完整模式下 `/api/auth/me` 返回 JSON，未登录时显示登录页。
