export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://finance-analytics-api.2148983461.workers.dev";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  "wss://finance-analytics-realtime.2148983461.workers.dev/ws?room=demo";
