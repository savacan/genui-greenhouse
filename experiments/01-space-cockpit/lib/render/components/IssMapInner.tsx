"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** The actual maplibre map. Loaded only client-side via next/dynamic (see IssMap.tsx). */
export default function IssMapInner({
  lat,
  lon,
  label,
}: {
  lat: number;
  lon: number;
  label?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);

  // init once
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: "https://demotiles.maplibre.org/style.json", // key-free
      center: [lon, lat],
      zoom: 2.2,
    });
    map.current = m;
    const el = document.createElement("div");
    el.className = "sc-map__iss";
    el.title = label ?? "ISS";
    marker.current = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m);
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow position updates
  useEffect(() => {
    if (!map.current || !marker.current) return;
    marker.current.setLngLat([lon, lat]);
    map.current.easeTo({ center: [lon, lat], duration: 800 });
  }, [lat, lon]);

  return <div className="sc-map" ref={container} aria-label={label ?? "ISS position"} />;
}
