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
  /** 結合するタイプ（en name・1〜3 件）。typeMode で AND(積集合)か OR(和集合)かを切り替える。 */
  types: z.array(z.string()).min(1).max(3),
  /** §14b: タイプの結合 = and(全部持つ＝積集合) / or(どれか持つ＝和集合)。既定 and。OR で「炎か飛行」「似た＝どれかのタイプを共有」を忠実化。 */
  typeMode: z.enum(["and", "or"]).optional(),
  /** §14b: 世代範囲の下端/上端（1〜9・null=開いた端）。genFrom=genTo で単一・両 null で全世代・genFrom だけ指定で「N世代以降」。範囲を忠実化。 */
  genFrom: z.number().int().min(1).max(9).nullable().optional(),
  genTo: z.number().int().min(1).max(9).nullable().optional(),
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
  /** 並べ替え軸（desc）。既定 total。問いで「素早さ高め」等の強調があれば該当軸を渡す。 */
  sortBy: z.enum(["total", ...STAT_KEYS]).optional(),
  /**
   * 別形態（メガ/キョダイ/primal/origin/ultra/-eternamax/地方フォーム等）を含めるか。
   * 既定 false = is_default の base 種だけ（type/<t> はフォーム名を全部含むので、これを切らないと
   * 種族値最大の異形＝eternatus-eternamax(1125) 等がボードを占有する＝「相棒探し」の体験が壊れる）。
   */
  includeForms: z.boolean().optional(),
  /** 結果ボードに載せる最大件数（表示の上限・既定 24）。 */
  limit: z.number().int().min(1).max(60).optional(),
});
type Params = z.infer<typeof params>;

/**
 * 候補の種族値を取りに行く上限（安全弁）。**ランキングは全候補を評価してから上位を出す**ので、
 * これより候補が少ない限り「最強順」は正確（旧 60 は cand をアルファベット順に切ってから種族値を取り、
 * 上位N＝前綴りの一部になって reshiram 等の真の強者を取りこぼす致命バグだった）。
 * 現実のクエリ（単一タイプ最大 ~192・3タイプ OR 和集合でも ~450）は全部この中に収まり truncated=false。
 * これを超える病的ケースだけ truncated で明示（その場合のみ前綴り近似）。射程↔レイテンシは全件 fetch のコストで払う。
 */
const MAX_DETAIL = 600;
/** 種族値 fetch の並列度（全候補を取り切るのでやや上げる）。 */
const DETAIL_CONCURRENCY = 16;

interface TypeRaw {
  pokemon: Array<{ pokemon: { name: string; url: string } }>;
}
interface GenerationRaw {
  pokemon_species: Array<{ name: string; url: string }>;
}
interface PokemonRaw {
  id: number;
  name: string;
  is_default: boolean; // 既定形態か（true=base 種・false=メガ/キョダイ等の別形態）
  species: { name: string }; // base 種名（世代フィルタはフォーム名でなくこれで突き合わせる）
  sprites: { front_default: string | null };
  types: Array<{ type: { name: string } }>;
  stats: Array<{ base_stat: number; stat: { name: string } }>;
}

interface FindRaw {
  monsRaw: PokemonRaw[];
  typeCounts: Record<string, number>; // タイプごとの母集団サイズ（フォーム名込み・結合前）
  matchedCount: number; // タイプ結合＋形態フィルタ＋世代フィルタ後の候補総数
  truncated: boolean; // MAX_DETAIL 安全弁で切ったか（現実クエリでは非発生）
  droppedCount: number; // 安全弁で切り捨てた候補数
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
  criteria: {
    types: string[];
    typeMode: "and" | "or";
    genFrom: number | null;
    genTo: number | null;
    minStats: Partial<Record<StatKey, number>>;
    sortBy: string;
    includeForms: boolean;
  };
  topName: string | null;
}

const SORT_LABEL: Record<string, string> = {
  total: "総合力", hp: "HP", attack: "こうげき", defense: "ぼうぎょ", spAtk: "とくこう", spDef: "とくぼう", speed: "すばやさ",
};

/** 結果ボード用の日本語 criteria ラベル（typeMode の OR/AND・世代範囲・並べ替え・形態を反映）。route 2箇所で共用。 */
export function criteriaLabelJa(c: FindState["criteria"]): string {
  const typeLabel =
    c.typeMode === "or"
      ? `${c.types.join("か")}（どれか）`
      : `${c.types.join("・")}${c.types.length > 1 ? "（すべて）" : ""}`;
  // 世代ラベルは fetch と同じく min/max 正規化し、片端 null は「以降/まで」で開放を表す。
  const gen = (() => {
    const { genFrom, genTo } = c;
    if (genFrom == null && genTo == null) return "";
    if (genFrom != null && genTo != null) {
      const lo = Math.min(genFrom, genTo), hi = Math.max(genFrom, genTo);
      return lo === hi ? ` / 第${lo}世代` : ` / 第${lo}〜${hi}世代`;
    }
    if (genFrom != null) return ` / 第${genFrom}世代以降`;
    return ` / 第${genTo}世代まで`;
  })();
  const stats = Object.keys(c.minStats).length ? ` / 下限 ${JSON.stringify(c.minStats)}` : "";
  const sort = c.sortBy && c.sortBy !== "total" ? ` / ${SORT_LABEL[c.sortBy] ?? c.sortBy}順` : "";
  const forms = c.includeForms ? " / 別形態込み" : "";
  return typeLabel + gen + stats + sort + forms;
}

