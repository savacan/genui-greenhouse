"use client";

import type { Spec } from "@json-render/core";
import { MonitorRenderer } from "@/lib/render/renderer";

/**
 * Phase B 検証: LLM 抜きで、手書き spec ＋ 実形状の initialState を MonitorRenderer に流し、
 * 地球モニタ部品（QuakeList / MagnitudeBars / Beachball / ShakeMapImage / WeatherTile /
 * Sparkline / ArticleGrid / AlertBanner）と $state バインドと sanitize/fallback を確認する。
 * data は probe（実 API）の出力を写したもの（M7.5 Venezuela 2026-06-25）。
 * Phase C で page.tsx の multi-step loop に置き換える。
 */

const quakeRows = [
  { id: "us6000t7zp", mag: 7.5, place: "28 km SE of Yumare, Venezuela", depthKm: 10, lat: 10.44, lon: -68.47, ageHours: 7.7, alert: "red", tsunami: false, sig: 2338, hasShakemap: true },
  { id: "us6000t7zc", mag: 7.2, place: "23 km SE of Yumare, Venezuela", depthKm: 20.3, lat: 10.44, lon: -68.53, ageHours: 7.7, alert: "red", tsunami: false, sig: 2000, hasShakemap: true },
  { id: "us6000t7zq", mag: 6.9, place: "30 km ENE of Kuji, Japan", depthKm: 50.9, lat: 40.29, lon: 142.1, ageHours: 7.3, alert: "green", tsunami: false, sig: 785, hasShakemap: true },
  { id: "us6000t801", mag: 5.4, place: "Kermadec Islands region", depthKm: 33, lat: -30.1, lon: -177.9, ageHours: 12.1, alert: null, tsunami: false, sig: 449, hasShakemap: false },
  { id: "us6000t815", mag: 5.1, place: "152 km N of Caluula, Somalia", depthKm: 10, lat: 13.34, lon: 50.88, ageHours: 22.4, alert: null, tsunami: false, sig: 400, hasShakemap: false },
];

const initialState = {
  quakes: {
    quakes: quakeRows,
    count: quakeRows.length,
    maxMag: 7.5,
    strongest: { id: "us6000t7zp", place: "28 km SE of Yumare, Venezuela", mag: 7.5, depthKm: 10 },
    medianDepthKm: 20.3,
    shallowCount: 4,
    tsunamiFlaggedCount: 0,
    redAlertCount: 2,
    windowLabel: "past 7 days, M≥4.5",
  },
  quakeDetail: {
    eventId: "us6000t7zp",
    title: "M 7.5 - 28 km SE of Yumare, Venezuela",
    mag: 7.5,
    place: "28 km SE of Yumare, Venezuela",
    depthKm: 10,
    lat: 10.44,
    lon: -68.47,
    faultType: "横ずれ断層 (strike-slip)",
    nodalPlanes: [
      { strike: 354.69, dip: 85.74, rake: -16.39 },
      { strike: 85.94, dip: 73.66, rake: -175.56 },
    ],
    maxMmi: 8.561,
    pagerAlert: "red",
    scalarMoment: 2.12e20,
    shakemapIntensityImgUrl: "https://earthquake.usgs.gov/product/shakemap/us6000t7zp/us/1782357248608/download/intensity.jpg",
    hasShakemap: true,
    hasMomentTensor: true,
  },
  weather: {
    label: null,
    lat: 10.5,
    lon: -68.5,
    offshore: false,
    tempNow: 25.1,
    tempUnit: "°C",
    wind: 8.3,
    windUnit: "km/h",
    condition: "晴れ時々曇り ⛅",
    weatherCode: 2,
    tempMin: 23.4,
    tempMax: 31.2,
    trend: "rising",
    sparkline: Array.from({ length: 8 }, (_, i) => ({
      t: `2026-06-25T${String(i * 3).padStart(2, "0")}:00`,
      temp: Math.round((24 + 4 * Math.sin(i / 2) + i * 0.3) * 10) / 10,
    })),
    current: { time: "2026-06-25T06:00", temp: 25.1, wind: 8.3, condition: "晴れ時々曇り ⛅" },
  },
  nearby: {
    articles: [
      { title: "Yumare", dist: 3120, description: "Town in Yaracuy, Venezuela", thumbnail: null, url: "https://en.wikipedia.org/wiki/Yumare" },
      { title: "Yaracuy", dist: 8800, description: "State of Venezuela", thumbnail: null, url: "https://en.wikipedia.org/wiki/Yaracuy" },
    ],
    count: 2,
    nearest: { title: "Yumare", dist: 3120 },
    nearestKm: 3.1,
    lang: "en",
    lat: 10.44,
    lon: -68.47,
  },
};

