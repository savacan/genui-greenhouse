import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

// NOAA SWPC（DSCOVR @ L1 ほか）。全てキー不要・CORS *・~毎分更新。
// 注意(probe済): plasma/mag-5-minute は直近2-3分しか返らず針が動かない → 2-hour を使う。
const SWPC = "https://services.swpc.noaa.gov";
const URLS = {
  plasma: `${SWPC}/products/solar-wind/plasma-2-hour.json`, // [time_tag,density,speed,temperature]
  mag: `${SWPC}/products/solar-wind/mag-2-hour.json`, // [...,bz_gsm,...,bt]
  kp: `${SWPC}/products/noaa-planetary-k-index.json`, // {time_tag,Kp,...}
  kpForecast: `${SWPC}/products/noaa-planetary-k-index-forecast.json`, // {time_tag,kp,observed,noaa_scale}
  scales: `${SWPC}/products/noaa-scales.json`, // {"0":{G:{Scale},R,S},...}
};

type Verdict = "quiet" | "unsettled" | "storm";

export interface SpaceWeatherState extends Record<string, unknown> {
  windSpeedKmS: number;
  density: number;
  temperatureK: number;
  bzNt: number | null;
  kpNow: number;
  gScale: string; // "G0".."G5"
  gScaleNum: number;
  rScale: string;
  sScale: string;
  verdict: Verdict;
  boardColor: "blue" | "amber" | "red";
  windSeries: Array<{ t: string; speed: number }>;
  kpForecast: Array<{ t: string; kp: number; observed: string }>;
  asOf: string;
}

interface SwpcRaw {
  plasma: string[][] | null;
  mag: string[][] | null;
  kp: Array<{ time_tag: string; Kp: number | string }> | null;
  kpForecast: Array<{ time_tag: string; kp: number | string; observed: string }> | null;
  scales: Record<string, { G?: { Scale?: string }; R?: { Scale?: string }; S?: { Scale?: string } }> | null;
}

