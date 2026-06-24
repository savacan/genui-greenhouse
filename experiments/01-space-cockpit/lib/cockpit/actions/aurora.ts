import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

// NOAA SWPC OVATION オーロラ予報。920KB の [lon,lat,prob] 65160点グリッド。
// 重要(probe済・ファイアウォール): 生グリッドは LLM に絶対渡さない。サーバで
//  ①オーロラ楕円の equatorward 南端緯度、②観測地に届くかの verdict 文字列、
//  ③描画用に間引いた帯 のスカラー/小配列だけにして返す。
const OVATION = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const TH = 10; // visibility 閾値(%)
const VISIBLE_MARGIN = 3; // 楕円南端よりこの度数だけ赤道側でも「淡く見える可能性」

interface OvationRaw {
  "Observation Time": string;
  "Forecast Time": string;
  coordinates: Array<[number, number, number]>; // [lon(0-359), lat(-90..90), prob]
}
interface AuroraFetched {
  raw: OvationRaw;
  observer: { lat: number; lon: number } | null;
}

export interface AuroraState extends Record<string, unknown> {
  observerAvailable: boolean;
  hemisphere: "N" | "S";
  southEdgeLat: number | null; // 楕円の equatorward 端（その半球で）
  maxProb: number;
  observerLat: number | null;
  observerLon: number | null;
  observerEdgeLat: number | null; // 観測地の経度での南端
  reaches: boolean;
  verdict: string; // サーバで完成した1文（LLM はこれを置くだけ）
  forecastTime: string;
  ovalBand: Array<{ lon: number; lat: number; prob: number }>; // 描画用に間引いた帯（AuroraOvalGlobe にだけ）
}

