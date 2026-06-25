import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { ACTIONS } from "./actions";
import type { ActionContext, AnyAction } from "./types";
import type { StateStore } from "./state-store";

/**
 * Action → AI SDK tool() の変換工場。multi-step loop で使う ToolSet を組む。
 *
 * ★ この実験の核 = 部分ファイアウォール seam:
 *   - execute は a.fetch → a.compute → a.describe を回し、生 slice を store に退避し、
 *     フル戻り値 { ref, model, slice, hint } を返す（SDK の steps には残る）。
 *   - toModelOutput が **モデル文脈に再投入されるバイトを { ref, ...a.toModel(slice) } のスカラーだけに絞る**。
 *     これを書かないと execute 全戻り（slice の生配列込み）が JSON 化されてモデルに戻る = firewall 漏れ。
 *   生 slice は store.snapshot() 経由で initialState（$state）にだけ載り、LLM には載らない。
 */
export function buildToolSet(ctx: ActionContext, store: StateStore): ToolSet {
  const set: ToolSet = {};

  for (const a of ACTIONS as readonly AnyAction[]) {
    set[a.id] = tool({
      description: a.when,
      inputSchema: a.params,
      async execute(input: unknown) {
        const p = a.params.parse(input);
        store.markStep(a.id, "pending");
        try {
          const raw = await a.fetch(p, ctx);
          const slice = a.compute(raw, p);
          const hint = a.describe(slice);
          const ref = store.put(a.id, slice, hint);
          store.markStep(a.id, "done", hint.summary);
          const model = a.toModel(slice);
          // 部分ファイアウォールの measure: モデルに戻すバイト vs $state に退避する生バイト。
          // keptOut% が高いほど「生データを文脈から締め出せている」。
          if (process.env.NODE_ENV !== "production") {
            const mB = JSON.stringify(model).length;
            const sB = JSON.stringify(slice).length;
            console.log(`[firewall] ${a.id}: model=${mB}B slice=${sB}B keptOut=${Math.round((1 - mB / Math.max(1, sB)) * 100)}%`);
          }
          return { ref, model, slice, hint };
        } catch (e) {
          // soft-degrade: throw せず error を slice/hint に。モデルは error を見て次手を決める
          // （1ツール失敗で loop 全体を落とさない・compose は error カードを描ける）。
          store.markStep(a.id, "error", String(e));
          const msg = String(e);
          const errHint = { summary: `${a.id} のデータ取得に失敗しました。`, paths: [], notes: [`fetch failed: ${msg}`] };
          const ref = store.put(a.id, { error: msg }, errHint);
          return { ref, model: { error: msg }, slice: { error: msg }, hint: errHint };
        }
      },
      // ★ firewall: モデルに戻すのはスカラー要約だけ（生 slice は絶対に入れない）。
      toModelOutput: ({ output }: { output: { ref: string; model: Record<string, unknown> } }) => ({
        type: "json" as const,
        value: { ref: output.ref, ...output.model },
      }),
    });
  }

  // 終端シグナル。モデルが「十分」と判断したら呼ぶ → stopWhen: hasToolCall("done") で停止。
  set.done = tool({
    description:
      "Call this once you have gathered enough to render the dashboard for the user's question. Do NOT call other tools afterward.",
    inputSchema: z.object({ reason: z.string().describe("one line: what you gathered") }),
    async execute({ reason }: { reason: string }) {
      return { ok: true, reason };
    },
    toModelOutput: () => ({ type: "json" as const, value: { ok: true } }),
  });

  return set;
}
