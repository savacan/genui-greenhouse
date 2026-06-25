export default function Page() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "10vh auto", padding: "0 1.5rem", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: "1.4rem" }}>aftershock — Phase A</h1>
      <p>
        実験02。いまはデータ層（<code>lib/monitor/</code>）だけが実装済み。UI（Phase B）と
        multi-step tool loop（Phase C）はこれから。
      </p>
      <p>
        データ層の実 API 検証はブラウザでなく probe で:
        <br />
        <code>pnpm --filter aftershock probe</code>
      </p>
      <p style={{ color: "#666", fontSize: ".9rem" }}>
        設計: <code>docs/aftershock.md</code>
      </p>
    </main>
  );
}