export const aurora: Action<Params, AuroraFetched, AuroraState> = {
  id: "aurora",
  when:
    "今夜オーロラは見えるか／オーロラ予報。NOAA OVATION の楕円から、観測地（位置情報があれば）の緯度に届くかをサーバ判定。" +
    "spaceWeather と一緒に使う（オーロラの問いでは spaceWeather も）。",
  params,

  async fetch(_p, ctx) {
    const raw = await fetchJson<OvationRaw>(OVATION, ctx.signal);
    return { raw, observer: ctx.observer ?? null };
  },

  compute(fetched) {
    const coords = fetched.raw.coordinates ?? [];
    const obs = fetched.observer;
    const hemisphere: "N" | "S" = obs && obs.lat < 0 ? "S" : "N";
    const inHemi = (lat: number) => (hemisphere === "N" ? lat > 0 : lat < 0);
    // equatorward（赤道側）の端: N半球は最小lat、S半球は最大lat（=絶対値が小さい方）
    const moreEquator = (a: number, b: number) => (hemisphere === "N" ? Math.min(a, b) : Math.max(a, b));

    // 経度ごとの南端(equatorward端) を集計
    const edgeByLon = new Map<number, number>();
    let maxProb = 0;
    for (const [lon, lat, prob] of coords) {
      if (prob > maxProb) maxProb = prob;
      if (prob < TH || !inHemi(lat)) continue;
      const cur = edgeByLon.get(lon);
      edgeByLon.set(lon, cur == null ? lat : moreEquator(cur, lat));
    }

    let southEdgeLat: number | null = null;
    for (const lat of edgeByLon.values()) {
      southEdgeLat = southEdgeLat == null ? lat : moreEquator(southEdgeLat, lat);
    }

    // 描画用の帯: prob>=TH を経度3°・全緯度で間引く（その半球のみ）
    const ovalBand: Array<{ lon: number; lat: number; prob: number }> = [];
    for (const [lon, lat, prob] of coords) {
      if (prob >= TH && inHemi(lat) && lon % 3 === 0) ovalBand.push({ lon, lat, prob });
    }

    // 観測地判定
    let observerEdgeLat: number | null = null;
    let reaches = false;
    let verdict: string;
    if (obs) {
      const oLon = ((Math.round(obs.lon) % 360) + 360) % 360;
      // 観測地の経度±2°の南端
      let edge: number | null = null;
      for (let dl = -2; dl <= 2; dl++) {
        const e = edgeByLon.get(((oLon + dl) % 360 + 360) % 360);
        if (e != null) edge = edge == null ? e : moreEquator(edge, e);
      }
      observerEdgeLat = edge;
      const absObs = Math.abs(obs.lat);
      if (edge == null) {
        verdict = `あなたの経度の空にはいまオーロラ帯がありません（緯度 ${obs.lat.toFixed(1)}°）。今夜は見えなさそうです。`;
      } else {
        const absEdge = Math.abs(edge);
        reaches = absObs >= absEdge - VISIBLE_MARGIN;
        verdict = reaches
          ? `オーロラ帯の南端は${hemisphere === "N" ? "北緯" : "南緯"}${absEdge}°、あなたは${absObs.toFixed(1)}° — 届く可能性があります。空の${hemisphere === "N" ? "北" : "南"}を見て。`
          : `オーロラ帯の南端は${hemisphere === "N" ? "北緯" : "南緯"}${absEdge}°、あなたは${absObs.toFixed(1)}° — 今夜は見えなさそうです。`;
      }
    } else {
      verdict =
        southEdgeLat != null
          ? `オーロラ帯の南端はおよそ${hemisphere === "N" ? "北緯" : "南緯"}${Math.abs(southEdgeLat)}°。位置情報を許可すると「あなたに届くか」を判定します。`
          : `いまオーロラ帯はほとんど出ていません（静穏）。`;
    }

    return {
      observerAvailable: !!obs,
      hemisphere,
      southEdgeLat,
      maxProb,
      observerLat: obs?.lat ?? null,
      observerLon: obs?.lon ?? null,
      observerEdgeLat,
      reaches,
      verdict,
      forecastTime: fetched.raw["Forecast Time"] ?? "",
      ovalBand,
    };
  },

  describe(s): StateHint {
    // 注意(ファイアウォール): LLM が読む summary に観測地の精密緯度を入れない。
    // 緯度入りの完成文は /aurora/verdict（state）にだけ置き、部品にバインドさせる。
    const llmSummary = !s.observerAvailable
      ? "位置情報未許可（南端緯度のみ）"
      : s.reaches
        ? "観測地に届く可能性あり"
        : "観測地には届かなさそう";
    return {
      summary:
        `オーロラ: ${llmSummary}` +
        (s.southEdgeLat != null ? `（南端 ${Math.abs(s.southEdgeLat)}°` : "（オーロラ帯ほぼ無し") +
        (s.maxProb ? `、最大確率 ${s.maxProb}%、予報 ${s.forecastTime}）` : "）"),
      paths: [
        { path: "/aurora/verdict", type: "string", note: "サーバ完成の判定文（見える/見えない・観測地の緯度入り）。Heading か Text か Card で主役に出す。改変しない" },
        { path: "/aurora/reaches", type: "boolean", note: "観測地に届くか。true なら Badge tone=ok『見えるかも』, false なら tone=neutral" },
        { path: "/aurora/southEdgeLat", type: "number|null", note: `オーロラ帯の南端緯度(${s.southEdgeLat ?? "なし"})。Kpi/BigStat にも` },
        { path: "/aurora/observerAvailable", type: "boolean", note: `位置情報が使えたか(${s.observerAvailable})。false なら『位置情報を許可すると個人判定』を促す` },
        { path: "/aurora/maxProb", type: "number", note: "オーロラ出現確率の最大%（Kpi）" },
        { path: "/aurora/ovalBand", type: "array<{lon,lat,prob}>", note: "AuroraOvalGlobe.band にだけバインド（北/南極視点の楕円描画用・$format しない）" },
        { path: "/aurora/hemisphere", type: "string(N|S)", note: "観測半球。AuroraOvalGlobe.hemisphere" },
        { path: "/aurora/observerLat", type: "number|null", note: "観測地の緯度（AuroraOvalGlobe.observerLat）" },
        { path: "/aurora/observerLon", type: "number|null", note: "観測地の経度（AuroraOvalGlobe.observerLon）" },
      ],
      suggest: ["AuroraOvalGlobe", "Heading", "Badge", "BigStat", "Kpi", "Card", "Text", "ActionButton"],
      notes: [
        "主役は AuroraOvalGlobe（極視点で楕円＋観測地ドット）＋ verdict 文（見える/見えない）。",
        "verdict はサーバが完成させた1文なのでそのまま出す（数字を作り直さない）。",
      ],
      followups: ["今の宇宙天気は？", "今、地球に向かってる太陽嵐ある？", "ISSは今どこ？"],
    };
  },
};
