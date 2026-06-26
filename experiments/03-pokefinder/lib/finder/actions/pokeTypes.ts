import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

/** PokéAPI の生のリスト（name のみ使う。出所をライブで背負う）。 */
interface NamedListRaw {
  results: Array<{ name: string; url: string }>;
}
interface TypesRaw {
  types: NamedListRaw;
  generations: NamedListRaw;
}

/**
 * 表示語彙（JP ラベル / 色）はこちら側の curation。PokéAPI は英語 name しか返さないので、
 * 「LLM に作らせない＝出所を背負わせる」ためにここで固定する（18 タイプ・9 世代）。
 * stellar / unknown は実戦タイプでないので除外。
 */
const TYPE_LABELS: Record<string, { ja: string; color: string }> = {
  normal: { ja: "ノーマル", color: "#9fa19f" },
  fire: { ja: "ほのお", color: "#e62829" },
  water: { ja: "みず", color: "#2980ef" },
  electric: { ja: "でんき", color: "#fac000" },
  grass: { ja: "くさ", color: "#3fa129" },
  ice: { ja: "こおり", color: "#3dcef3" },
  fighting: { ja: "かくとう", color: "#ff8000" },
  poison: { ja: "どく", color: "#9141cb" },
  ground: { ja: "じめん", color: "#915121" },
  flying: { ja: "ひこう", color: "#81b9ef" },
  psychic: { ja: "エスパー", color: "#ef4179" },
  bug: { ja: "むし", color: "#91a119" },
  rock: { ja: "いわ", color: "#afa981" },
  ghost: { ja: "ゴースト", color: "#704170" },
  dragon: { ja: "ドラゴン", color: "#5060e1" },
  dark: { ja: "あく", color: "#624d4e" },
  steel: { ja: "はがね", color: "#60a1b8" },
  fairy: { ja: "フェアリー", color: "#ef70ef" },
};

/** 世代 → JP 地方ラベル（generation/<id> の id とそろえる）。 */
const GEN_LABELS: Record<number, string> = {
  1: "第1世代（カントー）",
  2: "第2世代（ジョウト）",
  3: "第3世代（ホウエン）",
  4: "第4世代（シンオウ）",
  5: "第5世代（イッシュ）",
  6: "第6世代（カロス）",
  7: "第7世代（アローラ）",
  8: "第8世代（ガラル）",
  9: "第9世代（パルデア）",
};

/** generation-i 形式の name → 数値 id（ローマ数字）。 */
const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9,
};
function genNameToId(name: string): number | null {
  const m = /^generation-([ivx]+)$/.exec(name);
  return m ? ROMAN[m[1]] ?? null : null;
}

export interface TypeVocab {
  name: string; // english (= PokéAPI key, used as findMons param)
  ja: string;
  color: string;
}
export interface GenVocab {
  id: number;
  ja: string;
}
export interface TypesState extends Record<string, unknown> {
  types: TypeVocab[];
  generations: GenVocab[];
}

/**
 * フォーム compose 用の「語彙」を供給するアクション。LLM はこの語彙からチェックボックス群 /
 * セレクトを組む（タイプ名や世代を発明させない）。fetch でエンドポイントの存在もライブ確認する。
 */
export const pokeTypes: Action<Params, TypesRaw, TypesState> = {
  id: "pokeTypes",
  when: "タイプ18種・世代9の語彙（JPラベル・色つき）。ファインダーフォームのチェックボックス/セレクトの選択肢に使う。",
  params,

  async fetch(_p, ctx) {
    const base = ctx.env.pokeBase;
    const [types, generations] = await Promise.all([
      fetchJson<NamedListRaw>(`${base}/type?limit=64`, ctx.signal),
      fetchJson<NamedListRaw>(`${base}/generation?limit=64`, ctx.signal),
    ]);
    return { types, generations };
  },

  compute(raw) {
    const types: TypeVocab[] = raw.types.results
      .filter((t) => t.name in TYPE_LABELS)
      .map((t) => ({ name: t.name, ja: TYPE_LABELS[t.name].ja, color: TYPE_LABELS[t.name].color }));
    const generations: GenVocab[] = raw.generations.results
      .map((g) => genNameToId(g.name))
      .filter((id): id is number => id !== null && id in GEN_LABELS)
      .sort((a, b) => a - b)
      .map((id) => ({ id, ja: GEN_LABELS[id] }));
    return { types, generations };
  },

  describe(s): StateHint {
    return {
      summary: `語彙: ${s.types.length} タイプ / ${s.generations.length} 世代。`,
      paths: [
        {
          path: "/pokeTypes/types",
          type: "array<{name(en),ja,color}>",
          note: "タイプ選択（複数可）。各 name を $bindState '/shelf/type/<name>'(boolean) のチェックボックスに。ja を label・color をアクセントに。",
          sample: `len=${s.types.length}, e.g. ${s.types.slice(0, 3).map((t) => `${t.name}=${t.ja}`).join(", ")}`,
        },
        {
          path: "/pokeTypes/generations",
          type: "array<{id(number),ja}>",
          note: "世代の選択肢。§14b は世代範囲＝$bindState '/shelf/genFrom' と '/shelf/genTo'(number|null) の2セレクトに使う。null=端を開く（両 null で全世代・genFrom のみで「N世代以降」）。",
          sample: `len=${s.generations.length}, ids=${s.generations.map((g) => g.id).join(",")}`,
        },
      ],
      suggest: ["TypeCheckbox", "Select", "Slider", "ActionButton"],
      notes: [
        "これは語彙であってデータではない（件数取得はユーザーが『探す』を押してから findMons がやる）。",
      ],
    };
  },
};
