"use client";

import {
  CartesianGrid,
  Cell,
  Label,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ExoPoint {
  name: string;
  r: number; // 半径（地球=1）
  m: number; // 質量（地球=1）
  dist: number | null; // 距離（パーセク）
  family: string; // rocky | superEarth | neptune | giant
}

// 物理定数なのでデータではなく部品に内蔵（地球 (1,1) / 木星 (317.8, 11.2)）。
const EARTH = { m: 1, r: 1 };
const JUPITER = { m: 317.8, r: 11.2 };

const FAMILY: Record<string, { color: string; label: string }> = {
  rocky: { color: "#4cc9ff", label: "岩石（地球型）" },
  superEarth: { color: "#7ee787", label: "スーパーアース" },
  neptune: { color: "#a78bfa", label: "海王星型" },
  giant: { color: "#ffb454", label: "巨大ガス惑星" },
};
const colorOf = (f: string) => FAMILY[f]?.color ?? "#93a1c0";

// log 軸は明示 domain が要る。データ＋基準点（地球/木星）を内包し、上下に余白を取る。
function logDomain(values: number[]): [number, number] {
  const safe = values.filter((v) => v > 0);
  const lo = Math.min(...safe);
  const hi = Math.max(...safe);
  return [lo / 1.6, hi * 1.6];
}

function PointTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ExoPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const fam = FAMILY[p.family];
  return (
    <div className="sc-tip">
      <div className="sc-tip__name">{p.name}</div>
      <div>半径 {p.r} R⊕ · 質量 {p.m} M⊕</div>
      {p.dist != null ? <div>距離 約 {p.dist} パーセク</div> : null}
      {fam ? <div style={{ color: fam.color, marginTop: 2 }}>{fam.label}</div> : null}
    </div>
  );
}

export function ScatterPlot({ points }: { points: ExoPoint[] }) {
  const xs = [...points.map((p) => p.m), EARTH.m, JUPITER.m];
  const ys = [...points.map((p) => p.r), EARTH.r, JUPITER.r];
  const seen = new Set(points.map((p) => p.family));
  const legend = Object.entries(FAMILY).filter(([k]) => seen.has(k));

  return (
    <div className="sc-scatter">
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 16, right: 28, bottom: 38, left: 8 }}>
          <CartesianGrid stroke="#243049" strokeDasharray="2 4" />
          <XAxis
            type="number"
            dataKey="m"
            scale="log"
            domain={logDomain(xs)}
            allowDataOverflow
            stroke="#93a1c0"
            tick={{ fontSize: 11, fill: "#93a1c0" }}
            tickFormatter={(v: number) => (v >= 1 ? String(Math.round(v)) : String(v))}
            label={{ value: "質量 (地球 = 1, 対数)", position: "insideBottom", offset: -20, fill: "#93a1c0", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="r"
            scale="log"
            domain={logDomain(ys)}
            allowDataOverflow
            stroke="#93a1c0"
            tick={{ fontSize: 11, fill: "#93a1c0" }}
            tickFormatter={(v: number) => (v >= 1 ? String(Math.round(v)) : String(v))}
            label={{ value: "半径 (地球 = 1, 対数)", angle: -90, position: "insideLeft", fill: "#93a1c0", fontSize: 12 }}
          />
          <Tooltip content={<PointTip />} cursor={{ strokeDasharray: "3 3", stroke: "#4cc9ff" }} />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={colorOf(p.family)} fillOpacity={0.85} />
            ))}
          </Scatter>
          {/* 基準マーカー（物理定数） */}
          <ReferenceDot x={EARTH.m} y={EARTH.r} r={6} fill="#4cc9ff" stroke="#eaf1ff" strokeWidth={2}>
            <Label value="🌍 地球" position="top" fill="#eaf1ff" fontSize={12} />
          </ReferenceDot>
          <ReferenceDot x={JUPITER.m} y={JUPITER.r} r={7} fill="#ffb454" stroke="#eaf1ff" strokeWidth={2}>
            <Label value="🪐 木星" position="top" fill="#eaf1ff" fontSize={12} />
          </ReferenceDot>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="sc-chart__legend">
        {legend.map(([k, v]) => (
          <span key={k} className="sc-chart__legend-item">
            <span className="sc-chart__legend-dot" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}
