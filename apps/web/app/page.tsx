export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720 }}>
      <h1>finance-analytics</h1>
      <p>
        基金与全球股票数据分析（看板 / 准实时 / 预测）。后续将部署到 Cloudflare，手机可随时访问。
      </p>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        本站内容仅供学习研究，不构成投资建议。
      </p>
    </main>
  );
}
