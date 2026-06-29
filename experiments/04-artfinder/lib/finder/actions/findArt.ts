import { z } from "zod";
import type { Action, StateHint } from "../types";
import { postJson } from "../fetchJson";
import {
  TYPE_TITLE_BY_SLUG,
  DEPT_TITLE_BY_SLUG,
  HUE_BY_SLUG,
  ART_TYPES,
  DEPARTMENTS,
  HUES,
} from "./artVocab";

/**
 * 「探す」で呼ぶサーバ計算＝**フォーム state → 上流(AIC)の Elasticsearch クエリへの翻訳**（exp04 の核）。
 * pokefinder は積集合を自前で計算したが、ここは AIC が DSL を持つので我々は薄い翻訳器:
 *   - ファセット内 OR: 同じファセットの複数 ON → bool.should + minimum_should_match:1
 *   - ファセット間 AND: 種別/部門/年代/色相/トグル を bool.must で重ねる
 *   - 年代/色相は range（色相は 0/360 の wraparound を should 2本で扱う）
 *   - 自由テキストは top-level q（AIC の全文関連検索）
 *   - 常に exists:image_id（画像なし作品でボードを汚さない＝§15 の H5）
 * 返すのは**値**（IIIF 画像 URL まで組む・spec に算術なし）。term はテキスト体に .keyword 必須（recon 済）。
 */

const params = z.object({
  types: z.array(z.string()).max(8).optional(), // slug
  departments: z.array(z.string()).max(12).optional(), // slug
  yearFrom: z.number().int().nullable().optional(),
  yearTo: z.number().int().nullable().optional(),
  hue: z.number().int().min(0).max(360).nullable().optional(),
  onView: z.boolean().optional(),
  publicDomain: z.boolean().optional(),
  q: z.string().nullable().optional(),
  sortBy: z.enum(["relevance", "newest", "oldest"]).optional(),
  limit: z.number().int().min(1).max(60).optional(),
});
type Params = z.infer<typeof params>;

/** 色相スウォッチの半幅（±度）。これより狭いと取りこぼし、広いと混ざる＝色の「線の幅」。 */
const HUE_WINDOW = 18;

interface ArtworkRaw {
  id: number;
  title: string | null;
  artist_title: string | null;
  date_display: string | null;
  date_start: number | null;
  date_end: number | null;
  medium_display: string | null;
  artwork_type_title: string | null;
  department_title: string | null;
  is_on_view: boolean | null;
  is_public_domain: boolean | null;
  image_id: string | null;
  color: { h: number; s: number; l: number } | null;
}
interface SearchRaw {
  data: ArtworkRaw[];
  pagination: { total: number };
  config?: { iiif_url?: string };
}

export interface ArtRow {
  id: number;
  title: string;
  artist: string;
  dateText: string;
  medium: string;
  type: string; // artwork_type_title（生・英）
  department: string;
  onView: boolean;
  image: string | null; // IIIF URL（サーバが組む）
  swatch: string | null; // 主要色の CSS 色（hsl）。画像が出ない時の色チップ＋色の視覚化（AIC 画像は cross-origin 表示不可・docs §2）
  hue: number | null;
}

interface FindRaw {
  rows: ArtworkRaw[];
  total: number;
  iiifBase: string;
}

export interface FindState extends Record<string, unknown> {
  artworks: ArtRow[];
  count: number; // 表示件数
  matchedCount: number; // 条件に合った総数（pagination.total）
  criteria: {
    types: string[];
    departments: string[];
    yearFrom: number | null;
    yearTo: number | null;
    hue: number | null;
    onView: boolean;
    publicDomain: boolean;
    q: string | null;
    sortBy: "relevance" | "newest" | "oldest";
  };
  topTitle: string | null;
}

const FIELDS = [
  "id",
  "title",
  "artist_title",
  "date_display",
  "date_start",
  "date_end",
  "medium_display",
  "artwork_type_title",
  "department_title",
  "is_on_view",
  "is_public_domain",
  "image_id",
  "color",
];

type EsClause = Record<string, unknown>;