/** SWPC time "2026-06-24 02:48:00.000" → ISO */
const swpcIso = (s: string) => new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")).toISOString();
/** header行＋データ行 の配列を {col:val} 行配列に */
function table(arr: string[][] | null): Array<Record<string, string>> {
  if (!arr || arr.length < 2) return [];
  const head = arr[0];
  return arr.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export const spaceWeather: Action<Params, SwpcRaw, SpaceWeatherState> = {
  id: "spaceWeather",
  when:
    "今の宇宙天気 / 太陽嵐は来てるか / 地磁気の荒れ具合 — DSCOVR の太陽風(速度・密度)、惑星 Kp 指数と3日予報、NOAA G/R/S スケール。" +
    "オーロラや太陽フレアの問いでも主役データ。",
  params,

  async fetch(_p, ctx) {
    const get = async <T>(url: string): Promise<T | null> => {
      try {
        return await fetchJson<T>(url, ctx.signal);
      } catch {
        return null; // 1本落ちても他のゲージは出す（soft-degrade）
      }
    };
    const [plasma, mag, kp, kpForecast, scales] = await Promise.all([
      get<string[][]>(URLS.plasma),
      get<string[][]>(URLS.mag),
      get<SwpcRaw["kp"]>(URLS.kp),
      get<SwpcRaw["kpForecast"]>(URLS.kpForecast),
      get<SwpcRaw["scales"]>(URLS.scales),
    ]);
    if (!plasma && !kp) throw new Error("SWPC unavailable"); // 全滅時のみ hard fail
    return { plasma, mag, kp, kpForecast, scales };
  },

  compute(raw) {
    const plasmaRows = table(raw.plasma);
    const last = plasmaRows[plasmaRows.length - 1] ?? {};
    const windSpeedKmS = Math.round(parseFloat(last.speed ?? "0"));
    const density = Math.round(parseFloat(last.density ?? "0") * 100) / 100;
    const temperatureK = Math.round(parseFloat(last.temperature ?? "0"));
    const asOf = last.time_tag ? swpcIso(last.time_tag) : new Date().toISOString();

    // スパークライン用に直近 ~60 点だけ（生配列は $state パスで部品にだけ渡す）
    const windSeries = plasmaRows
      .slice(-60)
      .map((r) => ({ t: r.time_tag, speed: Math.round(parseFloat(r.speed ?? "0")) }))
      .filter((p) => Number.isFinite(p.speed) && p.speed > 0);

    const magRows = table(raw.mag);
    const lastMag = magRows[magRows.length - 1];
    const bzNt = lastMag ? Math.round(parseFloat(lastMag.bz_gsm ?? "0") * 10) / 10 : null;

    // 末尾 Kp が欠損でも NaN を verdict/KpDial に流さない（最後の有効観測を採る）。
    const kpVals = (raw.kp ?? []).map((r) => parseFloat(String(r.Kp ?? ""))).filter(Number.isFinite);
    const kpNow = kpVals.length ? Math.round(kpVals[kpVals.length - 1] * 10) / 10 : 0;

    const cur = raw.scales?.["0"];
    const gScaleNum = parseInt(cur?.G?.Scale ?? "0", 10) || 0;
    const gScale = `G${gScaleNum}`;
    const rScale = `R${parseInt(cur?.R?.Scale ?? "0", 10) || 0}`;
    const sScale = `S${parseInt(cur?.S?.Scale ?? "0", 10) || 0}`;

    // 3日予報（observed=過去 / predicted=未来）。未来＋直近の観測を少しだけ。
    const kpForecast = (raw.kpForecast ?? [])
      .map((r) => ({ t: r.time_tag, kp: Math.round(parseFloat(String(r.kp)) * 10) / 10, observed: r.observed }))
      .filter((r) => Number.isFinite(r.kp))
      .slice(-28);

    // verdict はサーバで決める（LLM はこの結論を読んでレイアウトを組む）
    let verdict: Verdict = "quiet";
    if (kpNow >= 5 || gScaleNum >= 1) verdict = "storm";
    else if (kpNow >= 4 || windSpeedKmS > 500 || (bzNt != null && bzNt <= -10)) verdict = "unsettled";
    const boardColor = verdict === "storm" ? "red" : verdict === "unsettled" ? "amber" : "blue";

    return {
      windSpeedKmS,
      density,
      temperatureK,
      bzNt,
      kpNow,
      gScale,
      gScaleNum,
      rScale,
      sScale,
      verdict,
      boardColor,
      windSeries,
      kpForecast,
      asOf,
    };
  },

  describe(s): StateHint {
    const jp = { quiet: "静穏", unsettled: "不穏", storm: "嵐" }[s.verdict];
    const paths: StateHint["paths"] = [
      { path: "/spaceWeather/verdict", type: "string(quiet|unsettled|storm)", note: `今の地磁気状態の結論(${s.verdict})。これでレイアウトを決める` },
      { path: "/spaceWeather/boardColor", type: "string(blue|amber|red)", note: "盤面の基調色のヒント（Card tone や Badge の色選びに使う内部値。これ自体を Kpi/Text で画面に出さない）" },
      { path: "/spaceWeather/windSpeedKmS", type: "number", note: `太陽風速度 km/s(${s.windSpeedKmS})。SolarWindGauges に /spaceWeather 一式を渡すか、Kpi 単体` },
      { path: "/spaceWeather/density", type: "number", note: "太陽風密度 p/cm³（SolarWindGauges）" },
      { path: "/spaceWeather/temperatureK", type: "number", note: "太陽風温度 K（SolarWindGauges）" },
      { path: "/spaceWeather/bzNt", type: "number|null", note: "磁場 Bz(nT)。負(南向き)だと荒れやすい（SolarWindGauges）" },
      { path: "/spaceWeather/windSeries", type: "array<{t,speed}>", note: "速度の時系列（SolarWindGauges.series にだけ生でバインド。$format しない）" },
      { path: "/spaceWeather/kpNow", type: "number", note: `現在の planetary Kp 0-9(${s.kpNow})。KpDial.kp にバインド` },
      { path: "/spaceWeather/gScale", type: "string", note: `NOAA G スケール(${s.gScale})。KpDial.gScale / Badge` },
      { path: "/spaceWeather/kpForecast", type: "array<{t,kp,observed}>", note: "3日 Kp 予報。KpForecastStrip.bars にバインド" },
      { path: "/spaceWeather/asOf", type: "string", note: "観測時刻（鮮度表示）" },
    ];
    const notes: string[] = [];
    if (s.verdict === "quiet") {
      notes.push("地磁気は静穏: spaceWeather 側は盤面を盛らず『現在、地球は穏やか』の安心カード＋KpDial か単一ゲージ中心に小さくまとめる。（SunEarthLane を出すかは cme.present 次第＝そちらの hint に従う）");
    } else {
      notes.push(`${jp}: 戦況室として組む。SolarWindGauges を主役級に、KpDial＋KpForecastStrip を添え、boardColor=${s.boardColor} で Card tone や Badge を強調。`);
    }
    return {
      summary: `宇宙天気: 風${s.windSpeedKmS}km/s・Kp${s.kpNow}・${s.gScale}・${jp}${s.bzNt != null ? `・Bz${s.bzNt}nT` : ""}（${s.asOf}）。`,
      paths,
      suggest: ["SolarWindGauges", "KpDial", "KpForecastStrip", "BigStat", "Badge", "Card", "Heading", "Text", "ActionButton"],
      notes,
      followups: ["今夜オーロラは見える？", "最近の太陽フレアは？", "過去の大嵐をリプレイ", "ISSは今どこ？"],
    };
  },
};
