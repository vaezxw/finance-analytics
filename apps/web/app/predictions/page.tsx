"use client";

import { useEffect, useState } from "react";
import { SiteShell, fmtPct, pctClass } from "@/components/SiteShell";
import { API_BASE } from "@/lib/config";

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

export default function PredictionsPage() {
  const [items, setItems] = useState<Prediction[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [running, setRunning] = useState(false);

  async function load() {
    const res = await fetch(`${API_BASE}/api/v1/predictions`);
    if (!res.ok) return;
    const json = await res.json();
    setItems(json.items ?? []);
    setDisclaimer(json.disclaimer ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  async function runAll() {
    setRunning(true);
    try {
      await fetch(`${API_BASE}/api/v1/predictions/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <SiteShell>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>规则因子预测</h1>
      <p style={{ color: "#8b95a8", fontSize: 13 }}>
        当前基于全球标的日线因子（动量/均线/RSI）。A 股因子模型后续接入。
      </p>
      <button
        type="button"
        onClick={runAll}
        disabled={running}
        style={{
          marginBottom: 12,
          background: "#1c2330",
          border: "1px solid #3d8bfd",
          color: "#e8edf5",
          padding: "8px 12px",
          cursor: "pointer",
        }}
      >
        {running ? "计算中…" : "重新计算"}
      </button>
      {disclaimer && (
        <p style={{ color: "#f0b429", fontSize: 12 }}>{disclaimer}</p>
      )}
      <div className="panel">
        <div className="panel-bd">
          {items.map((item) => (
            <div className="flow-row" key={item.id}>
              <span>
                {item.symbol}{" "}
                <span style={{ color: "#8b95a8" }}>{item.as_of}</span>
              </span>
              <span
                className={
                  item.direction === "up"
                    ? "up"
                    : item.direction === "down"
                      ? "down"
                      : "flat"
                }
              >
                {item.direction.toUpperCase()} · {item.score.toFixed(3)}
              </span>
              <span style={{ color: "#8b95a8" }}>
                conf {(item.confidence * 100).toFixed(0)}% · RSI{" "}
                {item.factors?.rsi14?.toFixed(1) ?? "--"} · ret5{" "}
                {fmtPct((item.factors?.ret5 ?? 0) * 100)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
