import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { getModel } from "@/lib/cockpit/model";
import { actionById } from "@/lib/cockpit/actions";
import { routeQuery } from "@/lib/cockpit/router";
import { buildComposePrompt, type ComposePart } from "@/lib/cockpit/compose";
import { catalog } from "@/lib/render/catalog";
import type { StateHint, Stage } from "@/lib/cockpit/types";

const MAX_ACTIONS = 3;

/**
 * 生成ループ（2段・stream-first）。core-only import（@json-render/react は server で import 不可）。
 *  ストリームを先に開き、各段で進捗（data-stage）を流す → クライアントが「ルート→取得→構成」を表示。
 *  ① routeQuery: 問い → アクション+引数
 *  ② サーバが fetch＆計算 → state（initialState で渡す）
 *  ③ streamText + catalog.prompt() で spec を構成（LLM は $state パスと要約だけ見る）
 */
export const maxDuration = 60;

const COMPOSE_SYSTEM = catalog.prompt({ mode: "inline" });

/** 各 user メッセージのテキスト（古い→新しい）。最後が今回の問い、手前が多ターンの文脈。 */
function userTexts(messages: UIMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user")
    .map((m) =>
      m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text?: string }).text ?? "")
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
}

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const texts = userTexts(messages);
  const query = texts.at(-1) ?? "";
  const history = texts.slice(0, -1).slice(-4); // 直近4問を文脈に
  if (!query) {
    return new Response(JSON.stringify({ error: "query required" }), { status: 400 });
  }

  const model = getModel();
  const today = new Date().toISOString().slice(0, 10);
  // 観測地の座標は client の geolocation から request body 経由で受ける（LLM には通さない＝ファイアウォール）。
  const obs = body.observer;
  const observer =
    obs && typeof obs.lat === "number" && typeof obs.lon === "number" ? { lat: obs.lat, lon: obs.lon } : null;
  const ctx = { signal: req.signal, env: { nasaKey: process.env.NASA_API_KEY ?? "DEMO_KEY" }, observer };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const stage = (s: Stage) => writer.write({ type: "data-stage", data: s });

      // ① route（複数アクション可。多ターンの文脈に history を渡す）
      stage({ phase: "routing" });
      let routed;
      try {
        routed = await routeQuery(model, query, today, req.signal, history);
      } catch (e) {
        stage({ phase: "error", label: `ルーティング失敗: ${String(e)}` });
        return;
      }
      // unique な action id に絞り、上限まで（複合質問でも暴走させない）
      const chosen: Array<{ action: (typeof actionById)[string]; params: Record<string, unknown> }> = [];
      const seen = new Set<string>();
      for (const r of routed.actions ?? []) {
        const a = actionById[r.action];
        if (!a || seen.has(a.id)) continue;
        seen.add(a.id);
        chosen.push({ action: a, params: r.params ?? {} });
        if (chosen.length >= MAX_ACTIONS) break;
      }
      if (!chosen.length) {
        stage({ phase: "error", label: "アクションを決定できませんでした。" });
        return;
      }

      // ② fetch + compute on the server, 並列（生データはここから出さない）
      //    各ソースの settle ごとに fetching stage を逐次 emit → client が per-source の ◌→✓ を出せる
      //    （= 自己組成の「取りに行っている」過程を死に時間に可視化する）。
      const label = chosen.map((c) => c.action.id).join(", ");
      const sources: Array<{ id: string; status: "pending" | "done" | "error" }> = chosen.map(
        (c) => ({ id: c.action.id, status: "pending" }),
      );
      const emitFetching = () =>
        stage({ phase: "fetching", label, sources: sources.map((s) => ({ ...s })) });
      emitFetching();
      const results = await Promise.all(
        chosen.map(async ({ action, params }, i) => {
          try {
            // strip nulls from the merged bag, then let the action's OWN schema validate/apply defaults
            const cleaned = Object.fromEntries(
              Object.entries(params).filter(([, v]) => v != null),
            );
            const p = action.params.parse(cleaned);
            const raw = await action.fetch(p, ctx);
            const slice = action.compute(raw, p);
            sources[i].status = "done";
            emitFetching();
            return { id: action.id, slice, hint: action.describe(slice) };
          } catch (e) {
            sources[i].status = "error";
            emitFetching();
            const hint: StateHint = {
              summary: `${action.id} のデータ取得に失敗しました。`,
              paths: [],
              notes: [`fetch failed: ${String(e)}`],
            };
            return { id: action.id, slice: { error: String(e) }, hint };
          }
        }),
      );

      const state: Record<string, unknown> = Object.fromEntries(results.map((r) => [r.id, r.slice]));
      const composeParts: ComposePart[] = results.map((r) => ({ id: r.id, hint: r.hint }));

      // initialState を spec より先にシードする（クライアントが $state を解決できるように）
      writer.write({ type: "data-initialState", data: state });

      // ③ compose (streaming). LLM は catalog 文法 + hint だけを見る（生データを通さない）。
      stage({ phase: "composing", label });
      const result = streamText({
        model,
        abortSignal: req.signal,
        system: COMPOSE_SYSTEM,
        prompt: buildComposePrompt(query, composeParts),
      });
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
