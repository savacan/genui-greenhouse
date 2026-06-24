"use client";

export interface FlareItem {
  class: string; // "X1.0" / "M2.3" / "C3.4"
  time: string; // ISO-ish
  region: string;
}

const cls = (c: string) => c?.[0]?.toUpperCase() ?? "";
const toneOf = (c: string) => (cls(c) === "X" ? "x" : cls(c) === "M" ? "m" : cls(c) === "C" ? "c" : "lo");

// "2026-05-22T10:29Z" → "05/22 10:29 UTC"（決定的・hydration安全）
function fmt(t: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[2]}/${m[3]} ${m[4]}:${m[5]} UTC` : t;
}

/** 直近の太陽フレアの時系列レール（X/M/C クラスで色分け）。表示専用。 */
export function FlareEventRail({ items }: { items: FlareItem[] }) {
  return (
    <ol className="sc-flares">
      {items.map((f, i) => (
        <li key={i} className="sc-flares__row">
          <span className={`sc-flares__cls is-${toneOf(f.class)}`}>{f.class}</span>
          <span className="sc-flares__time">{fmt(f.time)}</span>
          <span className="sc-flares__region">{f.region}</span>
        </li>
      ))}
    </ol>
  );
}
