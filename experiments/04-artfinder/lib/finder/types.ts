import type { z } from "zod";

/**
 * I/O context handed to an action's fetch. 03 (pokefinder) から写経。
 * AIC は鍵不要なので env は base だけ（テスト/モックで差し替え可能にする seam）。
 *  - artBase: AIC API のベース（https://api.artic.edu/api/v1）
 *  - iiifBase: 作品画像 IIIF のベース（https://www.artic.edu/iiif/2）。サーバが画像 URL まで組んで返す。
 */
export interface ActionContext {
  signal: AbortSignal;
  env: { artBase: string; iiifBase: string };
}

/** Hard data failure (vs. soft-degrade which returns a partial state). */
export class ActionDataError extends Error {}

/**
 * Paths + meaning + counts handed to the COMPOSE LLM（最終 spec 構成用）。
 * NEVER raw data / arrays — データ→プロンプトのファイアウォール（01/02/03 と同一）。
 * exp04 では「結果ボード」compose に findArt の hint を、「フォーム」compose に
 * artVocab の hint（=語彙）を渡す。LLM が見るのは件数とスカラー sample だけ。
 */
export interface StateHint {
  /** scalar-only one-liner the LLM may read, e.g. "1539 matches, top='Starry Night...'" */
  summary: string;
  paths: Array<{
    path: string; // json-pointer, e.g. "/findArt/artworks" -> {"$state":"/findArt/artworks"}
    type: string; // shape only, e.g. "array<{title,artist,image,...}>"
    note: string; // meaning + units + which component it fits
    sample?: string; // SCALARS ONLY
  }>;
  /** soft nudge toward catalog components that fit this data */
  suggest?: string[];
  /** surfaced to the LLM verbatim */
  notes?: string[];
}

/**
 * One self-contained capability. 03 の Action 契約を写経（exp04 も単発 compose なので
 * loop 用 toModel/instanceKey は持たない）。
 *  P = validated params, R = raw payload, S = computed state slice.
 *
 * ★ exp04 の規律: フォーム state → 上流(AIC)の ES クエリへの**翻訳**は「どう検索するか」を決める
 *   **fetch のオーケストレーション**に置き、IIIF URL 組み立て・行整形といった **表示のための純計算は
 *   compute** に置く。どちらもサーバ側＝spec には値だけ載る（CLAUDE.md「計算は spec でなくサーバで値に」）。
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
  /** I/O（＋クエリ翻訳の計画）。throws ActionDataError on hard failure. */
  fetch(params: P, ctx: ActionContext): Promise<R>;
  /** PURE。IIIF URL 組み立て・行整形・件数。No I/O。 */
  compute(raw: R, params: P): S;
  /** $state パス + スカラー要約（compose プロンプト向け。S を受け取り COUNTS を出す。配列は出さない）。 */
  describe(state: S): StateHint;
}

export type AnyAction = Action<any, any, any>;

/** 生成ループの進捗（server → client、data-stage パートで運ぶ）。01/02/03 同型。 */
export type Stage = {
  phase: "composing" | "fetching" | "error";
  label?: string;
};
