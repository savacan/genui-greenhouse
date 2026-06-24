"use client";

export interface AsteroidRowView {
  name: string;
  hazardous: boolean;
  diameterM: number;
  missLunar: number;
  missKm: number;
  velocityKmh: number;
  date: string;
}

export function AsteroidTable({
  rows,
  caption,
}: {
  rows: AsteroidRowView[];
  caption?: string | null;
}) {
  if (!rows?.length) return <p className="sc-text sc-text--muted">この期間に接近小惑星はありません。</p>;
  return (
    <div className="sc-tablewrap">
      {caption ? <div className="sc-table-cap">{caption}</div> : null}
      <table className="sc-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>接近日</th>
            <th className="num">最接近 (月距離)</th>
            <th className="num">直径 (m)</th>
            <th className="num">速度 (km/h)</th>
            <th>危険</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.hazardous ? "haz" : ""}>
              <td className="mono">{r.name}</td>
              <td>{r.date}</td>
              <td className="num strong">{r.missLunar.toFixed(1)}</td>
              <td className="num">{r.diameterM.toLocaleString()}</td>
              <td className="num">{r.velocityKmh.toLocaleString()}</td>
              <td>
                {r.hazardous ? (
                  <span className="sc-badge sc-badge--danger">⚠ 要注意</span>
                ) : (
                  <span className="sc-dim">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
