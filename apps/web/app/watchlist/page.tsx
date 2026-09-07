"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Quote = {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
};

type WatchItem = {
  watchlist_id: string;
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  quote?: Quote | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://finance-analytics-api.2148983461.workers.dev";
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  "wss://finance-analytics-realtime.2148983461.workers.dev/ws?room=demo";
const USER_ID = "demo";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [lastTs, setLastTs] = useState<number | null>(null);

  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);

  const refreshWatchlist = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/v1/watchlist?user_id=${USER_ID}`);
    if (!res.ok) throw new Error("watchlist_load_failed");
    const json = await res.json();
    const nextItems: WatchItem[] = json.items ?? [];
    setItems(nextItems);
    const seed: Record<string, Quote> = {};
    for (const item of nextItems) {
      if (item.quote) seed[item.symbol] = item.quote;
    }
    setQuotes((prev) => ({ ...seed, ...prev }));
  }, []);

  useEffect(() => {
    refreshWatchlist().catch((e) =>
      setError(e instanceof Error ? e.message : "load failed"),
    );
  }, [refreshWatchlist]);

  useEffect(() => {
    if (symbols.length === 0) {
      setStatus("offline");
      return;
    }

    let closed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        if (closed) return;
        setStatus("live");
        ws?.send(JSON.stringify({ type: "subscribe", symbols }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === "quotes" && msg.quotes) {
            setQuotes((prev) => ({ ...prev, ...msg.quotes }));
            setLastTs(msg.ts ?? Date.now());
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("offline");
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [symbols.join(",")]);

  async function addSymbol() {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;
    setError(null);
    const res = await fetch(`${API_BASE}/api/v1/watchlist?user_id=${USER_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) {
      setError("添加失败");
      return;
    }
    setSymbolInput("");
    await refreshWatchlist();
  }

  async function removeSymbol(symbol: string) {
    await fetch(
      `${API_BASE}/api/v1/watchlist/${encodeURIComponent(symbol)}?user_id=${USER_ID}`,
      { method: "DELETE" },
    );
    await refreshWatchlist();
  }

  return (
    <main
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, #243447 0%, #0b1210 50%, #070a09 100%)",
        color: "#e8f0ea",
        padding: "2rem 1.25rem 3rem",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: 14 }}>
          <Link href="/" style={{ color: "#9fd0b3" }}>
            看板
          </Link>
          <span style={{ opacity: 0.5 }}>自选盯盘</span>
        </nav>

        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "0 0 0.5rem" }}>
          自选盯盘
        </h1>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          WebSocket 约 15 秒推送一次延迟报价。状态：
          <strong style={{ marginLeft: 8 }}>
            {status === "live" ? "已连接" : status === "connecting" ? "连接中" : "未连接"}
          </strong>
          {lastTs ? (
            <span style={{ opacity: 0.6, marginLeft: 8 }}>
              更新于 {new Date(lastTs).toLocaleTimeString()}
            </span>
          ) : null}
        </p>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="例如 AAPL / SPY"
            style={{
              padding: "0.55rem 0.7rem",
              borderRadius: 0,
              border: "1px solid rgba(232,240,234,0.25)",
              background: "rgba(0,0,0,0.25)",
              color: "#e8f0ea",
              minWidth: 160,
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={addSymbol}
            style={{
              padding: "0.55rem 1rem",
              border: "1px solid #7ddea0",
              background: "rgba(125,222,160,0.15)",
              color: "#e8f0ea",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            加入自选
          </button>
        </div>

        {error && <p style={{ color: "#ffb4a8" }}>{error}</p>}

        <div style={{ display: "grid", gap: "0.75rem" }}>
          {items.length === 0 && (
            <p style={{ opacity: 0.7 }}>暂无自选，先添加一只股票或基金 ETF。</p>
          )}
          {items.map((item) => {
            const q = quotes[item.symbol] ?? item.quote;
            const up = (q?.changePercent ?? 0) >= 0;
            return (
              <div
                key={item.watchlist_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "center",
                  border: "1px solid rgba(232,240,234,0.15)",
                  padding: "0.9rem 1rem",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div>
                  <div style={{ fontSize: "1.2rem" }}>{item.symbol}</div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>{item.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {q ? (
                    <>
                      <div style={{ fontSize: "1.2rem" }}>
                        {q.price.toFixed(2)} {q.currency}
                      </div>
                      <div style={{ color: up ? "#7ddea0" : "#ff9b8a", fontSize: 14 }}>
                        {q.change.toFixed(2)} ({q.changePercent.toFixed(2)}%)
                      </div>
                    </>
                  ) : (
                    <div style={{ opacity: 0.6 }}>等待报价…</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeSymbol(item.symbol)}
                  style={{
                    border: "1px solid rgba(255,155,138,0.5)",
                    background: "transparent",
                    color: "#ff9b8a",
                    cursor: "pointer",
                    padding: "0.35rem 0.6rem",
                    fontFamily: "inherit",
                  }}
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
