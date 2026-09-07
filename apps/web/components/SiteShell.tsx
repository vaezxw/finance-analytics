"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/dashboard", label: "盯盘台" },
  { href: "/market", label: "行情" },
  { href: "/watchlist", label: "自选" },
  { href: "/predictions", label: "预测" },
  { href: "/global", label: "全球" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">财</span>
          <div>
            <div className="brand-name">天才交易台</div>
            <div className="brand-sub">A股延迟盯盘 · MVP</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link active" : "nav-link"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-right">
          <span className="pill">延迟行情</span>
          <span className="pill muted">非投资建议</span>
        </div>
      </header>
      <main className="page-main">{children}</main>
      <footer className="site-footer">
        公开接口延迟数据，仅供学习研究。界面风格参考主流 A 股盯盘台，非官方关联。
      </footer>
    </div>
  );
}

export function pctClass(v?: number) {
  if (v == null || !Number.isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

export function fmtPct(v?: number) {
  if (v == null || !Number.isFinite(v)) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtNum(v?: number, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "--";
  return v.toFixed(digits);
}

export function fmtFlow(v?: number) {
  if (v == null || !Number.isFinite(v)) return "--";
  const yi = v / 1e8;
  if (Math.abs(yi) >= 1) return `${yi >= 0 ? "+" : ""}${yi.toFixed(2)}亿`;
  const wan = v / 1e4;
  return `${wan >= 0 ? "+" : ""}${wan.toFixed(0)}万`;
}
