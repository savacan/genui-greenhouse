"use client";

// 半円ダイヤル: kp0 = 左(180°), kp9 = 右(0°)。上半円を時計回りに。
const CX = 100;
const CY = 100;
const R = 80;

function point(kp: number): [number, number] {
  const a = ((180 - (kp / 9) * 180) * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}
function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const ZONES = [
  { from: 0, to: 4, color: "#3fb950" }, // 静穏
  { from: 4, to: 5, color: "#d4a72c" }, // 不穏
  { from: 5, to: 7, color: "#ff8a5d" }, // 小〜中規模嵐
  { from: 7, to: 9, color: "#ff5d6c" }, // 大規模嵐
];

/** 惑星 Kp 指数(0-9)のダイヤル＋ G スケールバッジ。盤面のトーンもこの値に従う。 */
export function KpDial({ kp, gScale }: { kp: number; gScale: string }) {
  const v = Math.max(0, Math.min(9, kp));
  const [nx, ny] = point(v);
  const tone = kp >= 7 ? "red" : kp >= 5 ? "orange" : kp >= 4 ? "amber" : "green";

  return (
    <div className="sc-kpdial">
      <svg viewBox="0 0 200 116" className="sc-kpdial__svg">
        {ZONES.map((z, i) => (
          <path key={i} d={arc(z.from, z.to)} stroke={z.color} className="sc-kpdial__zone" />
        ))}
        <line x1={CX} y1={CY} x2={nx.toFixed(1)} y2={ny.toFixed(1)} className={`sc-kpdial__needle is-${tone}`} />
        <circle cx={CX} cy={CY} r={6} className="sc-kpdial__hub" />
      </svg>
      <div className={`sc-kpdial__readout is-${tone}`}>
        <span className="sc-kpdial__kp">{`Kp ${kp}`}</span>
        <span className="sc-kpdial__g">{gScale}</span>
      </div>
    </div>
  );
}
