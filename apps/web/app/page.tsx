"use client";

import { useEffect, useMemo, useState } from "react";

type Instrument = {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  market: string;
};

type Quote = {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
};

type SectorItem = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
};

type Candle = {
  date: string;
  close: number;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://finance-analytics-api.2148983461.workers.dev";

export default function HomePage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState("SPY");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [instRes, sectorRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/instruments`),
          fetch(`${API_BASE}/api/v1/sectors/snapshot`),
        ]);
        if (!instRes.ok || !sectorRes.ok) {
          throw new Error("API request failed");
        }
        const instJson = await instRes.json();
        const sectorJson = await sectorRes.json();
        if (cancelled) return;
        setInstruments(instJson.items ?? []);
        setSectors(sectorJson.items ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSymbol() {
      try {
        const [qRes, oRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/quote/${selected}`),
          fetch(`${API_BASE}/api/v1/ohlcv/${selected}?range=3mo`),
        ]);
        if (!qRes.ok || !oRes.ok) throw new Error(`No data for ${selected}`);
        const qJson = await qRes.json();
        const oJson = await oRes.json();
        if (cancelled) return;
        setQuote(qJson.quote ?? null);
        setCandles(oJson.candles ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "symbol load failed");
      }
    }
    loadSymbol();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const spark = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const w = 320;
    const h = 80;
    const pts = closes
      .map((v, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((v - min) / (max - min || 1)) * h;
        return `${x},${y}`;
      })
      .join(" ");
    return { pts, w, h, first: closes[0], last: closes[closes.length - 1] };
  }, [candles]);

  return (
    <main
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #1f3b2c 0%, #0b1210 45%, #070a09 100%)",
        color: "#e8f0ea",
        padding: "2rem 1.25rem 3rem",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7, margin: 0 }}>
          finance-analytics
        </p>
        <nav style={{ display: "flex", gap: "1rem", margin: "0.75rem 0", fontSize: 14 }}>
          <span style={{ opacity: 0.5 }}>看板</span>
          <a href="/watchlist" style={{ color: "#9fd0b3" }}>
            自选盯盘
          </a>
          <a href="/predictions" style={{ color: "#9fd0b3" }}>
            预测
          </a>
        </nav>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: "0.4rem 0 0.6rem" }}>
          基金与全球股票看板
        </h1>
        <p style={{ opacity: 0.8, maxWidth: 640, lineHeight: 1.5 }}>
          Cloudflare 已上线：标的列表、报价、日线与板块涨跌。数据来自公开延迟行情，仅供研究，不构成投资建议。
        </p>

        {loading && <p>加载中…</p>}
        {error && (
          <p style={{ color: "#ffb4a8" }}>加载异常：{error}</p>
        )}

        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem", opacity: 0.9 }}>板块快照</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.75rem",
            }}
          >
            {sectors.map((s) => (
              <div
                key={s.symbol}
                style={{
                  border: "1px solid rgba(232,240,234,0.15)",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>{s.symbol}</div>
                <div style={{ fontSize: 14 }}>{s.name}</div>
                <div
                  style={{
                    marginTop: 6,
                    color: s.changePercent >= 0 ? "#7ddea0" : "#ff9b8a",
                  }}
                >
                  {s.changePercent?.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", opacity: 0.9 }}>标的详情</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "0.75rem 0 1rem" }}>
            {instruments.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setSelected(i.symbol)}
                style={{
                  cursor: "pointer",
                  border:
                    selected === i.symbol
                      ? "1px solid #7ddea0"
                      : "1px solid rgba(232,240,234,0.2)",
                  background:
                    selected === i.symbol ? "rgba(125,222,160,0.15)" : "transparent",
                  color: "#e8f0ea",
                  padding: "0.4rem 0.7rem",
                  fontFamily: "inherit",
                }}
              >
                {i.symbol}
              </button>
            ))}
          </div>

          <div
            style={{
              border: "1px solid rgba(232,240,234,0.15)",
              padding: "1rem",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1.5rem" }}>{selected}</div>
                <div style={{ opacity: 0.7, fontSize: 14 }}>
                  {instruments.find((i) => i.symbol === selected)?.name}
                </div>
              </div>
              {quote && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.6rem" }}>
                    {quote.price.toFixed(2)} {quote.currency}
                  </div>
                  <div
                    style={{
                      color: quote.changePercent >= 0 ? "#7ddea0" : "#ff9b8a",
                    }}
                  >
                    {quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%) · {quote.marketState}
                  </div>
                </div>
              )}
            </div>

            {spark && (
              <svg
                width="100%"
                viewBox={`0 0 ${spark.w} ${spark.h}`}
                style={{ marginTop: "1rem", maxWidth: 480 }}
              >
                <polyline
                  fill="none"
                  stroke="#7ddea0"
                  strokeWidth="2"
                  points={spark.pts}
                />
              </svg>
            )}
            {candles.length > 0 && (
              <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 0 }}>
                近 {candles.length} 个交易日 · {candles[0]?.date} → {candles[candles.length - 1]?.date}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
