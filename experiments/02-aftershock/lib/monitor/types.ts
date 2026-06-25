import type { z } from "zod";

/** I/O context handed to an action's fetch. 01 から写経し、env を 02 用に差し替え（NASA 鍵 → Wikipedia UA）。 */
export interface ActionContext {
  signal: AbortSignal;
  env: { wikiUA: string };
  /** 観測地の座標（client geolocation → request body → ここ）。LLM には渡らずサーバ計算の入力にだけ使う。 */
  observer?: { lat: number; lon: number } | null;
}

/** Hard data failure (vs. soft-degrade which returns a partial state). */
export class ActionDataError extends Error {}

/** モデルに戻してよいのはスカラー（とスカラー配列）だけ。生配列・オブジェクトは禁止＝ファイアウォール。 */
export type ModelScalar = string | number | boolean | null;
export type ModelSummary = Record<string, ModelScalar | ModelScalar[]>;

/**
 * Paths + meaning + counts handed to the COMPOSE LLM（最終 spec 構成用）。
 * NEVER raw data / arrays — データ→プロンプトのファイアウォール（01 と同一）。
 */
export interface StateHint {
  /** scalar-only one-liner the LLM may read */
  summary: string;
  paths: Array<{
    path: string; // json-pointer, e.g. "/quakes/rows" -> {"$state":"/quakes/rows"}
    type: string; // shape only, e.g. "array<{...}>"
    note: string; // meaning + units + which component it fits
    sample?: string; // SCALARS ONLY
  }>;
  /** soft nudge toward catalog components that fit this data */
  suggest?: string[];
  /** surfaced to the LLM verbatim */
  notes?: string[];
  /** ActionButton 用の「次に投げ直せる問い」候補 */
  followups?: string[];
}

/**
 * One self-contained capability. Co-locates the things that change together.
 *  P = validated params, R = raw payload, S = computed state slice.
 *
 * 01 の Action 契約に **toModel(state)** を追加したのが 02 の核。
 *  - describe(S) → 最終 compose LLM 向け（$state パス・件数）。01 と同じ。
 *  - toModel(S)  → multi-step loop の各手で **モデル文脈に再投入されるスカラー要約**（部分ファイアウォールの線）。
 */
export interface Action<
  P = unknown,
  R = unknown,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  /** stable id = tool name = $state namespace key */
  readonly id: string;
  /** one line the AGENT/ROUTER reads to pick this tool */
  readonly when: string;
  /** Zod params; becomes the tool inputSchema. z.object({}) if none. */
  readonly params: z.ZodType<P>;
  /** I/O only. throws ActionDataError on hard failure; returns partial on soft failure. */
  fetch(params: P, ctx: ActionContext): Promise<R>;
  /** PURE. ALL math here: parseFloat, ranking, KPI values, downsampling. No I/O. */
  compute(raw: R, params: P): S;
  /** $state paths + scalar summary for the COMPOSE prompt (gets S so it can emit COUNTS, never arrays). */
  describe(state: S): StateHint;
  /** ★ partial firewall: the SCALARS re-injected into model context per loop step. NEVER arrays of objects. */
  toModel(state: S): ModelSummary;
}

export type AnyAction = Action<any, any, any>;

/** 生成ループの進捗（server → client、data-stage パートで運ぶ）。01 の per-source → 02 は per-step。 */
export type Stage = {
  phase: "routing" | "fetching" | "composing" | "error";
  label?: string;
  /** multi-step loop の各手（思考連鎖）を順に積む。client が ◌→✓ のステッパに使う。 */
  steps?: Array<{ tool: string; status: "pending" | "done" | "error"; note?: string }>;
};
