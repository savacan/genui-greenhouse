import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson, mapLimit } from "../fetchJson";

/** 種族値の6軸（PokéAPI の stat 名 → camelCase 表示キー）。 */
const STAT_KEYS = ["hp", "attack", "defense", "spAtk", "spDef", "speed"] as const;
type StatKey = (typeof STAT_KEYS)[number];
const API_STAT_TO_KEY: Record<string, StatKey> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "spAtk",
  "special-defense": "spDef",
  speed: "speed",
};

const params = z.object({
  /** AND で積集合するタイプ（en name・1〜3 件）。 */
  types: z.array(z.string()).min(1).max(3),
  /** 世代で絞る（1〜9・null=全世代）。 */
  generationId: z.number().int().min(1).max(9).nullable().optional(),
  /** 種族値の下限（指定軸のみ AND で適用。例 { speed: 100 }）。全軸 optional。 */
  minStats: z
    .object({
      hp: z.number().optional(),
      attack: z.number().optional(),
      defense: z.number().optional(),
      spAtk: z.number().optional(),
      spDef: z.number().optional(),
      speed: z.number().optional(),
    })
    .optional(),
  /** 並べ替え軸（desc）。既定 total。 */
  sortBy: z.enum(["total", ...STAT_KEYS]).optional(),
  /** 結果ボードに載せる最大件数（表示の上限・既定 24）。 */
  limit: z.number().int().min(1).max(60).optional(),
});
type Params = z.infer<typeof params>;

/** 候補が膨らんでも N+1 を抑える上限（単一の広いタイプ等）。超過分は truncated で明示。 */
const MAX_DETAIL = 60;

interface TypeRaw {
  pokemon: Array<{ pokemon: { name: string; url: string } }>;
}
interface GenerationRaw {
  pokemon_species: Array<{ name: string; url: string }>;
}
interface PokemonRaw {
  id: number;
  name: string;
  sprites: { front_default: string | null };
  types: Array<{ type: { name: string } }>;
  stats: Array<{ base_stat: number; stat: { name: string } }>;
}

interface FindRaw {
  monsRaw: PokemonRaw[];
  typeCounts: Record<string, number>; // タイプごとの母集団サイズ（積集合前）
  matchedCount: number; // 積集合（＋世代）後の候補総数
  truncated: boolean; // MAX_DETAIL で切ったか
  droppedCount: number; // 切り捨てた候補数
}

export interface MonRow {
  id: number;
  name: string;
  sprite: string | null;
  types: string[]; // en names（バッジは pokeTypes の色を引ける）
  hp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
  total: number; // 6 stat の合計（種族値合計）
}

export interface FindState extends Record<string, unknown> {
  mons: MonRow[];
  count: number; // フィルタ後・表示件数
  matchedCount: number; // 積集合（型×世代）後の候補数
  filteredOut: number; // 種族値フィルタで落ちた数
  truncated: boolean;
  droppedCount: number;
  typeCounts: Record<string, number>;
  criteria: { types: string[]; generationId: number | null; minStats: Partial<Record<StatKey, number>>; sortBy: string };
  topName: string | null;
}

function idFromUrl(url: string): number {
  const m = /\/(\d+)\/?$/.exec(url);
  return m ? Number(m[1]) : 0;
}

