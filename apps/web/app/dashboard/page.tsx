"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SiteShell,
  fmtFlow,
  fmtNum,
  fmtPct,
  pctClass,
} from "@/components/SiteShell";
import { API_BASE } from "@/lib/config";

type IndexQuote = {
  secid: string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

type DashboardData = {
  updatedAt: string;
  indices: IndexQuote[];
  breadth: {
    buckets: Array<{ label: string; count: number; tone: "up" | "down" | "flat" }>;
    up: number;
    down: number;
    flat: number;
  };
  boards: Array<{
    code: string;
    name: string;
    changePercent: number;
    netInflow: number;
    leadingStocks: Array<{ code: string; name: string; changePercent: number }>;
  }>;
  flows: Array<{
    code: string;
    name: string;
    changePercent: number;
    netInflow: number;
  }>;
  news: Array<{
    id: string;
    title: string;
    time: string;
    important?: boolean;
  }>;
  sentiment: string;
  disclaimer: string;
};

type Intraday = {
  secid: string;
  preClose: number;
  points: Array<{ time: string; price: number; volume: number }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [intraday, setIntraday] = useState<Intraday | null>(null);
  const [secid, setSecid] = useState("1.000001");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/cn/dashboard`);
      if (!res.ok) throw new Error("dashboard_failed");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadIntraday(id: string) {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/cn/intraday?secid=${encodeURIComponent(id)}`,
      );
      if (!res.ok) throw new Error("intraday_failed");
      setIntraday(await res.json());
    } catch {
      // keep previous chart
    }
  }

  useEffect(() => {
    loadDashboard();
    const t = setInterval(loadDashboard, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadIntraday(secid);
    const t = setInterval(() => loadIntraday(secid), 20000);
    return () => clearInterval(t);
  }, [secid]);

  const maxBreadth = useMemo(() => {
    const counts = data?.breadth?.buckets?.map((b) => b.count) ?? [1];
    return Math.max(1, ...counts);
  }, [data]);

  return (
    <SiteShell>
      {loading && <p style={{ color: "#8b95a8" }}>加载盯盘数据…</p>}
      {error && <p style={{ color: "#f04645" }}>加载失败：{error}</p>}

      {data && (
        <>
          <div className="index-strip">
            {data.indices.map((idx) => (
              <button
                key={idx.secid}
                type="button"
                className="index-card"
                onClick={() => setSecid(idx.secid)}
                style={{
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                  outline: secid === idx.secid ? "1px solid #3d8bfd" : undefined,
                }}
              >
                <div className="name">{idx.name}</div>
                <div className={`price ${pctClass(idx.changePercent)}`}>
                  {fmtNum(idx.price)}
                </div>
                <div className={`chg ${pctClass(idx.changePercent)}`}>
                  {fmtNum(idx.change)} ({fmtPct(idx.changePercent)})
                </div>
              </button>
            ))}
          </div>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-hd">
                <span>资金流向（概念主力净流入）</span>
                <span style={{ color: "#8b95a8", fontSize: 11 }}>延迟</span>
              </div>
              <div className="panel-bd flow-list">
                {data.flows.slice(0, 8).map((f) => (
                  <div className="flow-row" key={f.code}>
                    <span>{f.name}</span>
                    <span className={pctClass(f.changePercent)}>
                      {fmtPct(f.changePercent)}
                    </span>
                    <span className={pctClass(f.netInflow)}>
                      {fmtFlow(f.netInflow)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>市场情绪综述</span>
              </div>
              <div className="panel-bd">
                <div className="sentiment">{data.sentiment}</div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>指数分时</span>
                <span style={{ color: "#8b95a8", fontSize: 11 }}>
                  {data.indices.find((i) => i.secid === secid)?.name}
                </span>
              </div>
              <div className="panel-bd">
                <IntradayChart data={intraday} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>涨跌分布</span>
                <span style={{ fontSize: 11 }}>
                  <span className="up">{data.breadth.up}</span>/
                  <span className="flat">{data.breadth.flat}</span>/
                  <span className="down">{data.breadth.down}</span>
                </span>
              </div>
              <div className="panel-bd">
                <div className="breadth-bars">
                  {(data.breadth.buckets ?? []).map((b) => (
                    <div className="breadth-col" key={b.label}>
                      <div
                        className="bar"
                        style={{
                          height: `${(b.count / maxBreadth) * 100}%`,
                          background:
                            b.tone === "up"
                              ? "#f04645"
                              : b.tone === "down"
                                ? "#00b578"
                                : "#6b7280",
                        }}
                        title={`${b.label}: ${b.count}`}
                      />
                      <div className="lbl">{b.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>快讯公告</span>
              </div>
              <div className="panel-bd news-list">
                {data.news.length === 0 && (
                  <div style={{ color: "#8b95a8", fontSize: 12 }}>暂无快讯</div>
                )}
                {data.news.map((n) => (
                  <div className="news-item" key={n.id}>
                    <span className="t">{String(n.time).slice(11, 16) || n.time}</span>
                    {n.title}
                    {n.important ? <span className="tag-hot">重要</span> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="panel" style={{ marginBottom: 8 }}>
            <div className="panel-hd">
              <span>当日领涨 · 强联动</span>
              <span style={{ color: "#8b95a8", fontSize: 11 }}>
                更新 {new Date(data.updatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="dash-bottom">
            {data.boards.map((b) => (
              <div className="board-card" key={b.code}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <h3>{b.name}</h3>
                  <strong className={pctClass(b.changePercent)}>
                    {fmtPct(b.changePercent)}
                  </strong>
                </div>
                <div style={{ color: "#8b95a8", fontSize: 11, margin: "4px 0 8px" }}>
                  主力净流入 {fmtFlow(b.netInflow)}
                </div>
                {b.leadingStocks.map((s) => (
                  <div className="stock-row" key={s.code}>
                    <span>
                      {s.name}{" "}
                      <span style={{ color: "#8b95a8" }}>{s.code}</span>
                    </span>
                    <span className={pctClass(s.changePercent)}>
                      {fmtPct(s.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p style={{ color: "#f0b429", fontSize: 12, marginTop: 12 }}>
            {data.disclaimer}
          </p>
        </>
      )}
    </SiteShell>
  );
}

function IntradayChart({ data }: { data: Intraday | null }) {
  if (!data?.points?.length) {
    return <div style={{ color: "#8b95a8", fontSize: 12 }}>分时加载中…</div>;
  }
  const prices = data.points.map((p) => p.price);
  const min = Math.min(...prices, data.preClose);
  const max = Math.max(...prices, data.preClose);
  const w = 360;
  const h = 160;
  const pts = data.points
    .map((p, i) => {
      const x = (i / Math.max(1, data.points.length - 1)) * w;
      const y = h - ((p.price - min) / (max - min || 1)) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  const last = data.points[data.points.length - 1]?.price ?? data.preClose;
  const up = last >= data.preClose;
  const preY = h - ((data.preClose - min) / (max - min || 1)) * (h - 8) - 4;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxHeight: 180 }}>
      <line
        x1="0"
        x2={w}
        y1={preY}
        y2={preY}
        stroke="#3a4456"
        strokeDasharray="4 4"
      />
      <polyline
        fill="none"
        stroke={up ? "#f04645" : "#00b578"}
        strokeWidth="1.8"
        points={pts}
      />
    </svg>
  );
}
