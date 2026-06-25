"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MagRow {
  place: string;
  mag: number;
  alert: string | null;
}

const ALERT_FILL: Record<string, string> = {
  red: "#ff5d6c",
  orange: "#ff8a5d",
  yellow: "#d4a72c",
  green: "#3ddc97",
};

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MagRow }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="sc-tip">
      <div className="sc-tip__name">M{r.mag.toFixed(1)}</div>
      <div>{r.place}</div>
      {r.alert ? <div className="sc-tip__haz">PAGER {r.alert}</div> : null}
    </div>
  );
}

/** マグニチュード横棒（規模の比較）。rows=/quakes/quakes（place,mag,alert を使う・生のまま）。 */
export function MagnitudeBars({ rows }: { rows: MagRow[] }) {
  const data = rows.slice(0, 12);
  const h = Math.max(160, data.length * 30 + 30);
  return (
    <div className="sc-scatter">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 18, bottom: 6, left: 6 }}>
          <XAxis type="number" domain={[0, "dataMax"]} stroke="#93a1c0" tick={{ fontSize: 11, fill: "#93a1c0" }} />
          <YAxis
            type="category"
            dataKey="place"
            width={150}
            stroke="#93a1c0"
            tick={{ fontSize: 10, fill: "#93a1c0" }}
            tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)}
          />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(76,201,255,0.08)" }} />
          <Bar dataKey="mag" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((r, i) => (
              <Cell key={i} fill={r.alert ? (ALERT_FILL[r.alert] ?? "#4cc9ff") : "#4cc9ff"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
