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

/** モデルに戻してよいスカラー葉。 */
export type ModelScalar = string | number | boolean | null;
/** flat な scalar-record = addressable list の1要素（例: 1地震の {id,place,mag}）。葉は必ずスカラー。 */
export type ModelRow = Record<string, ModelScalar>;
/**
 * モデルに戻してよい形。スカラー / スカラー配列 / **flat scalar-record の bounded list**（addressable list）。
 * §8 境界の修正で ② を採用＝「#2/#3 を名指せる短いリスト」を明示的に許して線を1段広げた。
 * 生のネスト配列・blob・オブジェクトの入れ子は依然 NG（＝ファイアウォール）。
 */
export type ModelSummary = Record<string, ModelScalar | ModelScalar[] | ModelRow[]>;

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
  /**
   * ★ partial firewall: per-step にモデル文脈へ戻すスカラー要約。生配列は NG だが、
   * addressable な短い scalar-record list（ModelRow[]）は明示的に許す（§8 境界を意図して1段広げた）。
   */
  toModel(state: S): ModelSummary;
  /**
   * $state 内でこの呼び出しを一意に分ける instance key（省略 = tool-id 単一スロット＝後勝ち畳み）。
   * params から導く（pending/error 時も使えるよう state でなく params を見る）。
   * 例: quakeDetail=eventId / weather・nearby=丸めた緯度経度。これで同一 tool の複数ドリルが
   * 別スロット（/id/<key>/...）に並存する＝per-tool-call 名前空間（§8 (b)）。
   */
  instanceKey?(params: P): string | undefined;
}

export type AnyAction = Action<any, any, any>;

/** 生成ループの進捗（server → client、data-stage パートで運ぶ）。01 の per-source → 02 は per-step。 */
export type Stage = {
  phase: "routing" | "fetching" | "composing" | "error";
  label?: string;
  /** multi-step loop の各手（思考連鎖）を順に積む。client が ◌→✓ のステッパに使う。 */
  steps?: Array<{ tool: string; status: "pending" | "done" | "error"; note?: string }>;
};
