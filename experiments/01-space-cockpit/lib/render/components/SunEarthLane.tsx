"use client";

const X0 = 52; // 太陽
const X1 = 548; // 地球
const Y = 78;

/**
 * 太陽→地球レーン。地球向き CME の塊を progress(0-1) でプロット（地球へ寄っていく）。
 * progress は ENLIL 予測到達までの経過時間を線形内挿した“モデル位置”であり、実トラッキングではない。
 */
export function SunEarthLane({
  progress,
  speedKmS,
  status,
}: {
  progress: number;
  speedKmS: number | null;
  status: string | null;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const bx = X0 + (X1 - X0) * p;
  const arrived = status === "arrived" || p >= 0.999;

  return (
    <div className="sc-lane">
      <svg viewBox="0 0 600 150" className="sc-lane__svg">
        <defs>
          <radialGradient id="sc-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="55%" stopColor="#ffb454" />
            <stop offset="100%" stopColor="#ff7a1a" />
          </radialGradient>
          <radialGradient id="sc-earth2" cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#7fd2ff" />
            <stop offset="100%" stopColor="#1b4a7a" />
          </radialGradient>
          <radialGradient id="sc-cme" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd6a0" />
            <stop offset="60%" stopColor="#ff8a5d" />
            <stop offset="100%" stopColor="rgba(255,93,108,0)" />
          </radialGradient>
        </defs>

        <line x1={X0} y1={Y} x2={X1} y2={Y} className="sc-lane__track" />
        <line x1={X0} y1={Y} x2={bx.toFixed(1)} y2={Y} className="sc-lane__trail" />

        <circle cx={X0} cy={Y} r={30} className="sc-lane__glow" fill="url(#sc-sun)" />
        <circle cx={X0} cy={Y} r={22} fill="url(#sc-sun)" />
        <circle cx={X1} cy={Y} r={15} fill="url(#sc-earth2)" stroke="#9fd8ff" strokeWidth={1} />

        {/* CME の塊（脈打つ） */}
        <circle cx={bx.toFixed(1)} cy={Y} r={26} fill="url(#sc-cme)" className="sc-lane__cmeglow" />
        <circle cx={bx.toFixed(1)} cy={Y} r={9} className="sc-lane__cme" />

        <text x={X0} y={Y + 48} className="sc-lane__lbl" textAnchor="middle">{"太陽"}</text>
        <text x={X1} y={Y + 48} className="sc-lane__lbl" textAnchor="middle">{"地球"}</text>
        <text x={bx.toFixed(1)} y={Y - 22} className="sc-lane__cmelbl" textAnchor="middle">
          {arrived ? "到達" : speedKmS != null ? `CME ${speedKmS.toLocaleString()} km/s` : "CME"}
        </text>
      </svg>
    </div>
  );
}
