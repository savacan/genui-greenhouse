"use client";

import { useEffect, useState } from "react";

/** 0→target を easeOutCubic でカウントアップ（01 から写経）。 */
function useCountUp(target: number, run: boolean, ms = 950): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let startT = 0;
    const tick = (t: number) => {
      if (!startT) startT = t;
      const p = Math.min(1, (t - startT) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

/** 巨大なヒーロー数値。SSR/初回 hydration は toFixed（決定的）、mount 後に toLocaleString へ。 */
export function BigStat({
  label,
  value,
  unit,
  context,
  decimals = 0,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string | null;
  context?: string | null;
  decimals?: number;
  tone?: "default" | "danger";
}) {
  const isNum = typeof value === "number";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const n = useCountUp(isNum ? value : 0, mounted);

  let display: string;
  if (!isNum) display = String(value);
  else if (!mounted) display = value.toFixed(decimals);
  else display = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className={`sc-bigstat sc-bigstat--${tone}`}>
      <div className="sc-bigstat__label">{label}</div>
      <div className="sc-bigstat__value">
        {display}
        {unit ? <span className="sc-bigstat__unit"> {unit}</span> : null}
      </div>
      {context ? <div className="sc-bigstat__ctx">{context}</div> : null}
    </div>
  );
}
