"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Prediction = {
  id: string;
  symbol: string;
  as_of: string;
  score: number;
  direction: "up" | "down" | "neutral";
  confidence: number;
  factors?: {
    ret5?: number;
    ret20?: number;
    vol20?: number;
    rsi14?: number;
    distMa20?: number;
  };
  model_version: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://finance-analytics-api.2148983461.workers.dev";

export default function PredictionsPage() {
  const [items, setItems] = useState<Prediction[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/predictions`);
      if (!res.ok) throw new Error("load_failed");
      const json = await res.json();
      setItems(json.items ?? []);
      setDisclaimer(json.disclaimer ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runAll() {
    setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/predictions/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("run_failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 0%, #2a1f3b 0%, #0b1210 48%, #070a09 100%)",
        color: "#e8f0ea",
        padding: "2rem 1.25rem 3rem",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: 14 }}>
          <Link href="/" style={{ color: "#9fd0b3" }}>
            看板
          </Link>
          <Link href="/watchlist" style={{ color: "#9fd0b3" }}>
            自选盯盘
          </Link>
          <span style={{ opacity: 0.5 }}>预测</span>
        </nav>

        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", marginBottom: 8 }}>
          规则因子预测（V1）
        </h1>
        <p style={{ opacity: 0.8, maxWidth: 680, lineHeight: 1.5 }}>
          基于动量、均线偏离、RSI 与波动率的合成打分，展望约 5 个交易日方向。这不是机器学习模型，更不是投资建议。
        </p>

        <button
          type="button"
          onClick={runAll}
          disabled={running}
          style={{
            marginTop: "0.5rem",
            padding: "0.55rem 1rem",
            border: "1px solid #c3a6ff",
            background: "rgba(195,166,255,0.12)",
            color: "#e8f0ea",
            cursor: running ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {running ? "计算中…" : "重新计算全部种子标的"}
        </button>

        {disclaimer && (
          <p style={{ color: "#ffd29c", fontSize: 13, marginTop: "1rem" }}>{disclaimer}</p>
        )}
        {loading && <p>加载中…</p>}
        {error && <p style={{ color: "#ffb4a8" }}>{error}</p>}

        <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.25rem" }}>
          {items.map((item) => {
            const color =
              item.direction === "up"
                ? "#7ddea0"
                : item.direction === "down"
                  ? "#ff9b8a"
                  : "#d7c38a";
            return (
              <div
                key={item.id}
                style={{
                  border: "1px solid rgba(232,240,234,0.15)",
                  padding: "0.9rem 1rem",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "1.25rem" }}>{item.symbol}</div>
                    <div style={{ opacity: 0.65, fontSize: 13 }}>
                      as of {item.as_of} · {item.model_version}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color, fontSize: "1.2rem" }}>
                      {item.direction.toUpperCase()} · score {item.score.toFixed(3)}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                      confidence {(item.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                {item.factors && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
                      gap: 8,
                      marginTop: 12,
                      fontSize: 13,
                      opacity: 0.85,
                    }}
                  >
                    <span>ret5: {((item.factors.ret5 ?? 0) * 100).toFixed(2)}%</span>
                    <span>ret20: {((item.factors.ret20 ?? 0) * 100).toFixed(2)}%</span>
                    <span>RSI14: {(item.factors.rsi14 ?? 0).toFixed(1)}</span>
                    <span>vs MA20: {((item.factors.distMa20 ?? 0) * 100).toFixed(2)}%</span>
                    <span>vol20: {((item.factors.vol20 ?? 0) * 100).toFixed(2)}%</span>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && items.length === 0 && (
            <p style={{ opacity: 0.7 }}>暂无预测结果，点击上方按钮生成。</p>
          )}
        </div>
      </div>
    </main>
  );
}
