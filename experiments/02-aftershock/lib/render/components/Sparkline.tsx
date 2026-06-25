"use client";

export interface SparkPoint {
  t: string;
  temp: number;
}

const W = 280;
const H = 60;
const PAD = 6;

/** 気温推移スパークライン（軽量 SVG）。points=/weather/sparkline（生のまま）。 */
export function Sparkline({ points, label }: { points: SparkPoint[]; label?: string | null }) {
  if (!points?.length) return <div className="sc-fallback">気温データなし</div>;
  const temps = points.map((p) => p.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((p.temp - min) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="sc-spark">
      <div className="sc-spark__head">
        <span className="sc-spark__label">{label ?? "気温の推移（48h）"}</span>
        <span className="sc-spark__range">{min.toFixed(0)}–{max.toFixed(0)}°C</span>
      </div>
      <svg className="sc-spark__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <polyline points={coords.join(" ")} />
      </svg>
    </div>
  );
}
