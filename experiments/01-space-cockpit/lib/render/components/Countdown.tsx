"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 時刻までのライブ T-カウントダウン。秒は精度が粗いとき隠す（偽の精度を出さない）。 */
export function Countdown({
  target,
  label,
  precision,
  zeroLabel,
}: {
  target: string;
  label?: string | null;
  precision?: string | null;
  zeroLabel?: string | null;
}) {
  const [now, setNow] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const showSeconds = !precision || precision === "Second" || precision === "Minute";
  const t = new Date(target).getTime();
  const diff = t - now;
  const launched = mounted && diff <= 0;
  const s = Math.max(0, Math.floor(diff / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  // SSR + 初回 hydration は now=0/!mounted で固定プレースホルダ（Date.now の差による不一致回避）
  const body = !mounted
    ? "T- ··:··:··"
    : launched
      ? (zeroLabel ?? "LIFTOFF 🚀")
      : `T-${d > 0 ? d + "d " : ""}${pad(h)}:${pad(m)}${showSeconds ? ":" + pad(sec) : ""}`;

  return (
    <div className={`sc-countdown${launched ? " is-go" : ""}`}>
      {label ? <div className="sc-countdown__label">{label}</div> : null}
      <div className="sc-countdown__clock">{body}</div>
    </div>
  );
}
