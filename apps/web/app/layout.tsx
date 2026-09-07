import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "天才交易台",
  description: "A股延迟盯盘台 · 基金与全球标的研究",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
