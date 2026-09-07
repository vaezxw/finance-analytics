# finance-analytics

基金与全球股票数据分析站点（看板 / 准实时行情 / 预测），部署在 Cloudflare。

## 线上地址

| 服务 | URL |
|------|-----|
| Web | https://finance-analytics-web.2148983461.workers.dev |
| 自选盯盘 | https://finance-analytics-web.2148983461.workers.dev/watchlist |
| 预测 | https://finance-analytics-web.2148983461.workers.dev/predictions |
| API | https://finance-analytics-api.2148983461.workers.dev |
| Realtime WS | `wss://finance-analytics-realtime.2148983461.workers.dev/ws?room=demo` |

手机浏览器直接打开 Web 地址即可（无需本机开机）。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js + OpenNext → Workers |
| 查询 API | Hono on Workers（D1 / KV / R2）；Python FastAPI Worker 因 Windows/pywrangler 暂未部署，源码保留备选 |
| 实时 | Durable Objects WebSocket |
| 任务 | Cron（每日同步报价缓存） |
| 行情源 | Yahoo Finance 公开延迟接口（MVP） |

## 仓库结构

```
apps/web/       # Next.js 前端
apps/api/       # Hono API Worker
apps/realtime/  # Durable Object
apps/compute/   # Container 占位（后续因子/ML）
migrations/     # D1 schema
```

## Cloudflare Workers Builds（Git 自动部署）

每个 Worker **单独连接**仓库，根目录与命令如下（Cloudflare 会先自动执行 `npm ci`，构建命令里不必再写 `npm install`）：

| Worker | 根目录 | 构建命令 | 部署命令 |
|--------|--------|----------|----------|
| finance-analytics-web | `apps/web` | `npx opennextjs-cloudflare build` | `npx opennextjs-cloudflare deploy` |
| finance-analytics-api | `apps/api` | **必须留空** | `npx wrangler deploy` |
| finance-analytics-realtime | `apps/realtime` | **必须留空** | `npx wrangler deploy` |

重要：api / realtime **不要**把构建命令写成 `npm install`。Cloudflare 已自动执行 `npm ci`，再跑一次 `npm install` 容易因 peer 依赖冲突失败。

各应用自带独立 `package-lock.json`，不要用仓库根目录作为 Root directory。

`apps/api` 是 **Hono/TypeScript** Worker，目录里不要放 `uv.lock` / `pyproject.toml`，否则 Cloudflare Builds 会误跑 `uv sync` 导致失败。

## 免责声明

行情与展示内容仅供学习研究，不构成投资建议。
