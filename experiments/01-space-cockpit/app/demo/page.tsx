"use client";

import type { Spec } from "@json-render/core";
import { CockpitRenderer } from "@/lib/render/renderer";

/**
 * Phase B 検証: LLM 抜きで、手書き spec ＋ 実形状の initialState を CockpitRenderer に流し、
 * 新部品（AsteroidTable / AsteroidScatter / IssMap）と $state バインドと sanitize/fallback を確認する。
 * data は probe（実 API）の出力を写したもの。Phase C で page.tsx の生成ループに置き換える。
 */

const rows = [
  { name: "(2015 LM24)", hazardous: false, diameterM: 86, missLunar: 18.1, missKm: 6951974, velocityKmh: 49509, date: "2026-06-22" },
  { name: "(2024 MK3)", hazardous: true, diameterM: 312, missLunar: 21.4, missKm: 8230000, velocityKmh: 61200, date: "2026-06-23" },
  { name: "(2016 LC9)", hazardous: false, diameterM: 17, missLunar: 24.6, missKm: 9447842, velocityKmh: 12333, date: "2026-06-22" },
  { name: "(2008 JL24)", hazardous: false, diameterM: 5, missLunar: 36.2, missKm: 13918263, velocityKmh: 7164, date: "2026-06-21" },
  { name: "(2017 AY3)", hazardous: false, diameterM: 319, missLunar: 39.8, missKm: 15298790, velocityKmh: 52584, date: "2026-06-21" },
  { name: "(2014 WA201)", hazardous: false, diameterM: 19, missLunar: 52.6, missKm: 20247474, velocityKmh: 53526, date: "2026-06-20" },
];

