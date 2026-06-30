import type { AnyAction } from "../types";
import { artVocab } from "./artVocab";
import { findArt } from "./findArt";

/**
 * THE registry. exp04 は LLM ルーティングしない（フォームの語彙＝artVocab / 『探す』の計算＝findArt）。
 *  - artVocab: フォーム compose に渡す語彙（種別/部門/色相/並べ替え）。
 *  - findArt : 『探す』で呼ぶサーバ計算（form state → AIC の ES クエリ翻訳）。
 */
export const ACTIONS = [artVocab, findArt] as const satisfies readonly AnyAction[];

export const actionById: Record<string, AnyAction> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
);

export { artVocab, findArt };
