# finance-analytics

基金与全球股票数据分析站点（看板 / 准实时行情 / 预测），部署在 Cloudflare。

## 线上地址

| 服务 | URL |
|------|-----|
| Web | https://finance-analytics-web.2148983461.workers.dev |
| API | https://finance-analytics-api.2148983461.workers.dev |
| Realtime | https://finance-analytics-realtime.2148983461.workers.dev |

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

## 本地开发

需 Node.js 22+（当前 Wrangler 要求）。

```bash
npm install
npm run dev:web
npm run dev:api
```

## 免责声明

行情与展示内容仅供学习研究，不构成投资建议。
