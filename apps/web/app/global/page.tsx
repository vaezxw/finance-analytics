"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteShell, fmtNum, fmtPct, pctClass } from "@/components/SiteShell";
import { API_BASE } from "@/lib/config";

type Instrument = {
  id: string;
  symbol: string;
  name: string;
};

type Quote = {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
};

type Candle = { date: string; close: number };

export default function GlobalPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState("SPY");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/instruments`)
      .then((r) => r.json())
      .then((j) => setInstruments(j.items ?? []));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/v1/quote/${selected}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/v1/ohlcv/${selected}?range=3mo`).then((r) =>
        r.json(),
      ),
    ]).then(([q, o]) => {
      setQuote(q.quote ?? null);
      setCandles(o.candles ?? []);
    });
  }, [selected]);

  const spark = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const w = 420;
    const h = 120;
    const pts = closes
      .map((v, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((v - min) / (max - min || 1)) * h;
        return `${x},${y}`;
      })
      .join(" ");
    return { pts, w, h };
  }, [candles]);

  return (
    <SiteShell>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>全球标的</h1>
      <p style={{ color: "#8b95a8", fontSize: 13 }}>
        保留原 Yahoo 延迟行情能力，用于美股/ETF/基金研究。
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {instruments.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setSelected(i.symbol)}
            style={{
              background: selected === i.symbol ? "#1c2330" : "transparent",
              border:
                selected === i.symbol ? "1px solid #3d8bfd" : "1px solid #242b36",
              color: "#e8edf5",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            {i.symbol}
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="panel-bd">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 22 }}>{selected}</div>
              <div style={{ color: "#8b95a8", fontSize: 13 }}>
                {instruments.find((i) => i.symbol === selected)?.name}
              </div>
            </div>
            {quote && (
              <div style={{ textAlign: "right" }}>
                <div className={pctClass(quote.changePercent)} style={{ fontSize: 22 }}>
                  {fmtNum(quote.price)} {quote.currency}
                </div>
                <div className={pctClass(quote.changePercent)}>
                  {fmtPct(quote.changePercent)}
                </div>
              </div>
            )}
          </div>
          {spark && (
            <svg
              width="100%"
              viewBox={`0 0 ${spark.w} ${spark.h}`}
              style={{ marginTop: 12 }}
            >
              <polyline
                fill="none"
                stroke="#3d8bfd"
                strokeWidth="2"
                points={spark.pts}
              />
            </svg>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
