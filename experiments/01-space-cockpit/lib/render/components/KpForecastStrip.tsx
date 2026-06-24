"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface KpBar {
  t: string;
  kp: number;
  observed: string; // "observed" | "estimated" | "predicted"
}

const kpColor = (kp: number) => (kp >= 7 ? "#ff5d6c" : kp >= 5 ? "#ff8a5d" : kp >= 4 ? "#d4a72c" : "#4cc9ff");
// 実測 / 推定 / 予報 の3値で濃淡とラベルを決める。
const kind = (o: string) =>
  o === "observed" ? { label: "実測", op: 0.9 } : o === "estimated" ? { label: "推定", op: 0.7 } : { label: "予報", op: 0.45 };

// "2026-06-26T21:00:00" → "26日 21h"
function shortT(t: string): string {
  const m = /\d{4}-(\d{2})-(\d{2})T(\d{2})/.exec(t);
  return m ? `${parseInt(m[2], 10)}日${m[3]}h` : t;
}

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: KpBar }> }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="sc-tip">
      <div className="sc-tip__name">{shortT(b.t)}</div>
      <div>Kp {b.kp}（{kind(b.observed).label}）</div>
    </div>
  );
}

/** 3日 Kp 予報の帯。Kp 段階で色分け、実測は濃く・予報は淡く。Kp5(=G1) に境界線。 */
export function KpForecastStrip({ bars }: { bars: KpBar[] }) {
  return (
    <div className="sc-scatter">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={bars} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <XAxis
            dataKey="t"
            tickFormatter={shortT}
            stroke="#93a1c0"
            tick={{ fontSize: 10, fill: "#93a1c0" }}
            interval={3}
            label={{ value: "3日 Kp 予報", position: "insideBottom", offset: -12, fill: "#93a1c0", fontSize: 12 }}
          />
          <YAxis domain={[0, 9]} ticks={[0, 3, 5, 7, 9]} stroke="#93a1c0" tick={{ fontSize: 10, fill: "#93a1c0" }} width={24} />
          <ReferenceLine y={5} stroke="#ff8a5d" strokeDasharray="3 3" />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(76,201,255,0.08)" }} />
          <Bar dataKey="kp" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {bars.map((b, i) => (
              <Cell key={i} fill={kpColor(b.kp)} fillOpacity={kind(b.observed).op} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
