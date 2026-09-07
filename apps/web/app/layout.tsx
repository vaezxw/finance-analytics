import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "finance-analytics",
  description: "Fund and global equity analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
