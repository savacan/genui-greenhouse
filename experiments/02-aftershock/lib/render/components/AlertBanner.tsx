"use client";

const LEVELS = new Set(["green", "yellow", "orange", "red"]);
const ICON: Record<string, string> = { green: "✓", yellow: "▲", orange: "▲", red: "■" };

/** PAGER 警報帯。level=/quakeDetail/pagerAlert（green/yellow/orange/red）。red/orange は強い警戒色。 */
export function AlertBanner({
  level,
  title,
  text,
}: {
  level: string;
  title: string;
  text?: string | null;
}) {
  const lv = LEVELS.has(level) ? level : "neutral";
  return (
    <div className={`sc-alert sc-alert--${lv}`}>
      <span className="sc-alert__icon" aria-hidden>{ICON[lv] ?? "•"}</span>
      <div className="sc-alert__body">
        <div className="sc-alert__title">{title}</div>
        {text ? <div className="sc-alert__text">{text}</div> : null}
      </div>
      <span className="sc-alert__level">{level.toUpperCase()}</span>
    </div>
  );
}
