import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

const WINDOW_DAYS = 7;

interface FlrRaw {
  classType: string; // "M2.3" / "X1.0" / "C3.4"
  peakTime: string; // ISO-ish "2026-05-22T10:29Z"
  sourceLocation: string | null;
  activeRegionNum: number | null;
}

export interface FlaresState extends Record<string, unknown> {
  recent: Array<{ class: string; time: string; region: string }>;
  total: number;
  strongest: string | null;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// クラスの強さ順位（X>M>C>B>A）
const rank = (c: string) => ({ X: 4, M: 3, C: 2, B: 1, A: 0 } as Record<string, number>)[c?.[0]?.toUpperCase()] ?? -1;
// 同一クラス内のマグニチュードも見る（X9.0 > X1.0）。X45 でも 445<500 で上位クラスと衝突しない。
const mag = (c: string) => rank(c) * 100 + (parseFloat(c.slice(1)) || 0);

export const flares: Action<Params, FlrRaw[], FlaresState> = {
  id: "flares",
  when: "最近の太陽フレア（X/M/C クラス）の一覧・活動の活発さ。宇宙天気の補助。",
  params,

  async fetch(_p, ctx) {
    const now = Date.now();
    const start = ymd(now - WINDOW_DAYS * 86_400_000);
    const end = ymd(now);
    const key = ctx.env.nasaKey;
    try {
      return await fetchJson<FlrRaw[]>(
        `https://api.nasa.gov/DONKI/FLR?startDate=${start}&endDate=${end}&api_key=${key}`,
        ctx.signal,
      );
    } catch {
      return fetchJson<FlrRaw[]>(
        `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=${start}&endDate=${end}`,
        ctx.signal,
      );
    }
  },

  compute(raw) {
    const list = (raw ?? [])
      .filter((f) => f.peakTime && f.classType)
      .sort((a, b) => new Date(b.peakTime).getTime() - new Date(a.peakTime).getTime());
    const recent = list.slice(0, 12).map((f) => ({
      class: f.classType,
      time: f.peakTime,
      region: f.activeRegionNum ? `AR${f.activeRegionNum}` : f.sourceLocation || "—",
    }));
    const strongest = list.reduce<string | null>(
      (best, f) => (best == null || mag(f.classType) > mag(best) ? f.classType : best),
      null,
    );
    return { recent, total: list.length, strongest };
  },

  describe(s): StateHint {
    if (!s.total) {
      return {
        summary: "直近7日に記録された太陽フレアはありません（静穏）。",
        paths: [{ path: "/flares/total", type: "number", note: "0。Text で『目立つフレアなし』" }],
        suggest: ["Text", "Badge"],
        notes: ["フレアなし。Text で軽く。"],
        followups: ["今の宇宙天気は？", "今夜オーロラは見える？"],
      };
    }
    return {
      summary: `直近7日の太陽フレア ${s.total} 件、最大 ${s.strongest}。`,
      paths: [
        { path: "/flares/recent", type: "array<{class,time,region}>", note: "直近フレアの時系列 → FlareEventRail.items にそのままバインド" },
        { path: "/flares/total", type: "number", note: `件数(${s.total})。Kpi/BigStat` },
        { path: "/flares/strongest", type: "string|null", note: `最大クラス(${s.strongest})。Badge（X/M=強い）や Kpi` },
      ],
      suggest: ["FlareEventRail", "BigStat", "Kpi", "Badge", "Heading", "Text", "ActionButton"],
      notes: ["FlareEventRail で直近フレアの時系列を出す。X/M クラスがあれば Badge tone=danger/warn で強調。"],
      followups: ["今の宇宙天気は？", "今夜オーロラは見える？", "今、地球に向かってる太陽嵐ある？"],
    };
  },
};