const initialState = {
  neows: {
    rows,
    scatter: rows.map((r) => ({ x: r.missLunar, y: r.diameterM, hazardous: r.hazardous, name: r.name })),
    hazardousCount: rows.filter((r) => r.hazardous).length,
    closest: { name: rows[0].name, missLunar: rows[0].missLunar },
    windowLabel: "2026-06-20 → 2026-06-23",
    total: rows.length,
  },
  iss: {
    lat: -25.04,
    lon: 118.96,
    altitudeKm: 422.6,
    velocityKmh: 27574,
    visibility: "daylight",
    asOf: "2026-06-23T05:25:41.000Z",
    crew: ["Oleg Kononenko", "Nikolai Chub", "Tracy Caldwell Dyson", "Matthew Dominick"],
    crewCount: 4,
    crewAvailable: true,
  },
  exoplanet: {
    scatterPoints: [
      { name: "Proxima Cen b", r: 1.07, m: 1.07, dist: 1.3, family: "rocky" },
      { name: "TRAPPIST-1 e", r: 0.92, m: 0.69, dist: 12.5, family: "rocky" },
      { name: "Kepler-452 b", r: 1.63, m: 5.0, dist: 551, family: "superEarth" },
      { name: "55 Cnc e", r: 1.88, m: 7.99, dist: 12.6, family: "superEarth" },
      { name: "GJ 1214 b", r: 2.74, m: 8.17, dist: 14.6, family: "neptune" },
      { name: "HD 209458 b", r: 15.4, m: 220, dist: 48.4, family: "giant" },
    ],
    histogram: [
      { year: 2009, n: 88 },
      { year: 2010, n: 88 },
      { year: 2011, n: 130 },
      { year: 2012, n: 144 },
      { year: 2013, n: 127 },
      { year: 2014, n: 863 },
      { year: 2015, n: 148 },
      { year: 2016, n: 1488 },
      { year: 2017, n: 149 },
      { year: 2018, n: 303 },
      { year: 2019, n: 194 },
      { year: 2020, n: 233 },
      { year: 2021, n: 564 },
      { year: 2022, n: 366 },
      { year: 2023, n: 319 },
    ],
    summary: {
      totalPlanets: 6021,
      mostEarthLike: { name: "Proxima Cen b", r: 1.07, m: 1.07, dist: 1.3 },
      peakYear: 2016,
      peakCount: 1488,
      mode: "earthlike",
    },
  },
  // Storm Inbound 戦況室の検証（今日が静穏でも嵐ブランチを描けるよう手書きの嵐シナリオ）
  spaceWeather: {
    windSpeedKmS: 712,
    density: 18.4,
    temperatureK: 452000,
    bzNt: -14.2,
    kpNow: 7.3,
    gScale: "G3",
    gScaleNum: 3,
    rScale: "R1",
    sScale: "S2",
    verdict: "storm",
    boardColor: "red",
    windSeries: Array.from({ length: 24 }, (_, i) => ({
      t: `2026-06-24 0${Math.floor(i / 10)}:${String(i % 60).padStart(2, "0")}`,
      speed: 540 + i * 7 + (i % 3) * 9,
    })),
    kpForecast: [
      { t: "2026-06-23T18:00:00", kp: 4, observed: "observed" },
      { t: "2026-06-23T21:00:00", kp: 4.7, observed: "observed" },
      { t: "2026-06-24T00:00:00", kp: 6, observed: "observed" },
      { t: "2026-06-24T03:00:00", kp: 7.3, observed: "observed" },
      { t: "2026-06-24T06:00:00", kp: 8, observed: "predicted" },
      { t: "2026-06-24T09:00:00", kp: 7, observed: "predicted" },
      { t: "2026-06-24T12:00:00", kp: 6, observed: "predicted" },
      { t: "2026-06-24T15:00:00", kp: 5, observed: "predicted" },
      { t: "2026-06-24T18:00:00", kp: 4, observed: "predicted" },
      { t: "2026-06-25T00:00:00", kp: 3.3, observed: "predicted" },
    ],
    asOf: "2026-06-24T04:48:00.000Z",
  },
  cme: {
    present: true,
    status: "approaching",
    launchedAt: "2026-06-22T06:00:00Z",
    arrivalEta: "2027-01-01T09:00:00Z",
    etaSource: "enlil-modeled",
    tMinusSec: 999999,
    laneProgress: 0.62,
    speedKmS: 950,
    predictedKp: 7,
  },
  aurora: {
    observerAvailable: true,
    hemisphere: "N",
    southEdgeLat: 55,
    maxProb: 78,
    observerLat: 61.2,
    observerLon: 200,
    observerEdgeLat: 56,
    reaches: true,
    verdict: "オーロラ帯の南端は北緯56°、あなたは61.2° — 届く可能性があります。空の北を見て。",
    forecastTime: "2026-06-24T06:17:00Z",
    ovalBand: (() => {
      const b: Array<{ lon: number; lat: number; prob: number }> = [];
      for (let lon = 0; lon < 360; lon += 6) {
        const edge = 56 + 6 * Math.sin((lon * Math.PI) / 180 * 2);
        for (let lat = Math.round(edge); lat <= 78; lat += 3) {
          b.push({ lon, lat, prob: Math.round(Math.max(10, 70 - (lat - edge) * 4)) });
        }
      }
      return b;
    })(),
  },
  flares: {
    recent: [
      { class: "X2.1", time: "2026-06-23T14:12Z", region: "AR14512" },
      { class: "M5.4", time: "2026-06-23T09:48Z", region: "AR14512" },
      { class: "M1.2", time: "2026-06-22T22:03Z", region: "AR14508" },
      { class: "C8.7", time: "2026-06-22T15:31Z", region: "AR14510" },
      { class: "C3.3", time: "2026-06-22T06:19Z", region: "AR14508" },
    ],
    total: 27,
    strongest: "X2.1",
  },
};

const s = (path: string) => ({ $state: path });
// 表示整形ディレクティブ（生 float を見せず丸める）。計算ではない。
const fmtNum = (path: string, options: Record<string, unknown>) => ({
  $format: "number",
  value: { $state: path },
  options,
});

