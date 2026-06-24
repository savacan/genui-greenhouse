"use client";

export interface OvalPoint {
  lon: number;
  lat: number;
  prob: number;
}

const CX = 160;
const CY = 160;
const R = 132;
const MIN_LAT = 30; // これより赤道側はチャート外

// 極方位図: 極が中心、|lat|=90→中心、|lat|=30→外周。lon=方位（0°を上に）。
function latToR(absLat: number): number {
  const c = Math.max(MIN_LAT, Math.min(90, absLat));
  return ((90 - c) / (90 - MIN_LAT)) * R;
}
function polar(lon: number, lat: number): [number, number] {
  const r = latToR(Math.abs(lat));
  const a = (lon * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

/** オーロラ楕円の極方位ビュー。観測地の緯度リングとドットを重ね、「楕円が自分の緯度に届くか」を一目で。 */
export function AuroraOvalGlobe({
  band,
  hemisphere,
  observerLat,
  observerLon,
}: {
  band: OvalPoint[];
  hemisphere: string;
  observerLat: number | null;
  observerLon: number | null;
}) {
  const rings = [30, 45, 60, 75];
  const poleLabel = hemisphere === "S" ? "南極" : "北極";
  const obs = observerLat != null && observerLon != null ? polar(observerLon, observerLat) : null;
  const obsRingR = observerLat != null ? latToR(Math.abs(observerLat)) : null;

  return (
    <div className="sc-aurora">
      <svg viewBox="0 0 320 320" className="sc-aurora__svg">
        <defs>
          <radialGradient id="sc-aurora-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0a1530" />
            <stop offset="100%" stopColor="#060b18" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R} fill="url(#sc-aurora-bg)" stroke="#243049" />

        {/* 緯度リング＋ラベル */}
        {rings.map((lat) => {
          const r = latToR(lat);
          return (
            <g key={lat}>
              <circle cx={CX} cy={CY} r={r} className="sc-aurora__latring" />
              <text x={CX + 3} y={CY - r + 11} className="sc-aurora__latlbl">{`${lat}°`}</text>
            </g>
          );
        })}

        {/* オーロラ帯（確率で発光） */}
        {band.map((p, i) => {
          const [x, y] = polar(p.lon, p.lat);
          const op = Math.max(0.12, Math.min(0.85, p.prob / 40));
          return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={2.4} fill="#3fe08f" fillOpacity={op} className="sc-aurora__glow" />;
        })}

        {/* 観測地の緯度リング＋ドット */}
        {obsRingR != null ? (
          <circle cx={CX} cy={CY} r={obsRingR} className="sc-aurora__obsring" />
        ) : null}
        {obs ? (
          <>
            <circle cx={obs[0].toFixed(1)} cy={obs[1].toFixed(1)} r={6} className="sc-aurora__obsdot" />
            <text x={obs[0].toFixed(1)} y={(obs[1] - 11).toFixed(1)} className="sc-aurora__obslbl" textAnchor="middle">{"現在地"}</text>
          </>
        ) : null}

        <text x={CX} y={CY + 4} className="sc-aurora__pole" textAnchor="middle">{poleLabel}</text>
      </svg>
    </div>
  );
}
