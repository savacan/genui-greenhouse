/**
 * フォーム state（/shelf）→ findArt / `/api/find` の引数への変換（純関数・React 非依存）。
 * page.tsx の「探す」と eval スクリプトの両方がこれを使う＝エンドツーエンド検証が“実際の変換”を測れる
 * （複製してドリフトすると検証が嘘になる＝pokefinder §15/§16 の教訓・単一の真実の源にする）。
 *
 * AIC のファセット（種別/部門）は「slug の boolean マップ」で持つ（pokefinder の type と同型）。
 * slug→AIC の実フィールド値（artwork_type_title 等）への対応は findArt 側が持つ（出所をサーバが背負う）。
 */

export type Shelf = {
  type?: Record<string, boolean>; // artwork_type の slug（painting/sculpture/...）
  department?: Record<string, boolean>; // department の slug（europe/americas/...）
  yearFrom?: number | string | null; // 制作年の下端（date_start >=）
  yearTo?: number | string | null; // 制作年の上端（date_start <=）
  hue?: number | string | null; // 色相 0-360 の中心（null=色指定なし）
  onView?: boolean; // 展示中のみ
  publicDomain?: boolean; // パブリックドメインのみ
  q?: string | null; // 自由テキスト（作者名・作品名）
  subject?: string | null; // 主題・画題（subject_titles を match＝何が描かれているか・英語）
  region?: string | null; // 産地・地域（place_of_origin・英語・大陸はサーバが代表国へ展開）
  combineMode?: string; // and（既定・ファセット間 AND）| or（軸またぎのクロスファセット OR）
  sortBy?: string; // relevance | newest | oldest
};

export type ArtSortBy = "relevance" | "newest" | "oldest";
export type ArtCombineMode = "and" | "or";

export type ArtFindParams = {
  types: string[]; // slug
  departments: string[]; // slug
  yearFrom: number | null;
  yearTo: number | null;
  hue: number | null;
  onView: boolean;
  publicDomain: boolean;
  q: string | null;
  subject: string | null;
  region: string | null;
  combineMode: ArtCombineMode;
  sortBy: ArtSortBy;
};

/** Select/Slider の value は稀に文字列で来る（LLM が "1900" を出す等）。number|null に正規化。 */
export function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** boolean マップから true のキー（slug）だけ取り出す。 */
function trueKeys(m: Record<string, boolean> | undefined): string[] {
  return Object.entries(m ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
}

const SORTS: ReadonlySet<string> = new Set(["relevance", "newest", "oldest"]);

/** store の現在 shelf → findArt 引数（false/空は落とす）。 */
export function toFindParams(shelf: Shelf | undefined): ArtFindParams {
  const q = typeof shelf?.q === "string" ? shelf.q.trim() : "";
  const subject = typeof shelf?.subject === "string" ? shelf.subject.trim() : "";
  const region = typeof shelf?.region === "string" ? shelf.region.trim() : "";
  return {
    types: trueKeys(shelf?.type).slice(0, 8),
    departments: trueKeys(shelf?.department).slice(0, 12),
    yearFrom: toNum(shelf?.yearFrom),
    yearTo: toNum(shelf?.yearTo),
    hue: toNum(shelf?.hue),
    onView: shelf?.onView === true,
    publicDomain: shelf?.publicDomain === true,
    q: q.length ? q : null,
    subject: subject.length ? subject : null,
    region: region.length ? region : null,
    combineMode: shelf?.combineMode === "or" ? "or" : "and",
    sortBy: SORTS.has(shelf?.sortBy ?? "") ? (shelf!.sortBy as ArtSortBy) : "relevance",
  };
}

/**
 * 検索に意味のある条件が1つでもあるか（種別/部門/年代/色相/自由語/主題/産地）。
 * onView/publicDomain は“絞り込みの修飾”であって単独の検索条件にしない（それだけで全件は引かせない）。
 * combineMode も単独条件にしない（OR の対象になる内容条件が無ければ無意味）。
 * pokefinder の「types 必須」と同型＝「条件ゼロでも探せます」の嘘を防ぐ（§16 false-disclosure）。
 */
export function hasAnyFilter(p: ArtFindParams): boolean {
  return (
    p.types.length > 0 ||
    p.departments.length > 0 ||
    p.yearFrom != null ||
    p.yearTo != null ||
    p.hue != null ||
    (p.q != null && p.q.length > 0) ||
    (p.subject != null && p.subject.length > 0) ||
    (p.region != null && p.region.length > 0)
  );
}
