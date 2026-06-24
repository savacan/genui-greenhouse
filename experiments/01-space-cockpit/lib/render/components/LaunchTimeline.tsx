"use client";

interface LaunchRow {
  name: string;
  provider: string;
  net: string;
  location: string;
  status: string;
}

const STATUS: Record<string, { cls: string; label: string }> = {
  Go: { cls: "ok", label: "GO" },
  TBD: { cls: "warn", label: "未定" },
  "To Be Determined": { cls: "warn", label: "未定" },
  Hold: { cls: "warn", label: "保留" },
  "In Flight": { cls: "accent", label: "飛行中" },
  Success: { cls: "neutral", label: "成功" },
  Failure: { cls: "danger", label: "失敗" },
};

/** ISO "2026-06-25T02:48:00Z" → "06/25 02:48 UTC"（ロケール非依存・hydration 安全）。 */
function fmtNet(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? `${m[2]}/${m[3]} ${m[4]}:${m[5]} UTC` : iso || "未定";
}

export function LaunchTimeline({ items }: { items: LaunchRow[] }) {
  if (!items?.length) return <p className="sc-text sc-text--muted">予定された打ち上げがありません。</p>;
  return (
    <ol className="sc-timeline">
      {items.map((it, i) => {
        const st = STATUS[it.status] ?? { cls: "neutral", label: it.status };
        return (
          <li key={i} className="sc-timeline__row">
            <time className="sc-timeline__when">{fmtNet(it.net)}</time>
            <span className="sc-timeline__dot" />
            <div className="sc-timeline__body">
              <div className="sc-timeline__name">{it.name}</div>
              <div className="sc-timeline__meta">
                {it.provider} · {it.location}
              </div>
            </div>
            <span className={`sc-badge sc-badge--${st.cls}`}>{st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
