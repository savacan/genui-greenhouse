"use client";

/**
 * 結果ボードのスプライトカード・グリッド（出力部品）。02 の QuakeList と同型 = 部品が配列の反復を持つ
 * （json-render の repeat を spec に書かせず、/findMons/mons をそのままバインド）。
 * 種族値は 0-255 のバー、タイプは色付きバッジ。色は表示の関心なのでここで引く（サーバ map の2例目・許容）。
 */

const TYPE_COLORS: Record<string, string> = {
  normal: "#9fa19f", fire: "#e62829", water: "#2980ef", electric: "#fac000",
  grass: "#3fa129", ice: "#3dcef3", fighting: "#ff8000", poison: "#9141cb",
  ground: "#915121", flying: "#81b9ef", psychic: "#ef4179", bug: "#91a119",
  rock: "#afa981", ghost: "#704170", dragon: "#5060e1", dark: "#624d4e",
  steel: "#60a1b8", fairy: "#ef70ef",
};

const STAT_ROWS: Array<{ key: string; label: string }> = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "こうげき" },
  { key: "defense", label: "ぼうぎょ" },
  { key: "spAtk", label: "とくこう" },
  { key: "spDef", label: "とくぼう" },
  { key: "speed", label: "すばやさ" },
];

export interface MonGridRow {
  id: number;
  name: string;
  sprite: string | null;
  types: string[];
  hp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
  total: number;
}

export function MonGrid({ mons }: { mons: MonGridRow[] }) {
  if (!mons?.length) {
    return <p className="pf-empty">該当ゼロ。条件をゆるめてみて。</p>;
  }
  return (
    <div className="pf-grid">
      {mons.map((m) => (
        <article key={m.id} className="pf-card">
          <div className="pf-card__head">
            {m.sprite ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="pf-sprite" src={m.sprite} alt={m.name} width={84} height={84} />
            ) : (
              <div className="pf-sprite pf-sprite--empty">?</div>
            )}
            <div className="pf-card__id">
              <div className="pf-card__name">{m.name}</div>
              <div className="pf-card__types">
                {m.types.map((t) => (
                  <span key={t} className="pf-typebadge" style={{ background: TYPE_COLORS[t] ?? "#888" }}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="pf-card__total">合計 {m.total}</div>
            </div>
          </div>
          <div className="pf-stats">
            {STAT_ROWS.map((s) => {
              const v = (m as unknown as Record<string, number>)[s.key] ?? 0;
              return (
                <div key={s.key} className="pf-statrow">
                  <span className="pf-statrow__label">{s.label}</span>
                  <span className="pf-statrow__bar">
                    <span className="pf-statrow__fill" style={{ width: `${Math.min(100, (v / 200) * 100)}%` }} />
                  </span>
                  <span className="pf-statrow__val">{v}</span>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
