import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

// 「宇宙に今何人？」= open-notify astros.json。既存の List/Kpi/Card だけで描ける
// （新コンポーネント不要 = "1ファイル+1配列追加" の拡張性の実証）。
const params = z.object({});
type Params = z.infer<typeof params>;

interface AstrosRaw {
  people: Array<{ name: string; craft: string }>;
  number: number;
}

export interface AstrosState extends Record<string, unknown> {
  total: number;
  iss: string[];
  tiangong: string[];
  other: string[];
  craftSummary: string[]; // ["ISS: 9名", "Tiangong: 3名"]
}

export const astros: Action<Params, AstrosRaw, AstrosState> = {
  id: "astros",
  when: "今宇宙に何人いて誰がいるか — 宇宙船（ISS / Tiangong 等）ごとの人数と名前。",
  params,

  async fetch(_p, ctx) {
    // open-notify は HTTP のみ。このアクションはこのデータが本体なので失敗は route 側の error カードに任せる。
    return fetchJson<AstrosRaw>("http://api.open-notify.org/astros.json", ctx.signal);
  },

  compute(raw) {
    const iss: string[] = [];
    const tiangong: string[] = [];
    const other: string[] = [];
    for (const p of raw.people ?? []) {
      if (p.craft === "ISS") iss.push(p.name);
      else if (p.craft === "Tiangong") tiangong.push(p.name);
      else other.push(`${p.name}（${p.craft}）`);
    }
    const craftSummary: string[] = [];
    if (iss.length) craftSummary.push(`ISS: ${iss.length}名`);
    if (tiangong.length) craftSummary.push(`Tiangong: ${tiangong.length}名`);
    if (other.length) craftSummary.push(`その他: ${other.length}名`);
    return {
      total: raw.number ?? iss.length + tiangong.length + other.length,
      iss,
      tiangong,
      other,
      craftSummary,
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      { path: "/astros/total", type: "number", note: "宇宙にいる総人数 → 主役は BigStat（unit='人', context=内訳）で大きく" },
      { path: "/astros/craftSummary", type: "array<string>", note: "宇宙船ごとの人数サマリ（List）" },
    ];
    if (s.iss.length)
      paths.push({ path: "/astros/iss", type: "array<string>", note: `ISS のクルー ${s.iss.length}名（List, title=ISS）` });
    if (s.tiangong.length)
      paths.push({ path: "/astros/tiangong", type: "array<string>", note: `Tiangong のクルー ${s.tiangong.length}名（List, title=天宮）` });
    if (s.other.length)
      paths.push({ path: "/astros/other", type: "array<string>", note: "その他の宇宙船の人（List）" });
    return {
      summary: `${s.total} people in space (ISS ${s.iss.length}, Tiangong ${s.tiangong.length}).`,
      paths,
      suggest: ["BigStat", "Heading", "List", "Card", "ActionButton"],
      followups: ["ISSは今どこ？", "今日の宇宙写真は？", "今週ヤバい小惑星ある？"],
    };
  },
};
