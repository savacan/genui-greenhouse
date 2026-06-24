"use client";

/**
 * 小惑星の「どれだけ近くを通ったか」を体感させる同心円図。
 * 地球中心・月の距離(1 LD)を基準リングに、各小惑星を lunar 距離で半径配置（内側ほど近い）、
 * 大きさ=直径、赤=潜在的に危険。乾いたランキング表を "うわ近い" に変える。
 */
interface Pt {
  x: number; // miss distance, lunar distances (LD)
  y: number; // diameter, meters
  hazardous: boolean;
  name: string;
}

export function OrbitProximity({ points }: { points: Pt[] }) {
  if (!points?.length)
    return <p className="sc-text sc-text--muted">表示する小惑星がありません。</p>;

  const W = 460,
    H = 460,
    cx = W / 2,
    cy = H / 2;
  const innerR = 30; // drawn Earth radius
  const outerR = 206;
  const maxLD = Math.min(Math.max(...points.map((p) => p.x), 10), 60);
  // sqrt スケール = 近い側を広げて見やすく
  const ldToR = (ld: number) => innerR + Math.sqrt(Math.min(ld, maxLD) / maxLD) * (outerR - innerR);
  const maxD = Math.max(...points.map((p) => p.y), 1);
  const dotR = (d: number) => 3.5 + Math.sqrt(d / maxD) * 9;
  const GOLDEN = 137.508 * (Math.PI / 180); // 黄金角で重なりにくく散らす

  const placed = points.map((p, i) => {
    const r = ldToR(p.x);
    const a = i * GOLDEN - Math.PI / 2;
    return { ...p, px: cx + r * Math.cos(a), py: cy + r * Math.sin(a), rr: dotR(p.y), i };
  });
  const closest = placed.reduce((m, p) => (p.x < m.x ? p : m), placed[0]);
  const ringLDs = [1, 5, 10, 20, 30, 50].filter((v) => v <= maxLD);
  const moonR = ldToR(1);

  return (
    <div className="sc-orbit">
      <svg viewBox={`0 0 ${W} ${H}`} className="sc-orbit__svg" role="img" aria-label="小惑星の接近距離（月距離基準）">
        <defs>
          <radialGradient id="scEarth" cx="38%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#6fd0ff" />
            <stop offset="55%" stopColor="#2b7fd6" />
            <stop offset="100%" stopColor="#0d3b6e" />
          </radialGradient>
        </defs>

        {ringLDs.map((ld) => {
          const r = ldToR(ld);
          return (
            <g key={ld}>
              <circle cx={cx} cy={cy} r={r} className="sc-orbit__ring" />
              <text x={cx} y={cy - r - 4} className="sc-orbit__ringlbl" textAnchor="middle">
                {`${ld} LD`}
              </text>
            </g>
          );
        })}

        {/* line to the closest object */}
        <line x1={cx} y1={cy} x2={closest.px} y2={closest.py} className="sc-orbit__closeline" />

        {/* the Moon, sitting on the 1 LD ring */}
        <circle cx={cx + moonR} cy={cy} r={5} className="sc-orbit__moon" />
        <text x={cx + moonR + 9} y={cy + 4} className="sc-orbit__moonlbl">🌙 月</text>

        {/* Earth */}
        <circle cx={cx} cy={cy} r={innerR} className="sc-orbit__earth" fill="url(#scEarth)" />

        {placed.map((p) => (
          <g key={p.i} className="sc-orbit__ast" style={{ animationDelay: `${p.i * 55}ms` }}>
            <circle
              cx={p.px}
              cy={p.py}
              r={p.rr}
              className={`sc-orbit__dot${p.hazardous ? " is-haz" : ""}${p === closest ? " is-closest" : ""}`}
            >
              <title>
                {`${p.name} — ${p.x.toFixed(1)} 月距離・直径 ${Math.round(p.y)}m${p.hazardous ? "・⚠ 潜在的に危険" : ""}`}
              </title>
            </circle>
          </g>
        ))}

        {/* closest label */}
        <text x={closest.px} y={closest.py - closest.rr - 6} className="sc-orbit__closelbl" textAnchor="middle">
          {`${closest.name} · ${closest.x.toFixed(1)} LD`}
        </text>
      </svg>
      <div className="sc-orbit__legend">
        🌙 月までの距離(1 LD)が基準。<b>内側ほど地球に近い</b> ・ 赤 = 潜在的に危険 ・ 大きさ = 直径
      </div>
    </div>
  );
}
