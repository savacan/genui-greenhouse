import { z } from "zod";
import type { Action, StateHint } from "../types";
import { postJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

/**
 * 表示語彙（JP ラベル）とファセット値はこちら側の curation。AIC の facet 値は綺麗なリスト API を直接は
 * くれないので、「LLM に作らせない＝出所を背負わせる」ためにここで固定する。
 * slug→AIC の実フィールド値（artwork_type_title / department_title の .keyword 値）への対応もここが単一の真実。
 *
 * ★ §15 の教訓（粒度はサーバが選ぶ）: 種別ファセットは `classification_title`（"oil on canvas" 等の
 *   技法混じりの細粒度）でなく `artwork_type_title`（"Painting"/"Sculpture" の粗粒度）を使う。
 */

/** 種別（artwork_type_title.keyword の値）。slug は $bindState のパスに使う安全な英小文字。 */
export const ART_TYPES = [
  { slug: "painting", ja: "絵画", title: "Painting" },
  { slug: "sculpture", ja: "彫刻", title: "Sculpture" },
  { slug: "print", ja: "版画", title: "Print" },
  { slug: "drawing", ja: "素描・水彩", title: "Drawing and Watercolor" },
  { slug: "photograph", ja: "写真", title: "Photograph" },
  { slug: "textile", ja: "染織", title: "Textile" },
  { slug: "ceramics", ja: "陶磁", title: "Ceramics" },
  { slug: "metalwork", ja: "金工", title: "Metalwork" },
] as const;

/** 部門（department_title.keyword の値）。AIC の実値（recon で確認）。 */
export const DEPARTMENTS = [
  { slug: "europe", ja: "ヨーロッパ絵画・彫刻", title: "Painting and Sculpture of Europe" },
  { slug: "americas", ja: "アメリカ大陸の美術", title: "Arts of the Americas" },
  { slug: "asia", ja: "アジアの美術", title: "Arts of Asia" },
  { slug: "africa", ja: "アフリカの美術", title: "Arts of Africa" },
  { slug: "modern", ja: "近代美術", title: "Modern Art" },
  { slug: "contemporary", ja: "現代美術", title: "Contemporary Art" },
  { slug: "prints", ja: "版画・素描", title: "Prints and Drawings" },
  { slug: "photography", ja: "写真・メディア", title: "Photography and Media" },
  { slug: "appliedEurope", ja: "ヨーロッパ工芸", title: "Applied Arts of Europe" },
  { slug: "architecture", ja: "建築・デザイン", title: "Architecture and Design" },
  { slug: "ancient", ja: "古代地中海", title: "Arts of Greece, Rome, and Byzantium" },
] as const;

/**
 * 色相スウォッチ（exp04 新モダリティ）。h は color.h の中心（0-360）。
 * 低彩度（茶/灰/白黒）は color.h が不安定なので扱わない（色相帯で絞るのに向く有彩色だけ）。
 */
export const HUES = [
  { slug: "red", ja: "赤", h: 0, swatch: "#d12b2b" },
  { slug: "orange", ja: "オレンジ", h: 30, swatch: "#e08a2b" },
  { slug: "yellow", ja: "黄", h: 52, swatch: "#e8c63a" },
  { slug: "green", ja: "緑", h: 120, swatch: "#3fa15a" },
  { slug: "teal", ja: "青緑", h: 180, swatch: "#2bb3a3" },
  { slug: "blue", ja: "青", h: 215, swatch: "#2b6fd1" },
  { slug: "purple", ja: "紫", h: 280, swatch: "#7d4bd1" },
  { slug: "pink", ja: "ピンク", h: 330, swatch: "#d14b9a" },
] as const;

/** 並べ替え。AIC ES sort（relevance=デフォルト・newest/oldest=date_start desc/asc）。 */
export const SORTS = [
  { value: "relevance", ja: "関連度" },
  { value: "newest", ja: "新しい順" },
  { value: "oldest", ja: "古い順" },
] as const;

export type TypeVocab = { slug: string; ja: string; title: string };
export type DeptVocab = { slug: string; ja: string; title: string };
export type HueVocab = { slug: string; ja: string; h: number; swatch: string };
export type SortVocab = { value: string; ja: string };

export interface VocabState extends Record<string, unknown> {
  types: TypeVocab[];
  departments: DeptVocab[];
  hues: HueVocab[];
  sorts: SortVocab[];
}

/** slug → AIC 実値の引き（findArt と共有・発明や重複定義をさせない）。 */
export const TYPE_TITLE_BY_SLUG: Record<string, string> = Object.fromEntries(ART_TYPES.map((t) => [t.slug, t.title]));
export const DEPT_TITLE_BY_SLUG: Record<string, string> = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d.title]));
export const HUE_BY_SLUG: Record<string, HueVocab> = Object.fromEntries(HUES.map((h) => [h.slug, h]));

