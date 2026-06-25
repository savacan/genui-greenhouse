"use client";

export interface QuakeRowView {
  id: string;
  mag: number;
  place: string;
  depthKm: number;
  ageHours: number;
  alert: string | null;
  tsunami: boolean;
}

const ALERT_TONE: Record<string, string> = { red: "haz", orange: "haz", yellow: "warn", green: "" };

function age(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}分前`;
  if (h < 48) return `${Math.round(h)}時間前`;
  return `${Math.round(h / 24)}日前`;
}

/** 地震ランキング表（マグニチュード順）。rows は /quakes/quakes をそのままバインド（生のまま）。 */
export function QuakeList({ rows, caption }: { rows: QuakeRowView[]; caption?: string | null }) {
  return (
    <div className="sc-tablewrap">
      {caption ? <div className="sc-table-cap">{caption}</div> : null}
      <table className="sc-table">
        <thead>
          <tr>
            <th className="num">M</th>
            <th>場所</th>
            <th className="num">深さ</th>
            <th className="num">いつ</th>
            <th>警報</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.alert === "red" || r.alert === "orange" ? "haz" : undefined}>
              <td className="num strong">{r.mag.toFixed(1)}</td>
              <td>
                {r.place}
                {r.tsunami ? <span className="sc-badge sc-badge--danger" style={{ marginLeft: 8 }}>津波</span> : null}
              </td>
              <td className="num">{r.depthKm}km</td>
              <td className="num dim">{age(r.ageHours)}</td>
              <td>
                {r.alert ? (
                  <span className={`sc-badge sc-badge--${r.alert === "red" || r.alert === "orange" ? "danger" : r.alert === "yellow" ? "warn" : "ok"}`}>
                    {r.alert.toUpperCase()}
                  </span>
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
