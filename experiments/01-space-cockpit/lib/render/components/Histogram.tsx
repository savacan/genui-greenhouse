"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface HistBar {
  year: number;
  n: number;
}

function BarTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistBar }> }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="sc-tip">
      <div className="sc-tip__name">{b.year} 年</div>
      <div>{b.n.toLocaleString()} 個 発見</div>
    </div>
  );
}

export function Histogram({ bars }: { bars: HistBar[] }) {
  // 最多の年を強調（Kepler の大量発見の山）。
  const peak = bars.reduce((max, b) => (b.n > max ? b.n : max), 0);

  return (
    <div className="sc-scatter">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={bars} margin={{ top: 12, right: 16, bottom: 28, left: 6 }}>
          <CartesianGrid stroke="#243049" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="year"
            stroke="#93a1c0"
            tick={{ fontSize: 10, fill: "#93a1c0" }}
            interval={2}
            label={{ value: "発見年", position: "insideBottom", offset: -14, fill: "#93a1c0", fontSize: 12 }}
          />
          <YAxis
            stroke="#93a1c0"
            tick={{ fontSize: 11, fill: "#93a1c0" }}
            label={{ value: "件数", angle: -90, position: "insideLeft", fill: "#93a1c0", fontSize: 12 }}
          />
          <Tooltip content={<BarTip />} cursor={{ fill: "rgba(76,201,255,0.08)" }} />
          <Bar dataKey="n" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {bars.map((b, i) => (
              <Cell key={i} fill={b.n === peak ? "#ff8a5d" : "#4cc9ff"} fillOpacity={b.n === peak ? 0.95 : 0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