/**
 * フォーム compose 用の「語彙」を供給するアクション。LLM はこの語彙からチェックボックス群 / セレクト /
 * 色スウォッチを組む（種別名や部門を発明させない）。fetch で AIC の疎通もライブ確認する（落ちていれば compose 前に検知）。
 */
export const artVocab: Action<Params, { total: number }, VocabState> = {
  id: "artVocab",
  when: "AIC の種別(絵画/彫刻/版画…)・部門・色相スウォッチ・並べ替えの語彙（JPラベル）。ファインダーフォームのチェックボックス/セレクト/色選択の選択肢に使う。",
  params,

  async fetch(_p, ctx) {
    // 疎通確認だけ（語彙は curate 定数。件数は『探す』で findArt が取る）。
    const data = await postJson<{ pagination?: { total?: number } }>(
      `${ctx.env.artBase}/artworks/search`,
      { query: { exists: { field: "id" } }, limit: 0 },
      ctx.signal,
    );
    return { total: data.pagination?.total ?? 0 };
  },

  compute() {
    return {
      types: ART_TYPES.map((t) => ({ ...t })),
      departments: DEPARTMENTS.map((d) => ({ ...d })),
      hues: HUES.map((h) => ({ ...h })),
      sorts: SORTS.map((s) => ({ ...s })),
    };
  },

  describe(s): StateHint {
    return {
      summary: `語彙: ${s.types.length} 種別 / ${s.departments.length} 部門 / ${s.hues.length} 色相 / ${s.sorts.length} 並べ替え。`,
      paths: [
        {
          path: "/artVocab/types",
          type: "array<{slug,ja,title}>",
          note: "種別の選択肢（複数可・ファセット内 OR）。各 slug を $bindState '/shelf/type/<slug>'(boolean) のチェックボックスに。ja を label に。",
          sample: `e.g. ${s.types.slice(0, 4).map((t) => `${t.slug}=${t.ja}`).join(", ")}`,
        },
        {
          path: "/artVocab/departments",
          type: "array<{slug,ja,title}>",
          note: "部門の選択肢（複数可・ファセット内 OR）。各 slug を $bindState '/shelf/department/<slug>'(boolean) に。",
          sample: `e.g. ${s.departments.slice(0, 4).map((d) => `${d.slug}=${d.ja}`).join(", ")}`,
        },
        {
          path: "/artVocab/hues",
          type: "array<{slug,ja,h,swatch}>",
          note: "色相スウォッチ。ColorSwatch を並べ、各 selected は $bindState '/shelf/hue'（中心色相 h を入れる単一選択）。色指定なしは null。",
          sample: `e.g. ${s.hues.slice(0, 4).map((h) => `${h.ja}(h=${h.h})`).join(", ")}`,
        },
        {
          path: "/artVocab/sorts",
          type: "array<{value,ja}>",
          note: "並べ替え。Select の value を $bindState '/shelf/sortBy' に（relevance/newest/oldest）。",
          sample: s.sorts.map((x) => x.value).join(","),
        },
      ],
      suggest: ["FacetCheckbox", "ColorSwatch", "TextInput", "RangeSelect", "Toggle", "Select", "ActionButton"],
      notes: ["これは語彙であってデータではない（件数取得はユーザーが『探す』を押してから findArt がやる）。"],
    };
  },
};
