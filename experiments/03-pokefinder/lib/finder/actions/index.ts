import type { AnyAction } from "../types";
import { pokeTypes } from "./pokeTypes";
import { findMons } from "./findMons";

/**
 * THE registry. exp03 は LLM ルーティングしない（フォームの語彙＝pokeTypes / 『探す』の計算＝findMons）。
 *  - pokeTypes: フォーム compose に渡す語彙（タイプ/世代）。
 *  - findMons : 『探す』で呼ぶサーバ計算（積集合＋種族値フィルタ）。
 */
export const ACTIONS = [pokeTypes, findMons] as const satisfies readonly AnyAction[];

export const actionById: Record<string, AnyAction> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
);

export { pokeTypes, findMons };