/** 色相 hue を中心に ±HUE_WINDOW の range（0/360 をまたぐときは should 2本）。 */
function hueClause(hue: number): EsClause {
  const lo = hue - HUE_WINDOW;
  const hi = hue + HUE_WINDOW;
  if (lo < 0) {
    return {
      bool: {
        should: [
          { range: { "color.h": { gte: 0, lte: hi } } },
          { range: { "color.h": { gte: 360 + lo, lte: 360 } } },
        ],
        minimum_should_match: 1,
      },
    };
  }
  if (hi > 360) {
    return {
      bool: {
        should: [
          { range: { "color.h": { gte: lo, lte: 360 } } },
          { range: { "color.h": { gte: 0, lte: hi - 360 } } },
        ],
        minimum_should_match: 1,
      },
    };
  }
  return { range: { "color.h": { gte: lo, lte: hi } } };
}

/** ファセット内 OR（slug→実値に翻訳し、未知 slug は捨てる）。1件も残らなければ null。 */
function facetClause(field: string, slugs: string[], map: Record<string, string>): EsClause | null {
  const titles = slugs.map((s) => map[s]).filter((t): t is string => !!t);
  if (!titles.length) return null;
  if (titles.length === 1) return { term: { [field]: titles[0] } };
  return {
    bool: {
      should: titles.map((t) => ({ term: { [field]: t } })),
      minimum_should_match: 1,
    },
  };
}

/** form params → AIC ES クエリ（POST body）。route と probe が同じ翻訳を見られるよう export。 */
export function buildSearchBody(p: Params, limit: number): Record<string, unknown> {
  const must: EsClause[] = [];
  const typeClause = facetClause("artwork_type_title.keyword", p.types ?? [], TYPE_TITLE_BY_SLUG);
  if (typeClause) must.push(typeClause);
  const deptClause = facetClause("department_title.keyword", p.departments ?? [], DEPT_TITLE_BY_SLUG);
  if (deptClause) must.push(deptClause);
  if (p.yearFrom != null) must.push({ range: { date_start: { gte: p.yearFrom } } });
  if (p.yearTo != null) must.push({ range: { date_start: { lte: p.yearTo } } });
  if (p.hue != null) must.push(hueClause(p.hue));
  // 自由語は multi_match の must＝**実際に集合を絞る**（top-level q は関連度の並べ替えだけで件数を絞らず、
  // 「候補N件」が嘘になる＝§16 の教訓。multi_match なら Monet×彫刻=0 のように正しく AND フィルタする）。
  const q = (p.q ?? "").trim();
  if (q) must.push({ multi_match: { query: q, fields: ["title", "artist_title", "term_titles"] } });
  if (p.onView) must.push({ term: { is_on_view: true } });
  if (p.publicDomain) must.push({ term: { is_public_domain: true } });
  must.push({ exists: { field: "image_id" } }); // 常に画像あり（ボード汚染防止・§15/H5）

  const body: Record<string, unknown> = {
    query: { bool: { must } },
    fields: FIELDS,
    limit,
  };
  if (p.sortBy === "newest") body.sort = [{ date_start: "desc" }];
  else if (p.sortBy === "oldest") body.sort = [{ date_start: "asc" }];
  return body;
}

