import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

// NASA DONKI CME。既存 NASA_API_KEY(1000req/h) を本線、落ちたらキー不要の CCMC ミラー。
// 重要(probe済): 地球到達の判定は isEarthGB ではない（GB=glancing blow で、史上級の2024-05嵐でも False）。
// DONKI が地球向けに計算する estimatedShockArrivalTime の有無で「地球に届く」を判定する。
const WINDOW_DAYS = 35;

interface EnlilRun {
  estimatedShockArrivalTime: string | null;
  kp_90?: number | null;
  isEarthGB?: boolean | null;
  modelCompletionTime?: string | null;
}
interface CmeAnalysis {
  isMostAccurate?: boolean;
  speed?: number | null;
  type?: string | null;
  halfAngle?: number | null;
  enlilList?: EnlilRun[] | null;
}
interface CmeRaw {
  startTime: string;
  cmeAnalyses?: CmeAnalysis[] | null;
}

export interface CmeState extends Record<string, unknown> {
  present: boolean; // 地球に向かう CME を描く価値があるか
  status: "approaching" | "arrived" | "none";
  launchedAt: string | null;
  arrivalEta: string | null; // ISO（Countdown.target にバインド可）
  etaSource: "enlil-modeled" | "none";
  tMinusSec: number | null; // 残り秒（負なら到着済み）
  laneProgress: number; // 0..1 太陽→地球（SunEarthLane）
  speedKmS: number | null;
  predictedKp: number | null;
}

/** DONKI "2024-05-10T12:14Z" → "2024-05-10T12:14:00Z"（秒欠落を補う） */
function donkiIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z$/.exec(s);
  return m ? `${m[1]}:00Z` : s;
}
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Candidate {
  launchedAt: string | null;
  arrivalMs: number;
  arrivalEta: string;
  speed: number | null;
  kp: number | null;
}

