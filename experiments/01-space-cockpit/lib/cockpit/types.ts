import type { z } from "zod";

/** I/O context handed to an action's fetch. */
export interface ActionContext {
  signal: AbortSignal;
  env: { nasaKey: string };
  /** 観測地の座標（client の geolocation → request body → ここ）。LLM には渡らず、サーバ計算の入力にだけ使う。 */
  observer?: { lat: number; lon: number } | null;
}

/** Hard data failure (vs. soft-degrade which returns a partial state). */
export class ActionDataError extends Error {}

/**
 * Paths + meaning + counts handed to the COMPOSE LLM.
 * NEVER raw data / arrays — this is the data→prompt firewall.
 */
export interface StateHint {
  /** scalar-only one-liner the LLM may read, e.g. "12 asteroids, 3 hazardous" */
  summary: string;
  paths: Array<{
    path: string; // json-pointer, e.g. "/neows/rows" -> {"$state":"/neows/rows"}
    type: string; // shape only, e.g. "array<{name,diameterM,...}>"
    note: string; // meaning + units + which component it fits
    sample?: string; // SCALARS ONLY: "len=12, closest='(2024 AB)' @ 3.1 LD"
  }>;
  /** soft nudge toward catalog components that fit this data */
  suggest?: string[];
  /** surfaced to the LLM verbatim, e.g. "crew unavailable" / "no objects in window" */
  notes?: string[];
  /** ActionButton 用の「次に投げ直せる問い」候補（再取得 / 関連質問）。ルーターが解せる自然文。 */
  followups?: string[];
}

/**
 * One self-contained capability. Co-locates the 5 things that change together.
 *  P = validated params (router arm), R = raw payload, S = computed state slice.
 */
export interface Action<
  P = unknown,
  R = unknown,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  /** stable id = router discriminator = initialState namespace key */
  readonly id: string;
  /** one line the ROUTER reads to pick this action */
  readonly when: string;
  /** Zod params; becomes one arm of the derived router union. z.object({}) if none. */
  readonly params: z.ZodType<P>;
  /** I/O only. throws ActionDataError on hard failure; returns partial on soft failure. */
  fetch(params: P, ctx: ActionContext): Promise<R>;
  /** PURE. ALL math here: parseFloat, midpoints, ranking, KPI values. No I/O. */
  compute(raw: R, params: P): S;
  /** paths + summary + notes for the compose prompt. gets S so it can emit COUNTS, never arrays. */
  describe(state: S): StateHint;
}

export type AnyAction = Action<any, any, any>;

/** 生成ループの進捗（server → client、data-stage パートで運ぶ）。 */
export type Stage = {
  phase: "routing" | "fetching" | "composing" | "error";
  label?: string;
  /** fetching 段の各アクション取得状況（per-source）。client が ◌→✓ のシネマ演出に使う。 */
  sources?: Array<{ id: string; status: "pending" | "done" | "error" }>;
};
