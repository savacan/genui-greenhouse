"use client";

import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ScatterPoint {
  x: number; // miss distance, lunar distances
  y: number; // diameter, meters
  hazardous: boolean;
  name: string;
}

function PointTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="sc-tip">
      <div className="sc-tip__name">{p.name}</div>
      <div>最接近 {p.x.toFixed(1)} 月距離</div>
      <div>直径 約 {p.y.toLocaleString()} m</div>
      {p.hazardous ? <div className="sc-tip__haz">⚠ 潜在的に危険</div> : null}
    </div>
  );
}

export function AsteroidScatter({ points }: { points: ScatterPoint[] }) {
  return (
    <div className="sc-scatter">
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 36, left: 6 }}>
          <CartesianGrid stroke="#243049" strokeDasharray="2 4" />
          <XAxis
            type="number"
            dataKey="x"
            name="最接近距離"
            unit=" LD"
            stroke="#93a1c0"
            tick={{ fontSize: 11, fill: "#93a1c0" }}
            label={{ value: "最接近距離 (月距離)", position: "insideBottom", offset: -18, fill: "#93a1c0", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="直径"
            unit=" m"
            stroke="#93a1c0"
            tick={{ fontSize: 11, fill: "#93a1c0" }}
            label={{ value: "直径 (m)", angle: -90, position: "insideLeft", fill: "#93a1c0", fontSize: 12 }}
          />
          <Tooltip content={<PointTip />} cursor={{ strokeDasharray: "3 3", stroke: "#4cc9ff" }} />
          <Scatter data={points}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.hazardous ? "#ff5d6c" : "#4cc9ff"} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
