# finance-analytics / 天才交易台

A 股延迟盯盘台（风格参考主流交易看板）+ 全球标的研究页，部署在 Cloudflare。

## 线上地址

| 页面 | URL |
|------|-----|
| 盯盘台 | https://finance-analytics-web.2148983461.workers.dev/dashboard |
| 行情 | https://finance-analytics-web.2148983461.workers.dev/market |
| 自选 | https://finance-analytics-web.2148983461.workers.dev/watchlist |
| 预测 | https://finance-analytics-web.2148983461.workers.dev/predictions |
| 全球 | https://finance-analytics-web.2148983461.workers.dev/global |
| API | https://finance-analytics-api.2148983461.workers.dev |

## 已实现（MVP）

- 四大指数条、资金流向、情绪综述、指数分时、涨跌分布、快讯、领涨板块联动
- 数据：东方财富公开延迟接口（失败时指数回退腾讯行情）
- 全球 Yahoo 延迟行情与规则因子预测仍保留

## Cloudflare Workers Builds

| Worker | 根目录 | 构建命令 | 部署命令 |
|--------|--------|----------|----------|
| finance-analytics-web | `apps/web` | `npx opennextjs-cloudflare build` | `npx opennextjs-cloudflare deploy` |
| finance-analytics-api | `apps/api` | **必须留空** | `npx wrangler deploy` |
| finance-analytics-realtime | `apps/realtime` | **必须留空** | `npx wrangler deploy` |

## 免责声明

公开接口延迟数据，仅供学习研究，不构成投资建议。与「天才交易员」等第三方站点无官方关联。
