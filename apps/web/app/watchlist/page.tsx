"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteShell, fmtNum, fmtPct, pctClass } from "@/components/SiteShell";
import { API_BASE, WS_URL } from "@/lib/config";

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
  quote?: Quote | null;
};

const USER_ID = "demo";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
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
      ws.onerror = () => ws?.close();
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
    const res = await fetch(`${API_BASE}/api/v1/watchlist?user_id=${USER_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) {
      setError("添加失败（全球标的）");
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
    <SiteShell>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>自选盯盘</h1>
      <p style={{ color: "#8b95a8", fontSize: 13, marginTop: 0 }}>
        当前自选仍接全球 Yahoo 延迟源；A 股个股自选下一期接入。状态：
        <strong style={{ marginLeft: 6 }}>
          {status === "live" ? "已连接" : status === "connecting" ? "连接中" : "未连接"}
        </strong>
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="AAPL / SPY"
          style={{
            background: "#12161c",
            border: "1px solid #242b36",
            color: "#e8edf5",
            padding: "8px 10px",
          }}
        />
        <button
          type="button"
          onClick={addSymbol}
          style={{
            background: "#1c2330",
            border: "1px solid #3d8bfd",
            color: "#e8edf5",
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          加入
        </button>
      </div>
      {error && <p style={{ color: "#f04645" }}>{error}</p>}

      <div className="panel">
        <div className="panel-bd">
          {items.map((item) => {
            const q = quotes[item.symbol] ?? item.quote;
            return (
              <div className="flow-row" key={item.watchlist_id}>
                <span>
                  {item.symbol}{" "}
                  <span style={{ color: "#8b95a8" }}>{item.name}</span>
                </span>
                <span className={pctClass(q?.changePercent)}>
                  {q ? `${fmtNum(q.price)} (${fmtPct(q.changePercent)})` : "等待报价"}
                </span>
                <button
                  type="button"
                  onClick={() => removeSymbol(item.symbol)}
                  style={{
                    background: "transparent",
                    border: "1px solid #3a4456",
                    color: "#8b95a8",
                    cursor: "pointer",
                  }}
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </SiteShell>
  );
}