export const findMons: Action<Params, FindRaw, FindState> = {
  id: "findMons",
  when: "選んだタイプ(AND)・世代・種族値しきい値に合うポケモンをサーバで積集合計算して返す。『探す』で呼ぶ。",
  params,

  // ★ fetch = I/O ＋ 積集合の計画（どの pokemon を取りに行くかを決める）。種族値の純計算は compute。
  async fetch(p, ctx) {
    const base = ctx.env.pokeBase;

    // 1) 各タイプの母集団を並列取得し、name 集合の AND 積集合を取る。
    const typeLists = await Promise.all(
      p.types.map((t) => fetchJson<TypeRaw>(`${base}/type/${t}`, ctx.signal)),
    );
    const typeCounts: Record<string, number> = {};
    const nameSets = typeLists.map((tl, i) => {
      const names = new Set(tl.pokemon.map((e) => e.pokemon.name));
      typeCounts[p.types[i]] = names.size;
      return names;
    });
    let cand = [...nameSets[0]];
    for (let i = 1; i < nameSets.length; i++) cand = cand.filter((n) => nameSets[i].has(n));

    // 2) 世代で積集合（generation/<id> の species name と突き合わせ）。
    if (p.generationId != null) {
      const gen = await fetchJson<GenerationRaw>(`${base}/generation/${p.generationId}`, ctx.signal);
      const species = new Set(gen.pokemon_species.map((s) => s.name));
      cand = cand.filter((n) => species.has(n));
    }
    cand.sort(); // 決定的に

    // 3) 候補が多すぎたら上限で切る（種族値を取りに行く N+1 を抑える・切ったことは明示）。
    const matchedCount = cand.length;
    const capped = cand.slice(0, MAX_DETAIL);
    const truncated = cand.length > MAX_DETAIL;

    // 4) 候補の種族値・スプライト・タイプを並列取得（生 payload を返すだけ。整形は compute）。
    const monsRaw = await mapLimit(capped, 8, (name) =>
      fetchJson<PokemonRaw>(`${base}/pokemon/${name}`, ctx.signal),
    );

    return { monsRaw, typeCounts, matchedCount, truncated, droppedCount: matchedCount - capped.length };
  },

  // ★ PURE: 種族値の合計・しきい値フィルタ・並べ替え・行整形（全部ここ。spec には値だけ載る）。
  compute(raw, p) {
    const minStats = (p.minStats ?? {}) as Partial<Record<StatKey, number>>;
    const sortBy = p.sortBy ?? "total";
    const limit = p.limit ?? 24;

    const rowsAll: MonRow[] = raw.monsRaw.map((m) => {
      const stat: Record<StatKey, number> = { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 };
      for (const s of m.stats) {
        const key = API_STAT_TO_KEY[s.stat.name];
        if (key) stat[key] = s.base_stat;
      }
      const total = STAT_KEYS.reduce((sum, k) => sum + stat[k], 0);
      return {
        id: m.id,
        name: m.name,
        sprite: m.sprites?.front_default ?? null,
        types: m.types.map((t) => t.type.name),
        ...stat,
        total,
      };
    });

    // 種族値しきい値（指定軸のみ AND）。
    const passed = rowsAll.filter((r) =>
      STAT_KEYS.every((k) => minStats[k] == null || r[k] >= (minStats[k] as number)),
    );

    // 並べ替え（desc）。
    passed.sort((a, b) => (b[sortBy as keyof MonRow] as number) - (a[sortBy as keyof MonRow] as number));
    const mons = passed.slice(0, limit);

    return {
      mons,
      count: mons.length,
      matchedCount: raw.matchedCount,
      filteredOut: rowsAll.length - passed.length,
      truncated: raw.truncated,
      droppedCount: raw.droppedCount,
      typeCounts: raw.typeCounts,
      criteria: { types: p.types, generationId: p.generationId ?? null, minStats, sortBy },
      topName: mons[0]?.name ?? null,
    };
  },

  describe(s): StateHint {
    const notes: string[] = [];
    if (s.count === 0) {
      notes.push("該当0件 — 表でなく空状態の Text を出し、条件をゆるめる誘導を添える。");
    }
    if (s.truncated) {
      notes.push(
        `候補 ${s.matchedCount} 件のうち上位 ${MAX_DETAIL} 件のみ種族値取得（${s.droppedCount} 件は未評価）。2つ目のタイプか世代で絞ると正確。`,
      );
    }
    if (s.filteredOut > 0) notes.push(`種族値しきい値で ${s.filteredOut} 件除外。`);
    const cr = s.criteria;
    const crLabel =
      `${cr.types.join("∩")}` +
      (cr.generationId ? ` ∩ gen${cr.generationId}` : "") +
      (Object.keys(cr.minStats).length ? ` / min ${JSON.stringify(cr.minStats)}` : "") +
      ` / sort ${cr.sortBy}`;
    return {
      summary: `${crLabel}: ${s.count} 件${s.topName ? `, top='${s.topName}'` : ""}（候補 ${s.matchedCount}）。`,
      paths: [
        {
          path: "/findMons/mons",
          type: "array<{id,name,sprite,types[],hp,attack,defense,spAtk,spDef,speed,total}>",
          note: "結果のポケモン（並べ替え済）。スプライトカードのグリッド／各 stat は 0-255 のバー。types は色付きバッジ。",
          sample: `len=${s.count}${s.topName ? `, top='${s.topName}'` : ""}`,
        },
        { path: "/findMons/count", type: "number", note: `表示件数（${s.count}）。見出しや件数バッジに。` },
        { path: "/findMons/matchedCount", type: "number", note: `条件に合った総数（${s.matchedCount}）。` },
      ],
      suggest: ["MonCard", "StatBars", "TypeBadge", "SpriteImg", "BigStat", "Text"],
      notes,
    };
  },
};
