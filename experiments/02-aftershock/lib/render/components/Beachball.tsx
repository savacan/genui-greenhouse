"use client";

export interface Plane {
  strike: number;
  dip: number;
  rake: number;
}

const C = 60;
const R = 50;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** bearing（北=上・時計回り）→ 円周上の点（SVG 座標, y は下向き）。 */
const pt = (bearing: number) => [C + R * Math.sin(rad(bearing)), C - R * Math.cos(rad(bearing))] as const;

/** 連続する2方位の間の扇形パス（短い側）。 */
function wedge(a: number, b: number): string {
  const [x1, y1] = pt(a);
  const [x2, y2] = pt(b);
  return `M ${C} ${C} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

// 塗り/線は inline 属性で持つ（CSS クラス経由の fill/stroke が path/line で描画されない環境差があるため）。
const COMP = "#4cc9ff";
const RIM_FILL = "#16213a";
const RIM_STROKE = "#93a1c0";
const PLANE = "#e8eefc";

/**
 * 発震機構のビーチボール（模式図）。2つの節面 strike を直径として描き、対向する2象限を
 * 圧縮側として塗る震源球。planes=/quakeDetail/nodalPlanes（生のまま）。厳密な投影ではなく
 * 「断層型が一目で分かる」模式表現（dip/rake はラベル/分類でサーバ側が担保）。
 */
export function Beachball({ planes, faultType }: { planes: Plane[]; faultType?: string | null }) {
  const s1 = planes[0]?.strike ?? 0;
  const s2 = planes[1]?.strike ?? s1 + 90;
  const bounds = [s1 % 360, s2 % 360, (s1 + 180) % 360, (s2 + 180) % 360].sort((a, b) => a - b);
  const sectors = [
    [bounds[0], bounds[1]],
    [bounds[1], bounds[2]],
    [bounds[2], bounds[3]],
    [bounds[3], bounds[0] + 360],
  ] as const;

  return (
    <div className="sc-beachball">
      <svg className="sc-beachball__svg" viewBox="0 0 120 120" role="img" aria-label={faultType ?? "focal mechanism"}>
        <circle cx={C} cy={C} r={R} fill={RIM_FILL} stroke={RIM_STROKE} strokeWidth={1.5} />
        {sectors.map(([a, b], i) =>
          i % 2 === 0 ? <path key={i} d={wedge(a, b)} fill={COMP} fillOpacity={0.3} /> : null,
        )}
        {[s1, s2].map((s, i) => {
          const [x1, y1] = pt(s);
          const [x2, y2] = pt(s + 180);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={PLANE} strokeWidth={1.5} />;
        })}
        <circle cx={C} cy={C} r={R} fill="none" stroke={RIM_STROKE} strokeWidth={1.5} />
      </svg>
      {faultType ? <div className="sc-beachball__lbl">{faultType}</div> : null}
    </div>
  );
}
