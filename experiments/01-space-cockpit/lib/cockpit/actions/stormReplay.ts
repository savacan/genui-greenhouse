import { z } from "zod";
import type { Action, StateHint } from "../types";

const params = z.object({});
type Params = z.infer<typeof params>;

// デモ保証: 中央値の日は静穏で戦況室が発火しない → 直近の本物の大嵐（2024年5月 Gannon storm, G5）を
// 再生する。固定スナップショット（実イベントの代表値）を1スライスに全部入りで返し、describe で
// 戦況室の全部品に誘導する。到達カウントダウンだけは「今 as if live」で動くよう now+5h で生成（リプレイと明示）。
// fetch は無し（外部I/Oゼロ・常に成功＝デモが必ず通る）。

export interface StormReplayState extends Record<string, unknown> {
  isReplay: true;
  replayBanner: string;
  eventLabel: string;
  windSpeedKmS: number;
  density: number;
  temperatureK: number;
  bzNt: number;
  kpNow: number;
  gScale: string;
  verdict: string;
  boardColor: "red";
  windSeries: Array<{ t: string; speed: number }>;
  kpForecast: Array<{ t: string; kp: number; observed: string }>;
  cmeArrivalEta: string;
  cmeLaneProgress: number;
  cmeSpeedKmS: number;
  cmeStatus: "approaching";
  auroraHemisphere: "N";
  auroraSouthEdgeLat: number;
  auroraVerdict: string;
  auroraBand: Array<{ lon: number; lat: number; prob: number }>;
}

