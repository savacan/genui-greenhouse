"use client";

import dynamic from "next/dynamic";

// maplibre touches window/document → load client-only. This is the single SSR island.
const Inner = dynamic(() => import("./IssMapInner"), {
  ssr: false,
  loading: () => <div className="sc-map sc-map--loading">地図を読み込み中…</div>,
});

export function IssMap({ lat, lon, label }: { lat: number; lon: number; label?: string | null }) {
  return <Inner lat={lat} lon={lon} label={label} />;
}
