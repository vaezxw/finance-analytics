# finance-analytics

基金与全球股票数据分析站点（看板 / 准实时行情 / 预测）。

## 技术栈（Cloudflare）

| 层 | 技术 |
|----|------|
| 前端 | Next.js + OpenNext → Workers |
| 查询 API | FastAPI on Python Workers |
| 采集 / 因子 / ML | Cloudflare Containers（Python） |
| 存储 | D1 + KV + R2 |
| 任务 | Cron Triggers + Queues |
| 实时 | Durable Objects WebSocket |

## 仓库结构

```
apps/web/       # Next.js 前端
apps/api/       # FastAPI Python Worker
apps/realtime/  # Durable Object（盯盘 WebSocket）
apps/compute/   # Container：同步 / 因子 / 训练
```

## 本地开发

```bash
# 前端（后续接入 OpenNext）
cd apps/web && npm install && npm run dev

# API（需 uv + pywrangler）
cd apps/api && uv sync && uv run pywrangler dev
```

生产部署到 Cloudflare 后，可用手机浏览器访问公网域名；无需本机常开。

## 免责声明

本项目展示的行情与预测结果仅供学习与研究，不构成投资建议。