export const stormReplay: Action<Params, null, StormReplayState> = {
  id: "stormReplay",
  when:
    "過去の本物の太陽嵐を再生して戦況室を体験する（『嵐をリプレイ』『過去の大嵐を見せて』『一番すごかった太陽嵐』）。" +
    "今が静穏でも G5 級の盤面を見せたいときに選ぶ。",
  params,

  async fetch() {
    return null; // 外部 I/O なし（固定スナップショット）
  },

  compute() {
    const now = Date.now();
    // 太陽風速度の上昇カーブ（決定的）
    const windSeries = Array.from({ length: 24 }, (_, i) => ({
      t: `2024-05-10 ${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
      speed: 620 + i * 11 + (i % 3) * 14,
    }));
    const kpForecast = [
      { t: "2024-05-10T12:00:00", kp: 5, observed: "observed" },
      { t: "2024-05-10T15:00:00", kp: 7, observed: "observed" },
      { t: "2024-05-10T18:00:00", kp: 8.3, observed: "observed" },
      { t: "2024-05-10T21:00:00", kp: 9, observed: "observed" },
      { t: "2024-05-11T00:00:00", kp: 9, observed: "observed" },
      { t: "2024-05-11T03:00:00", kp: 8, observed: "observed" },
      { t: "2024-05-11T06:00:00", kp: 7, observed: "observed" },
      { t: "2024-05-11T09:00:00", kp: 6, observed: "observed" },
      { t: "2024-05-11T12:00:00", kp: 5, observed: "observed" },
      { t: "2024-05-11T15:00:00", kp: 4, observed: "observed" },
    ];
    // オーロラ楕円が北緯25°まで南下（普段見えない緯度でも見えた歴史的イベント）
    const auroraBand: Array<{ lon: number; lat: number; prob: number }> = [];
    for (let lon = 0; lon < 360; lon += 6) {
      const edge = 27 + 6 * Math.sin((lon * Math.PI) / 180);
      for (let lat = Math.round(edge); lat <= 72; lat += 3) {
        auroraBand.push({ lon, lat, prob: Math.round(Math.max(20, 95 - (lat - edge) * 3)) });
      }
    }
    return {
      isReplay: true,
      replayBanner: "リプレイ — 2024-05-10 の実イベントの再生です（今の実況ではありません）",
      eventLabel: "リプレイ: 2024年5月10日 — Gannon Storm（G5・過去20年で最大級）",
      windSpeedKmS: 850,
      density: 26,
      temperatureK: 620000,
      bzNt: -42,
      kpNow: 9,
      gScale: "G5",
      verdict: "storm",
      boardColor: "red",
      windSeries,
      kpForecast,
      cmeArrivalEta: new Date(now + 5 * 3_600_000).toISOString(),
      cmeLaneProgress: 0.58,
      cmeSpeedKmS: 1500,
      cmeStatus: "approaching",
      auroraHemisphere: "N",
      auroraSouthEdgeLat: 25,
      auroraVerdict: "この嵐ではオーロラ帯が北緯25°（メキシコ／フロリダ級）まで南下 — 普段は決して見えない緯度でもオーロラが見えた歴史的イベント。",
      auroraBand,
    };
  },

  describe(): StateHint {
    return {
      summary:
        "リプレイ: 2024年5月10日の G5 大嵐（Gannon Storm）。Kp9・太陽風850km/s・Bz-42nT・オーロラは北緯25°まで南下。戦況室を全部入りで。",
      paths: [
        { path: "/stormReplay/replayBanner", type: "string", note: "【必須】最上部に Badge tone=neutral でそのまま出す（これがリプレイである唯一の確実な明示。省略・改変しない）" },
        { path: "/stormReplay/eventLabel", type: "string", note: "イベント名（先頭に『リプレイ:』が入っている）→ 見出し（Heading）。改変しない" },
        { path: "/stormReplay/cmeArrivalEta", type: "string(ISO)", note: "到達時刻（再生用に現在基準）→ Countdown.target。zeroLabel='到達' を渡す（打ち上げではないので LIFTOFF を出さない）" },
        { path: "/stormReplay/cmeLaneProgress", type: "number", note: "→ SunEarthLane.progress" },
        { path: "/stormReplay/cmeSpeedKmS", type: "number", note: "→ SunEarthLane.speedKmS / Kpi" },
        { path: "/stormReplay/cmeStatus", type: "string", note: "→ SunEarthLane.status" },
        { path: "/stormReplay/windSpeedKmS", type: "number", note: "→ SolarWindGauges.speed" },
        { path: "/stormReplay/density", type: "number", note: "→ SolarWindGauges.density" },
        { path: "/stormReplay/temperatureK", type: "number", note: "→ SolarWindGauges.temperature" },
        { path: "/stormReplay/bzNt", type: "number", note: "→ SolarWindGauges.bz（-42=猛烈に南向き）" },
        { path: "/stormReplay/windSeries", type: "array<{t,speed}>", note: "→ SolarWindGauges.series（生のまま）" },
        { path: "/stormReplay/kpNow", type: "number", note: "→ KpDial.kp（9=最大）" },
        { path: "/stormReplay/gScale", type: "string", note: "→ KpDial.gScale（G5）" },
        { path: "/stormReplay/kpForecast", type: "array<{t,kp,observed}>", note: "→ KpForecastStrip.bars（生のまま）" },
        { path: "/stormReplay/auroraVerdict", type: "string", note: "オーロラが北緯25°まで南下の説明 → Heading/Text。改変しない" },
        { path: "/stormReplay/auroraSouthEdgeLat", type: "number", note: "オーロラ南端25°N → Kpi/BigStat" },
        { path: "/stormReplay/auroraBand", type: "array<{lon,lat,prob}>", note: "→ AuroraOvalGlobe.band（生のまま）" },
        { path: "/stormReplay/auroraHemisphere", type: "string", note: "→ AuroraOvalGlobe.hemisphere(N)。observerLat/observerLon は null でよい" },
      ],
      suggest: ["Badge", "Heading", "SunEarthLane", "Countdown", "SolarWindGauges", "KpDial", "KpForecastStrip", "AuroraOvalGlobe", "BigStat", "Card", "Text", "ActionButton"],
      notes: [
        "最上部に Badge tone=neutral で /stormReplay/replayBanner を必ず出す（これがリプレイである唯一の確実な明示。今の実況と誤認させない）。",
        "これは過去の実イベントのリプレイ。boardColor=red の戦況室として全部入りで組む（CME レーン＋到達 Countdown、太陽風ゲージ、KpDial G5、3日 Kp、オーロラ楕円が25°Nまで南下）。",
        "Heading に eventLabel（先頭に『リプレイ:』入り）をそのまま出す。Countdown には zeroLabel='到達' を渡す（LIFTOFF を出さない）。",
        "SunEarthLane と Countdown は縦に積む（重ねない）。AuroraOvalGlobe は observerLat/observerLon=null で楕円だけ描く。",
      ],
      followups: ["今の宇宙天気は？", "今夜オーロラは見える？", "今、地球に向かってる太陽嵐ある？"],
    };
  },
};
