"use client";

import dynamic from "next/dynamic";

/** WebGL は client 専用。maplibre と同じく単一の dynamic(ssr:false) アイランドに隔離。 */
const Inner = dynamic(() => import("./Globe3DInner"), {
  ssr: false,
  loading: () => <div className="sc-globe sc-globe--loading">3D 地球を生成中…</div>,
});

export function Globe3D({ lat, lon, label }: { lat: number; lon: number; label?: string | null }) {
  return <Inner lat={lat} lon={lon} label={label} />;
}
