"use client";

export interface WindPoint {
  t: string;
  speed: number;
}

/** 太陽風の計器群（速度の推移スパークライン＋速度/密度/温度/Bz タイル）。針が動く＝ライブ感の核。 */
export function SolarWindGauges({
  speed,
  density,
  temperature,
  bz,
  series,
}: {
  speed: number;
  density: number;
  temperature: number;
  bz: number | null;
  series: WindPoint[];
}) {
  const spk = sparkline(series.map((p) => p.speed));
  // ロケール非依存に固定（toLocaleString の既定ロケールは環境で変わり SSR hydration を壊しうる）。
  const grp = (n: number) => n.toLocaleString("en-US");
  const tiles: Array<{ label: string; value: string; unit: string; hot: boolean }> = [
    { label: "太陽風速度", value: grp(Math.round(speed)), unit: "km/s", hot: speed > 500 },
    { label: "密度", value: density.toFixed(1), unit: "p/cm³", hot: density > 20 },
    { label: "温度", value: grp(Math.round(temperature / 1000)), unit: "×10³K", hot: false },
  ];
  if (bz != null) tiles.push({ label: "磁場 Bz", value: bz.toFixed(1), unit: "nT", hot: bz <= -10 });

  return (
    <div className="sc-sw">
      {spk ? (
        <div className="sc-sw__spark">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="sc-sw__sparksvg">
            <polyline points={spk} />
          </svg>
          <span className="sc-sw__sparklbl">太陽風速度の推移（直近2時間）</span>
        </div>
      ) : null}
      <div className="sc-sw__tiles">
        {tiles.map((t, i) => (
          <div key={i} className={`sc-sw__tile${t.hot ? " is-hot" : ""}`}>
            <div className="sc-sw__val">
              {t.value}
              <span className="sc-sw__unit"> {t.unit}</span>
            </div>
            <div className="sc-sw__lbl">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function sparkline(vals: number[]): string | null {
  const ok = vals.filter((v) => Number.isFinite(v) && v > 0);
  if (ok.length < 2) return null;
  const min = Math.min(...ok);
  const max = Math.max(...ok);
  const span = max - min || 1;
  return ok
    .map((v, i) => {
      const x = (i / (ok.length - 1)) * 100;
      const y = 29 - ((v - min) / span) * 27;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