export const findArt: Action<Params, FindRaw, FindState> = {
  id: "findArt",
  when: "選んだ種別(ファセット内 OR)・部門・制作年範囲・色相・展示中/PD・自由語でAICの所蔵作品をサーバ検索して返す。『探す』で呼ぶ。",
  params,

  // ★ fetch = I/O ＋ クエリ翻訳（form state → ES bool）。1コールで rich な行が返るので N+1 なし。
  async fetch(p, ctx) {
    const limit = p.limit ?? 24;
    const body = buildSearchBody(p, limit);
    const data = await postJson<SearchRaw>(`${ctx.env.artBase}/artworks/search`, body, ctx.signal);
    return {
      rows: Array.isArray(data.data) ? data.data : [],
      total: data.pagination?.total ?? 0,
      iiifBase: data.config?.iiif_url || ctx.env.iiifBase,
    };
  },

  // ★ PURE: IIIF URL 組み立て・行整形（spec には値だけ載る）。
  compute(raw, p) {
    const artworks: ArtRow[] = raw.rows.map((a) => ({
      id: a.id,
      title: a.title ?? "（無題）",
      artist: a.artist_title ?? "作者不詳",
      dateText: a.date_display ?? "",
      medium: a.medium_display ?? "",
      type: a.artwork_type_title ?? "",
      department: a.department_title ?? "",
      onView: a.is_on_view === true,
      image: a.image_id ? `${raw.iiifBase}/${a.image_id}/full/400,/0/default.jpg` : null,
      swatch: a.color ? `hsl(${a.color.h}, ${a.color.s}%, ${a.color.l}%)` : null,
      hue: a.color?.h ?? null,
    }));
    return {
      artworks,
      count: artworks.length,
      matchedCount: raw.total,
      criteria: {
        types: p.types ?? [],
        departments: p.departments ?? [],
        yearFrom: p.yearFrom ?? null,
        yearTo: p.yearTo ?? null,
        hue: p.hue ?? null,
        onView: p.onView ?? false,
        publicDomain: p.publicDomain ?? false,
        q: (p.q ?? "").trim() || null,
        sortBy: p.sortBy ?? "relevance",
      },
      topTitle: artworks[0]?.title ?? null,
    };
  },

  describe(s): StateHint {
    const notes: string[] = [];
    if (s.count === 0) {
      notes.push(
        "該当0件 — 条件をゆるめてみてください（種別/部門を減らす・年代を広げる・色や展示中の絞りを外す・自由語を変える）。",
      );
    }
    return {
      summary: `${criteriaLabelJa(s.criteria)}: ${s.count} 件${s.topTitle ? `, top='${s.topTitle}'` : ""}（候補 ${s.matchedCount}）。`,
      paths: [
        {
          path: "/findArt/artworks",
          type: "array<{id,title,artist,dateText,medium,type,department,onView,image,hue}>",
          note: "結果の作品（並べ替え済）。作品画像カードのグリッド。image は IIIF の JPG URL。",
          sample: `len=${s.count}${s.topTitle ? `, top='${s.topTitle}'` : ""}`,
        },
        { path: "/findArt/count", type: "number", note: `表示件数（${s.count}）。` },
        { path: "/findArt/matchedCount", type: "number", note: `条件に合った総数（${s.matchedCount}）。` },
      ],
      suggest: ["ArtGrid", "Kpi", "Text"],
      notes,
    };
  },
};

const TYPE_JA = Object.fromEntries(ART_TYPES.map((t) => [t.slug, t.ja]));
const DEPT_JA = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d.ja]));

/** 結果ボード用の日本語 criteria ラベル（route と eval で共用）。 */
export function criteriaLabelJa(c: FindState["criteria"]): string {
  const parts: string[] = [];
  if (c.types.length) parts.push(c.types.map((s) => TYPE_JA[s] ?? s).join("か"));
  if (c.departments.length) parts.push(c.departments.map((s) => DEPT_JA[s] ?? s).join("か"));
  if (c.yearFrom != null && c.yearTo != null) {
    const lo = Math.min(c.yearFrom, c.yearTo);
    const hi = Math.max(c.yearFrom, c.yearTo);
    parts.push(lo === hi ? `${lo}年` : `${lo}〜${hi}年`);
  } else if (c.yearFrom != null) parts.push(`${c.yearFrom}年以降`);
  else if (c.yearTo != null) parts.push(`${c.yearTo}年まで`);
  if (c.hue != null) {
    const h = HUES.find((x) => x.h === c.hue) ?? Object.values(HUE_BY_SLUG).find((x) => x.h === c.hue);
    parts.push(`${h ? h.ja : `色相${c.hue}`}系`);
  }
  if (c.q) parts.push(`「${c.q}」`);
  if (c.onView) parts.push("展示中");
  if (c.publicDomain) parts.push("PD");
  const sort = c.sortBy === "newest" ? " / 新しい順" : c.sortBy === "oldest" ? " / 古い順" : "";
  return (parts.join(" / ") || "全作品") + sort;
}