const s = (path: string) => ({ $state: path });
const fmtNum = (path: string, options: Record<string, unknown>) => ({
  $format: "number",
  value: { $state: path },
  options,
});

const spec: Spec = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "lg", wrap: false },
      children: ["intro", "alert", "bigstat", "listCard", "barsCard", "detailHead", "detailRow", "shakeCard", "wxHead", "wxRow", "nearbyCard", "actions"],
    },
    intro: { type: "Heading", props: { text: "aftershock — 地球モニタ部品（手書き spec・LLM なし）", level: "h2" } },

    alert: { type: "AlertBanner", props: { level: s("/quakeDetail/pagerAlert"), title: "PAGER 赤警報 — 深刻な被害の可能性", text: s("/quakeDetail/title") } },
    bigstat: { type: "BigStat", props: { label: "今週の最大マグニチュード", value: s("/quakes/maxMag"), unit: "M", context: s("/quakes/strongest/place"), decimals: 1, tone: "danger" } },

    listCard: { type: "Card", props: { title: null, tone: "default" }, children: ["list"] },
    list: { type: "QuakeList", props: { rows: s("/quakes/quakes"), caption: "最近の地震（マグニチュード順）" } },

    barsCard: { type: "Card", props: { title: "規模の比較", tone: "default" }, children: ["bars"] },
    bars: { type: "MagnitudeBars", props: { rows: s("/quakes/quakes") } },

    detailHead: { type: "Heading", props: { text: "最大イベントの詳細", level: "h2" } },
    detailRow: { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: ["beachCard", "kpis"] },
    beachCard: { type: "Card", props: { title: "発震機構", tone: "default" }, children: ["beach"] },
    beach: { type: "Beachball", props: { planes: s("/quakeDetail/nodalPlanes"), faultType: s("/quakeDetail/faultType") } },
    kpis: { type: "Stack", props: { direction: "vertical", gap: "md", wrap: false }, children: ["k1", "k2", "k3"] },
    k1: { type: "Kpi", props: { label: "マグニチュード", value: s("/quakeDetail/mag"), unit: "M", hint: s("/quakeDetail/faultType") } },
    k2: { type: "Kpi", props: { label: "震源の深さ", value: s("/quakeDetail/depthKm"), unit: "km", hint: null } },
    k3: { type: "Kpi", props: { label: "最大計測震度 (MMI)", value: fmtNum("/quakeDetail/maxMmi", { maximumFractionDigits: 1 }), unit: null, hint: "10段階" } },

    shakeCard: { type: "Card", props: { title: "ShakeMap（揺れの強度）", tone: "default" }, children: ["shake"] },
    shake: { type: "ShakeMapImage", props: { src: s("/quakeDetail/shakemapIntensityImgUrl"), title: s("/quakeDetail/title"), caption: "USGS ShakeMap — 揺れの強度分布" } },

    wxHead: { type: "Heading", props: { text: "震源の天気と周辺", level: "h2" } },
    wxRow: { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: ["wxCard", "sparkCard"] },
    wxCard: { type: "Card", props: { title: "震源の現在天気", tone: "default" }, children: ["wx"] },
    wx: { type: "WeatherTile", props: { current: s("/weather/current"), label: s("/quakeDetail/place") } },
    sparkCard: { type: "Card", props: { title: "気温の推移", tone: "default" }, children: ["spark"] },
    spark: { type: "Sparkline", props: { points: s("/weather/sparkline"), label: "48時間の気温" } },

    nearbyCard: { type: "Card", props: { title: "震源の周りにあるもの（Wikipedia）", tone: "default" }, children: ["nearby"] },
    nearby: { type: "ArticleGrid", props: { articles: s("/nearby/articles") } },

    actions: { type: "Stack", props: { direction: "horizontal", gap: "sm", wrap: true }, children: ["a1", "a2", "fallbackTest"] },
    a1: { type: "ActionButton", props: { label: "最近の地震は？", tone: "primary" }, on: { click: { action: "ask", params: { query: "最近の大きい地震は？" } } } },
    a2: { type: "ActionButton", props: { label: "震源の天気は？", tone: "default" }, on: { click: { action: "ask", params: { query: "その震源の天気は？" } } } },
    // sanitize / fallback の確認: 存在しない部品型 → 描画されず（root から子が外れる）。
    fallbackTest: { type: "NonexistentWidget", props: {} },
  },
};

export default function DemoPage() {
  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <span className="sc-logo">◍ AFTERSHOCK</span>
        <span className="sc-sub">実験02 · Phase B（描画レイヤ検証 / 手書き spec）</span>
      </header>
      <div className="sc-stage">
        <MonitorRenderer spec={spec} initialState={initialState} onAsk={(q) => window.alert(`ask: ${q}`)} />
      </div>
    </main>
  );
}