export const findMons: Action<Params, FindRaw, FindState> = {
  id: "findMons",
  when: "選んだタイプ(typeMode=and 積集合 / or 和集合)・世代範囲(genFrom..genTo)・種族値しきい値・並べ替え(sortBy)・形態(includeForms 既定 false=base 種のみ)でポケモンをサーバ計算して返す。『探す』で呼ぶ。",
  params,

  // ★ fetch = I/O ＋ 積集合の計画（どの pokemon を取りに行くかを決める）。種族値の純計算は compute。
  async fetch(p, ctx) {
    const base = ctx.env.pokeBase;

    // 1) 各タイプの母集団を並列取得し、typeMode で AND(積集合) か OR(和集合) を取る。
    const typeMode = p.typeMode ?? "and";
    const typeLists = await Promise.all(
      p.types.map((t) => fetchJson<TypeRaw>(`${base}/type/${t}`, ctx.signal)),
    );
    const typeCounts: Record<string, number> = {};
    const nameSets = typeLists.map((tl, i) => {
      const names = new Set(tl.pokemon.map((e) => e.pokemon.name));
      typeCounts[p.types[i]] = names.size;
      return names;
    });
    let cand: string[];
    if (typeMode === "or") {
      // OR = 和集合（どれかのタイプを持つ）。候補は大きく膨らむ＝MAX_DETAIL の cap が効きやすい（線の幅↔射程/レイテンシ）。
      const union = new Set<string>();
      for (const s of nameSets) for (const n of s) union.add(n);
      cand = [...union];
    } else {
      cand = [...nameSets[0]];
      for (let i = 1; i < nameSets.length; i++) cand = cand.filter((n) => nameSets[i].has(n));
    }

    // 2) 世代範囲の species 集合を用意（突き合わせは fetch 後に species.name で行う＝フォーム名と種名の
    //    粒度差バグを回避。type/<t> はフォーム名・generation は種名なので、生文字列の交差は giratina 等を誤って落とす）。
    const genFrom = p.genFrom ?? null;
    const genTo = p.genTo ?? null;
    let genSpecies: Set<string> | null = null;
    if (genFrom != null || genTo != null) {
      const lo = Math.min(genFrom ?? 1, genTo ?? 9);
      const hi = Math.max(genFrom ?? 1, genTo ?? 9);
      const gens: number[] = [];
      for (let g = lo; g <= hi; g++) gens.push(g);
      const genLists = await Promise.all(
        gens.map((g) => fetchJson<GenerationRaw>(`${base}/generation/${g}`, ctx.signal)),
      );
      genSpecies = new Set<string>();
      for (const gl of genLists) for (const s of gl.pokemon_species) genSpecies.add(s.name);
    }
    cand.sort(); // 決定的に（安全弁で切るときの再現性）

    // 3) 安全弁（現実クエリ最大 ~498 < 600 なので通常 truncated=false）。
    const capped = cand.slice(0, MAX_DETAIL);
    const truncated = cand.length > MAX_DETAIL;

    // 4) 全候補の詳細を並列取得（is_default/species 含む。ランキングは全件評価してから上位を出す）。
    let monsRaw = await mapLimit(capped, DETAIL_CONCURRENCY, (name) =>
      fetchJson<PokemonRaw>(`${base}/pokemon/${name}`, ctx.signal),
    );

    // 5) 形態フィルタ: 既定は is_default の base 種だけ（メガ/キョダイ/eternamax 等の異形を除外）。includeForms で全形態。
    if (!p.includeForms) monsRaw = monsRaw.filter((m) => m.is_default);
    // 6) 世代フィルタ: フォーム名でなく species.name で突き合わせる（giratina-altered→giratina 等が正しく残る）。
    if (genSpecies) monsRaw = monsRaw.filter((m) => genSpecies!.has(m.species.name));

    // 条件（タイプ結合＋形態＋世代）に合った総数。
    const matchedCount = monsRaw.length;
    return { monsRaw, typeCounts, matchedCount, truncated, droppedCount: cand.length - capped.length };
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
      criteria: {
        types: p.types,
        typeMode: p.typeMode ?? "and",
        genFrom: p.genFrom ?? null,
        genTo: p.genTo ?? null,
        minStats,
        sortBy,
        includeForms: p.includeForms ?? false,
      },
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
        `候補が非常に多く（${s.matchedCount} 件）、安全弁の上限 ${MAX_DETAIL} 件のみ種族値を評価しました（${s.droppedCount} 件は未評価＝この場合のみ「最強順」は近似）。タイプや世代で絞ると完全に評価できます。`,
      );
    }
    if (s.filteredOut > 0) notes.push(`種族値しきい値で ${s.filteredOut} 件除外。`);
    const cr = s.criteria;
    const join = cr.typeMode === "or" ? "∪" : "∩";
    const genLabel =
      cr.genFrom != null || cr.genTo != null ? ` ∩ gen${cr.genFrom ?? 1}–${cr.genTo ?? 9}` : "";
    const crLabel =
      `${cr.types.join(join)}` +
      genLabel +
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