export const cme: Action<Params, CmeRaw[], CmeState> = {
  id: "cme",
  when:
    "今、太陽から地球に向かって飛んでいるコロナ質量放出(CME)／太陽嵐の到来。NASA の到達予測時刻つきライブ T-。" +
    "『太陽嵐は来てる?』『フレアは地球に向かってる?』系の問いで spaceWeather と一緒に使う。",
  params,

  async fetch(_p, ctx) {
    const now = Date.now();
    const start = ymd(now - WINDOW_DAYS * 86_400_000);
    const end = ymd(now);
    const key = ctx.env.nasaKey;
    try {
      return await fetchJson<CmeRaw[]>(
        `https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${key}`,
        ctx.signal,
      );
    } catch {
      // キー不要ミラー（NASA公式ではないが DEMO_KEY の 429 回避）
      return fetchJson<CmeRaw[]>(
        `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/CME?startDate=${start}&endDate=${end}`,
        ctx.signal,
      );
    }
  },

  compute(raw) {
    const now = Date.now();
    const cands: Candidate[] = [];
    for (const c of raw ?? []) {
      const analyses = c.cmeAnalyses ?? [];
      // 最も確からしい解析を優先（無ければ全部見る）
      const chosen = analyses.filter((a) => a.isMostAccurate);
      for (const a of chosen.length ? chosen : analyses) {
        for (const e of a.enlilList ?? []) {
          const arr = donkiIso(e.estimatedShockArrivalTime);
          if (!arr) continue; // 地球到達予測がある = 地球に届くと NASA が見ている
          const arrivalMs = new Date(arr).getTime();
          if (!Number.isFinite(arrivalMs)) continue;
          const launched = donkiIso(c.startTime);
          cands.push({
            launchedAt: launched, // null 可（到達時刻で代用して span=0 にしない）
            arrivalMs,
            arrivalEta: arr,
            speed: a.speed ?? null,
            kp: e.kp_90 ?? null,
          });
        }
      }
    }

    const none: CmeState = {
      present: false,
      status: "none",
      launchedAt: null,
      arrivalEta: null,
      etaSource: "none",
      tMinusSec: null,
      laneProgress: 0,
      speedKmS: null,
      predictedKp: null,
    };
    if (!cands.length) return none;

    // 進行中（到達が未来）を最優先で最も近いもの。無ければ直近36h以内に到達済みのもの。
    const future = cands.filter((c) => c.arrivalMs > now).sort((a, b) => a.arrivalMs - b.arrivalMs);
    const recent = cands
      .filter((c) => c.arrivalMs <= now && now - c.arrivalMs < 36 * 3_600_000)
      .sort((a, b) => b.arrivalMs - a.arrivalMs);
    const pick = future[0] ?? recent[0];
    if (!pick) return none;

    const launchMs = pick.launchedAt ? new Date(pick.launchedAt).getTime() : NaN;
    const span = pick.arrivalMs - launchMs;
    const approaching = pick.arrivalMs > now;
    // 打ち上げ時刻が不明/異形なら進捗を捏造しない。接近中は地球手前(0)・到達済みは1に倒す
    // （0.999 を超えないので SunEarthLane の「到達」誤表示も防ぐ）。
    const laneProgress =
      Number.isFinite(span) && span > 0
        ? Math.max(0, Math.min(1, (now - launchMs) / span))
        : approaching
          ? 0
          : 1;

    return {
      present: true,
      status: approaching ? "approaching" : "arrived",
      launchedAt: pick.launchedAt,
      arrivalEta: pick.arrivalEta,
      etaSource: "enlil-modeled",
      tMinusSec: Math.round((pick.arrivalMs - now) / 1000),
      laneProgress: Math.round(laneProgress * 1000) / 1000,
      speedKmS: pick.speed != null ? Math.round(pick.speed) : null,
      predictedKp: pick.kp ?? null,
    };
  },

  describe(s): StateHint {
    if (!s.present) {
      return {
        summary: "現在、地球に向かって到達予測のある CME はありません（静穏）。",
        paths: [{ path: "/cme/present", type: "boolean", note: "false。SunEarthLane/Countdown は出さない。spaceWeather の静穏ボードに任せる" }],
        suggest: ["Text", "Badge"],
        notes: ["地球向き CME なし。SunEarthLane を描かず、Text で『地球に向かう太陽嵐は今ない』程度に。主役は spaceWeather。"],
        followups: ["今の宇宙天気は？", "今夜オーロラは見える？", "過去の大嵐をリプレイ"],
      };
    }
    const arrJp = s.status === "approaching" ? "接近中" : "到達済み";
    return {
      summary: `地球向き CME ${arrJp}: 到達 ${s.arrivalEta}（NASA ENLIL 予測）・速度 ${s.speedKmS ?? "?"}km/s・予測Kp ${s.predictedKp ?? "?"}。`,
      paths: [
        { path: "/cme/arrivalEta", type: "string(ISO)", note: "NASA 予測の地球到達時刻 → Countdown.target にバインド（主役のライブT-）。zeroLabel='到達' を渡す（打ち上げではないので LIFTOFF を出さない）" },
        { path: "/cme/laneProgress", type: "number(0-1)", note: "太陽→地球レーンの“モデル位置”（ENLIL 予測到達までの経過時間の線形内挿。実トラッキングではない）→ SunEarthLane.progress" },
        { path: "/cme/speedKmS", type: "number|null", note: "CME 速度 km/s（Kpi/Text、SunEarthLane.speedKmS）" },
        { path: "/cme/predictedKp", type: "number|null", note: "予測される地磁気 Kp（Text/Kpi）" },
        { path: "/cme/launchedAt", type: "string(ISO)|null", note: "太陽を出た時刻（Text・出所）。null のときは出さない（打ち上げ時刻不明・到達予測のみ）" },
        { path: "/cme/status", type: "string(approaching|arrived)", note: "接近中か到達済みか" },
      ],
      suggest: ["SunEarthLane", "Countdown", "BigStat", "Kpi", "Card", "Heading", "Text", "Badge", "ActionButton"],
      notes: [
        "主役は SunEarthLane（太陽→地球を CME が進む）＋ 到達 Countdown(target=/cme/arrivalEta, zeroLabel='到達')。SunEarthLane と Countdown は必ず縦に積む（同じ親 Stack direction=vertical の別要素として上下に。重ねない）。ENLIL 予測値なので『距離÷速度の概算ではない』誠実さを Text で添えてよい。",
        "SunEarthLane の塊位置は実トラッキングではなく ENLIL 予測到達までの線形内挿（モデル位置）。位置を数値で断言せず、主役は到達 ETA・速度・予測 Kp。",
        "spaceWeather と同時に来るので1画面に: 上に SunEarthLane＋Countdown、下に SolarWindGauges/KpDial。",
      ],
      followups: ["今夜オーロラは見える？", "今の宇宙天気は？", "ISSは今どこ？"],
    };
  },
};
