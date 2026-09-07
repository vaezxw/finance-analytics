"use client";

import { useEffect, useState } from "react";
import { SiteShell, fmtNum, fmtPct, pctClass } from "@/components/SiteShell";
import { API_BASE } from "@/lib/config";

type IndexQuote = {
  secid: string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

type Board = {
  code: string;
  name: string;
  changePercent: number;
  netInflow: number;
  leadingStocks: Array<{ code: string; name: string; changePercent: number }>;
};

export default function MarketPage() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    async function load() {
      const [iRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/cn/indices`),
        fetch(`${API_BASE}/api/v1/cn/boards?limit=12`),
      ]);
      if (iRes.ok) setIndices((await iRes.json()).items ?? []);
      if (bRes.ok) setBoards((await bRes.json()).items ?? []);
    }
    load();
  }, []);

  return (
    <SiteShell>
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>A股行情</h1>
      <div className="index-strip">
        {indices.map((idx) => (
          <div className="index-card" key={idx.code}>
            <div className="name">{idx.name}</div>
            <div className={`price ${pctClass(idx.changePercent)}`}>
              {fmtNum(idx.price)}
            </div>
            <div className={`chg ${pctClass(idx.changePercent)}`}>
              {fmtPct(idx.changePercent)}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-hd">
          <span>概念板块涨幅榜</span>
        </div>
        <div className="panel-bd">
          {boards.map((b) => (
            <div className="flow-row" key={b.code}>
              <span>{b.name}</span>
              <span className={pctClass(b.changePercent)}>
                {fmtPct(b.changePercent)}
              </span>
              <span style={{ color: "#8b95a8" }}>
                {b.leadingStocks[0]?.name ?? "--"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
