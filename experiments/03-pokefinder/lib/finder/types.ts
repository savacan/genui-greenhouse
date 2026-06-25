import type { z } from "zod";

/**
 * I/O context handed to an action's fetch. 01/02 から写経。
 * PokéAPI は鍵不要なので env は base だけ（テスト/モックで差し替え可能にする seam）。
 */
export interface ActionContext {
  signal: AbortSignal;
  env: { pokeBase: string };
}

/** Hard data failure (vs. soft-degrade which returns a partial state). */
export class ActionDataError extends Error {}

/**
 * Paths + meaning + counts handed to the COMPOSE LLM（最終 spec 構成用）。
 * NEVER raw data / arrays — データ→プロンプトのファイアウォール（01/02 と同一）。
 * exp03 では「結果ボード」compose に findMons の hint を、「フォーム」compose に
 * pokeTypes の hint（=語彙）を渡す。LLM が見るのは件数とスカラー sample だけ。
 */
export interface StateHint {
  /** scalar-only one-liner the LLM may read, e.g. "23 matches, top='charizard' total=534" */
  summary: string;
  paths: Array<{
    path: string; // json-pointer, e.g. "/findMons/mons" -> {"$state":"/findMons/mons"}
    type: string; // shape only, e.g. "array<{name,sprite,total,...}>"
    note: string; // meaning + units + which component it fits
    sample?: string; // SCALARS ONLY
  }>;
  /** soft nudge toward catalog components that fit this data */
  suggest?: string[];
  /** surfaced to the LLM verbatim */
  notes?: string[];
}

/**
 * One self-contained capability. 01 の Action 契約を写経（exp03 は単発 compose なので
 * 02 の loop 用 toModel/instanceKey は持たない）。
 *  P = validated params, R = raw payload, S = computed state slice.
 *
 * ★ exp03 の規律: 集合演算（タイプ AND 積集合・generation 積集合）は「どの pokemon を
 *   取りに行くか」を決める **fetch のオーケストレーション**に置き、種族値のしきい値フィルタ・
 *   並べ替え・行整形といった **表示のための純計算は compute** に置く。どちらもサーバ側＝
 *   spec には値だけ載る（CLAUDE.md「計算は spec でなくサーバで値に」）。
 */
export interface Action<
  P = unknown,
  R = unknown,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  /** stable id = initialState namespace key（$state パスの先頭） */
  readonly id: string;
  /** one line describing the capability（compose プロンプトのメニュー用） */
  readonly when: string;
  /** Zod params; フォーム state から解決した値を検証する単一の真実。 */
  readonly params: z.ZodType<P>;
  /** I/O（＋積集合の計画）。throws ActionDataError on hard failure. */
  fetch(params: P, ctx: ActionContext): Promise<R>;
  /** PURE。種族値フィルタ・並べ替え・KPI 値・行整形。No I/O。 */
  compute(raw: R, params: P): S;
  /** $state パス + スカラー要約（compose プロンプト向け。S を受け取り COUNTS を出す。配列は出さない）。 */
  describe(state: S): StateHint;
}

export type AnyAction = Action<any, any, any>;

/** 生成ループの進捗（server → client、data-stage パートで運ぶ）。01 同型。 */
export type Stage = {
  phase: "composing" | "fetching" | "error";
  label?: string;
};
