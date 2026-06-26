import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { getModel } from "@/lib/finder/model";
import { catalog } from "@/lib/render/catalog";
import { pokeTypes } from "@/lib/finder/actions/pokeTypes";
import { findMons, criteriaLabelJa } from "@/lib/finder/actions/findMons";
import { buildFormPrompt, buildResultsPrompt, parseSeedMon } from "@/lib/finder/compose";
import type { ActionContext, Stage } from "@/lib/finder/types";

/**
 * exp03 = 単発 compose（01 写経・agentic loop なし）。2モード:
 *   intent="form" : 問い → 語彙(pokeTypes)を添えて LLM が two-way 入力フォーム spec を組む（spec.state に初期選択）。
 *   intent="find" : 現在の shelf → サーバが findMons を計算 → 値を data-initialState に flush → LLM が結果ボードを組む。
 * どちらも spec 経路は hard firewall（LLM は catalog 文法 + パス/件数だけ見る・生 mons は見ない）。
 */
export const maxDuration = 60;

const COMPOSE_SYSTEM = catalog.prompt({ mode: "inline" });

type FindParams = {
  types?: string[];
  typeMode?: "and" | "or";
  genFrom?: number | null;
  genTo?: number | null;
  minStats?: Record<string, number>;
};

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    return m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join(" ")
      .trim();
  }
  return "";
}

export async function POST(req: Request) {
  const body = await req.json();
  const intent: "form" | "find" = body.intent === "find" ? "find" : "form";
  const messages: UIMessage[] = body.messages ?? [];
  const model = getModel();
  const ctx: ActionContext = {
    signal: req.signal,
    env: { pokeBase: process.env.POKE_API_BASE ?? "https://pokeapi.co/api/v2" },
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const stage = (s: Stage) => writer.write({ type: "data-stage", data: s });

      if (intent === "find") {
        // ---- 「探す」: 現在 shelf でサーバ計算 → 結果ボード ----
        const raw = (body.shelf ?? {}) as FindParams;
        const types = (raw.types ?? []).filter(Boolean);
        if (!types.length) {
          stage({ phase: "error", label: "タイプを1つ以上選んでください。" });
          return;
        }
        const params = findMons.params.parse({
          types,
          typeMode: raw.typeMode === "or" ? "or" : "and",
          genFrom: raw.genFrom ?? null,
          genTo: raw.genTo ?? null,
          minStats: raw.minStats ?? {},
        });
        const originalQuery = typeof body.query === "string" ? body.query : "ポケモンを探す";

        stage({ phase: "fetching", label: "条件に合うポケモンを集計中…" });
        let state;
        try {
          const fetched = await findMons.fetch(params, ctx);
          state = findMons.compute(fetched, params);
        } catch (e) {
          stage({ phase: "error", label: `検索に失敗しました: ${String(e)}` });
          return;
        }
        const hint = findMons.describe(state);

        // 生 slice を initialState に flush（spec より先にシード）。
        writer.write({ type: "data-initialState", data: { findMons: state } });

        stage({ phase: "composing", label: hint.summary });
        const criteriaLabel = criteriaLabelJa(state.criteria);
        const result = streamText({
          model,
          abortSignal: req.signal,
          system: COMPOSE_SYSTEM,
          prompt: buildResultsPrompt(criteriaLabel, hint, originalQuery),
        });
        writer.merge(pipeJsonRender(result.toUIMessageStream()));
        return;
      }

      // ---- form: 問い（or 結果カードの指差し）→ 語彙を添えてフォーム spec を組む ----
      // §14: body.seedMon があれば「起点ポケモンに似た相棒」フォームを再 compose（出力ジェスチャ → 入力UI 合成）。
      // 不正な seedMon は parseSeedMon が null に倒す → 通常フォームへフォールバック（無言クラッシュ回避）。
      const seed = parseSeedMon(body.seedMon);
      // UI 経路では onAnchor が常に synthetic text を送るので lastUserText が非空。seed フォールバックは直叩き（messages 空＋seedMon）用。
      const query = lastUserText(messages) || (seed ? `${seed.name}に似た相棒をさがす` : "相棒のポケモンをさがす");
      stage({ phase: "fetching", label: "選択肢の語彙を用意中…" });
      let vocab;
      try {
        const fetched = await pokeTypes.fetch({}, ctx);
        vocab = pokeTypes.compute(fetched, {});
      } catch (e) {
        stage({ phase: "error", label: `語彙の取得に失敗しました: ${String(e)}` });
        return;
      }

      stage({ phase: "composing", label: seed ? `${seed.name} を起点にフォームを再構成中…` : "フォームを構成中…" });
      const result = streamText({
        model,
        abortSignal: req.signal,
        system: COMPOSE_SYSTEM,
        prompt: buildFormPrompt(query, vocab.types, vocab.generations, seed),
      });
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
