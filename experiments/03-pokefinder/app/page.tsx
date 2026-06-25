import Link from "next/link";

/** Phase C で本体（問い → LLM がフォームを組む → 操作 → 探す → 結果）に置き換える暫定トップ。 */
export default function Home() {
  return (
    <main className="pf-shell">
      <header className="pf-topbar">
        <span className="pf-logo">◓ Pokéfinder</span>
        <span className="pf-sub">genui-greenhouse 実験03 · LLM が双方向の入力フォームを組む</span>
      </header>
      <section className="pf-panel">
        <p className="pf-text">Phase B（双方向フォームのブラウザ検証）はこちら:</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/demo" className="pf-actionbtn pf-actionbtn--primary" style={{ textDecoration: "none", display: "inline-block" }}>
            /demo を開く
          </Link>
        </p>
        <p className="pf-text pf-text--muted" style={{ marginTop: 12 }}>Phase C で本体（問い → LLM がフォームを生成 → 探す → 結果）に差し替え。</p>
      </section>
    </main>
  );
}
