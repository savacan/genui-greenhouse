/**
 * フォーム state（/shelf）→ findMons / `/api/find` の引数への変換（純関数・React 非依存）。
 * page.tsx の「探す」と eval スクリプトの両方がこれを使う＝エンドツーエンド検証が“実際の変換”を測れる
 * （複製してドリフトすると検証が嘘になる＝§15 の教訓・単一の真実の源にする）。
 */

export type Shelf = {
  type?: Record<string, boolean>;
  typeMode?: "and" | "or";
  genFrom?: number | string | null;
  genTo?: number | string | null;
  minStats?: Record<string, number>;
  sortBy?: string;
  includeForms?: boolean;
};

export type FindParams = {
  types: string[];
  typeMode: "and" | "or";
  genFrom: number | null;
  genTo: number | null;
  minStats: Record<string, number>;
  sortBy?: string;
  includeForms: boolean;
};

/** Select の value は稀に文字列で来る（LLM が "5" を出す等）。number|null に正規化。 */
export function toGen(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** store の現在 shelf → findMons 引数（false / 0 は落とす）。typeMode・世代範囲・sortBy・includeForms も渡す。 */
export function toFindParams(shelf: Shelf | undefined): FindParams {
  const types = Object.entries(shelf?.type ?? {}).filter(([, v]) => v).map(([k]) => k).slice(0, 3);
  const minStats = Object.fromEntries(
    Object.entries(shelf?.minStats ?? {}).filter(([, v]) => typeof v === "number" && v > 0),
  );
  return {
    types,
    typeMode: shelf?.typeMode === "or" ? "or" : "and",
    genFrom: toGen(shelf?.genFrom),
    genTo: toGen(shelf?.genTo),
    minStats,
    sortBy: typeof shelf?.sortBy === "string" ? shelf.sortBy : undefined,
    includeForms: shelf?.includeForms === true,
  };
}
