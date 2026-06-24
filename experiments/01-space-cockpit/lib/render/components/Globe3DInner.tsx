"use client";

import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeInstance } from "globe.gl";

type Marker = { lat: number; lng: number; label: string };

/**
 * 実テクスチャの3D地球 + ISS マーカー（脈打つリング）+ 自転。client 専用（Globe3D.tsx 経由）。
 * live=true のとき wheretheiss.at を数秒ごとに直接ポーリングしてマーカーを自走させる
 * （表示専用の生命感。LLM には一切渡らないのでデータ・ファイアウォールは保たれる）。
 */
export default function Globe3DInner({
  lat,
  lon,
  label,
  live = true,
}: {
  lat: number;
  lon: number;
  label?: string | null;
  live?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeInstance | null>(null);
  const [moving, setMoving] = useState(false);

  const apply = (lt: number, lng: number) => {
    const g = globe.current;
    if (!g) return;
    const m: Marker = { lat: lt, lng, label: label ?? "ISS" };
    g.pointsData([m]).ringsData([m]);
  };

  useEffect(() => {
    if (!container.current || globe.current) return;
    const el = container.current;
    const marker: Marker = { lat, lng: lon, label: label ?? "ISS" };
    const g = new Globe(el)
      .globeImageUrl("/textures/earth-blue-marble.jpg")
      .bumpImageUrl("/textures/earth-topology.png")
      .backgroundImageUrl("/textures/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor("#7fd2ff")
      .atmosphereAltitude(0.2)
      .pointOfView({ lat, lng: lon, altitude: 2.4 }, 0)
      .pointsData([marker])
      .pointColor(() => "#eaf6ff")
      .pointAltitude(0.07)
      .pointRadius(0.65)
      .ringsData([marker])
      .ringColor(() => (t: number) => `rgba(76,201,255,${1 - t})`)
      .ringMaxRadius(5)
      .ringPropagationSpeed(3)
      .ringRepeatPeriod(900);

    const controls = g.controls() as { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean };
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;

    // canvas は CSS で position:absolute（フローから外す）。実描画サイズは .sc-globe の実寸に
    // 合わせる。ResizeObserver なら親（Stack/Card/シェル）幅の確定後にも追従し、初期に window
    // 幅へ膨らむ globe.gl の既定を上書きできる（= シェル突破・横スクロールを防ぐ）。
    const resize = () => {
      g.width(el.clientWidth);
      g.height(el.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    globe.current = g;
    return () => {
      ro.disconnect();
      g._destructor();
      globe.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // server-provided position (initial / on re-ask) — recenter to it
  useEffect(() => {
    const g = globe.current;
    if (!g) return;
    apply(lat, lon);
    g.pointOfView({ lat, lng: lon }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  // liveness: poll the live ISS position and drift the marker on its own
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544", { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok || stop) return;
        const d = (await res.json()) as { latitude: number; longitude: number };
        apply(d.latitude, d.longitude);
        setMoving(true);
      } catch {
        /* keep last position; silent */
      }
    }, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return (
    <div className="sc-globe-wrap">
      <div className="sc-globe" ref={container} />
      {live ? (
        <div className={`sc-globe__live${moving ? " is-moving" : ""}`}>
          <span className="sc-globe__livedot" />
          LIVE
        </div>
      ) : null}
    </div>
  );
}