const spec: Spec = {
  root: "root",
  elements: {
    root: { type: "Stack", props: { direction: "vertical", gap: "lg", wrap: false }, children: ["intro", "bigstat", "orbitCard", "kpis", "globeCard", "mapCard", "crewCard", "tableCard", "scatterCard", "exoHead", "exoBig", "exoMel", "exoScatterCard", "exoHistCard", "swHead", "swLaneCard", "swGaugeCard", "swKpRow", "auroraHead", "auroraCard", "flareCard", "actions"] },
    intro: { type: "Heading", props: { text: "接近小惑星と ISS — 体感ビズ（手書き spec・LLM なし）", level: "h2" } },

    bigstat: { type: "BigStat", props: { label: "今週の最接近", value: s("/neows/closest/missLunar"), unit: "月距離", context: s("/neows/closest/name"), decimals: 1, tone: "danger" } },
    orbitCard: { type: "Card", props: { title: "どれだけ近くを通った？", tone: "default" }, children: ["orbit"] },
    orbit: { type: "OrbitProximity", props: { points: s("/neows/scatter") } },

    // ActionButton 行（on.click → ask）。デモでは onAsk が alert する。
    actions: { type: "Stack", props: { direction: "horizontal", gap: "sm", wrap: true }, children: ["a1", "a2"] },
    a1: { type: "ActionButton", props: { label: "ISSを更新", tone: "primary" }, on: { click: { action: "ask", params: { query: "ISSは今どこ？" } } } },
    a2: { type: "ActionButton", props: { label: "小惑星を見る", tone: "default" }, on: { click: { action: "ask", params: { query: "今週ヤバい小惑星ある？" } } } },

    kpis: { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: ["k1", "k2", "k3", "k4"] },
    k1: { type: "Kpi", props: { label: "ISS 高度", value: s("/iss/altitudeKm"), unit: "km", hint: s("/iss/asOf") } },
    k2: { type: "Kpi", props: { label: "ISS 速度", value: fmtNum("/iss/velocityKmh", { useGrouping: true }), unit: "km/h", hint: null } },
    k3: { type: "Kpi", props: { label: "最接近小惑星", value: fmtNum("/neows/closest/missLunar", { maximumFractionDigits: 1 }), unit: "月距離", hint: s("/neows/closest/name") } },
    k4: { type: "Kpi", props: { label: "潜在的に危険", value: s("/neows/hazardousCount"), unit: "件", hint: null } },

    globeCard: { type: "Card", props: { title: "ISS は今ここ（3D）", tone: "default" }, children: ["globe"] },
    globe: { type: "Globe3D", props: { lat: s("/iss/lat"), lon: s("/iss/lon"), label: "ISS" } },

    mapCard: { type: "Card", props: { title: "ISS は今ここ（フラット）", tone: "default" }, children: ["map"] },
    map: { type: "IssMap", props: { lat: s("/iss/lat"), lon: s("/iss/lon"), label: "ISS" } },

    crewCard: { type: "Card", props: { title: "搭乗クルー", tone: "default" }, children: ["crew"] },
    crew: { type: "List", props: { items: s("/iss/crew"), ordered: false, title: null } },

    tableCard: { type: "Card", props: { title: null, tone: "default" }, children: ["table"] },
    table: { type: "AsteroidTable", props: { rows: s("/neows/rows"), caption: "接近小惑星ランキング（最接近順）" } },

    scatterCard: { type: "Card", props: { title: "距離 × サイズ（赤＝潜在的に危険）", tone: "default" }, children: ["scatter"] },
    scatter: { type: "AsteroidScatter", props: { points: s("/neows/scatter") } },

    // --- 系外惑星（新部品: ScatterPlot / Histogram） ---
    exoHead: { type: "Heading", props: { text: "系外惑星 — 質量×半径と発見の歴史", level: "h2" } },
    exoBig: { type: "BigStat", props: { label: "確認済みの系外惑星", value: s("/exoplanet/summary/totalPlanets"), unit: "個", context: "質量と半径が判明しているもの", decimals: 0, tone: "default" } },
    exoMel: { type: "Card", props: { title: "最も地球に似た惑星", tone: "default" }, children: ["exoMelName", "exoMelKpis"] },
    exoMelName: { type: "Heading", props: { text: s("/exoplanet/summary/mostEarthLike/name"), level: "h3" } },
    exoMelKpis: { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: ["exoMelR", "exoMelM", "exoMelD"] },
    exoMelR: { type: "Kpi", props: { label: "半径", value: fmtNum("/exoplanet/summary/mostEarthLike/r", { maximumFractionDigits: 2 }), unit: "地球", hint: null } },
    exoMelM: { type: "Kpi", props: { label: "質量", value: fmtNum("/exoplanet/summary/mostEarthLike/m", { maximumFractionDigits: 2 }), unit: "地球", hint: null } },
    exoMelD: { type: "Kpi", props: { label: "距離", value: fmtNum("/exoplanet/summary/mostEarthLike/dist", { maximumFractionDigits: 1 }), unit: "パーセク", hint: null } },
    exoScatterCard: { type: "Card", props: { title: "質量 × 半径（地球・木星が基準）", tone: "default" }, children: ["exoScatter"] },
    exoScatter: { type: "ScatterPlot", props: { points: s("/exoplanet/scatterPoints") } },
    exoHistCard: { type: "Card", props: { title: "発見年ごとの件数（Kepler の山）", tone: "default" }, children: ["exoHist"] },
    exoHist: { type: "Histogram", props: { bars: s("/exoplanet/histogram") } },

    // --- Storm Inbound 戦況室（嵐シナリオ・新部品 SunEarthLane / SolarWindGauges / KpDial / KpForecastStrip） ---
    swHead: { type: "Heading", props: { text: "太陽嵐の管制室（嵐シナリオ）", level: "h2" } },
    swLaneCard: { type: "Card", props: { title: "🌞→🌍 地球向き CME 接近中", tone: "danger" }, children: ["swLane", "swCountdown"] },
    swLane: { type: "SunEarthLane", props: { progress: s("/cme/laneProgress"), speedKmS: s("/cme/speedKmS"), status: s("/cme/status") } },
    swCountdown: { type: "Countdown", props: { target: s("/cme/arrivalEta"), label: "地球到達（NASA ENLIL 予測）まで", precision: "Hour", zeroLabel: "到達" } },
    swGaugeCard: { type: "Card", props: { title: "太陽風（DSCOVR @ L1）", tone: "default" }, children: ["swGauges"] },
    swGauges: { type: "SolarWindGauges", props: { speed: s("/spaceWeather/windSpeedKmS"), density: s("/spaceWeather/density"), temperature: s("/spaceWeather/temperatureK"), bz: s("/spaceWeather/bzNt"), series: s("/spaceWeather/windSeries") } },
    swKpRow: { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: ["swKpCard", "swKpfCard"] },
    swKpCard: { type: "Card", props: { title: "地磁気 Kp", tone: "default" }, children: ["swKpDial"] },
    swKpDial: { type: "KpDial", props: { kp: s("/spaceWeather/kpNow"), gScale: s("/spaceWeather/gScale") } },
    swKpfCard: { type: "Card", props: { title: "3日 Kp 予報", tone: "default" }, children: ["swKpf"] },
    swKpf: { type: "KpForecastStrip", props: { bars: s("/spaceWeather/kpForecast") } },

    // --- オーロラ個人判定（新部品 AuroraOvalGlobe・見えるシナリオ） ---
    auroraHead: { type: "Heading", props: { text: "今夜オーロラは見える？（個人判定シナリオ）", level: "h2" } },
    auroraCard: { type: "Card", props: { title: "🌌 オーロラ楕円とあなたの緯度", tone: "default" }, children: ["auroraVerdict", "auroraBadge", "auroraGlobe"] },
    auroraVerdict: { type: "Heading", props: { text: s("/aurora/verdict"), level: "h3" } },
    auroraBadge: { type: "Badge", props: { text: "届く可能性あり", tone: "ok" } },
    auroraGlobe: { type: "AuroraOvalGlobe", props: { band: s("/aurora/ovalBand"), hemisphere: s("/aurora/hemisphere"), observerLat: s("/aurora/observerLat"), observerLon: s("/aurora/observerLon") } },

    // --- 太陽フレア履歴（新部品 FlareEventRail） ---
    flareCard: { type: "Card", props: { title: "☀️ 直近の太陽フレア", tone: "default" }, children: ["flareRail"] },
    flareRail: { type: "FlareEventRail", props: { items: s("/flares/recent") } },
  },
};

export default function DemoPage() {
  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <span className="sc-logo">◍ SPACE&nbsp;COCKPIT</span>
        <span className="sc-sub">実験01 · Phase B（描画レイヤ検証 / 手書き spec）</span>
      </header>
      <div className="sc-stage">
        <CockpitRenderer
          spec={spec}
          initialState={initialState}
          onAsk={(q) => window.alert(`ask: ${q}`)}
        />
      </div>
    </main>
  );
}
