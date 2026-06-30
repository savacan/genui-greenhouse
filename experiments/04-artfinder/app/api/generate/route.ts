import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { getModel } from "@/lib/finder/model";
import { catalog } from "@/lib/render/catalog";
import { artVocab } from "@/lib/finder/actions/artVocab";
import { buildFormPrompt, parseSeedArt } from "@/lib/finder/compose";
import type { ActionContext, Stage } from "@/lib/finder/types";

/**
 * exp04 = 単発 compose（01/03 写経・agentic loop なし）。フォーム生成のみ:
 *   問い（or 結果カードの指差し seed）→ 語彙(artVocab)を添えて LLM が two-way 入力フォーム spec を組む。
 * 「探す」は §12 で LLM を介さない `/api/find`（計算のみ）に分離済み。
 * spec 経路は hard firewall（LLM は catalog 文法 + パス/件数だけ見る・生 artworks は見ない）。
 */
export const maxDuration = 60;

const COMPOSE_SYSTEM = catalog.prompt({ mode: "inline" });

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
  const messages: UIMessage[] = body.messages ?? [];
  const model = getModel();
  const ctx: ActionContext = {
    signal: req.signal,
    env: {
      artBase: process.env.ART_API_BASE ?? "https://api.artic.edu/api/v1",
      iiifBase: process.env.ART_IIIF_BASE ?? "https://www.artic.edu/iiif/2",
    },
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const stage = (s: Stage) => writer.write({ type: "data-stage", data: s });

      // §14: body.seed があれば「起点作品に似た作品」フォームを再 compose（出力ジェスチャ → 入力UI 合成）。
      const seed = parseSeedArt(body.seed);
      const query = lastUserText(messages) || (seed ? `${seed.artist || seed.title}に似た作品をさがす` : "作品をさがす");

      stage({ phase: "fetching", label: "選択肢の語彙を用意中…" });
      let vocab;
      try {
        const fetched = await artVocab.fetch({}, ctx);
        vocab = artVocab.compute(fetched, {});
      } catch (e) {
        stage({ phase: "error", label: `語彙の取得に失敗しました: ${String(e)}` });
        return;
      }

      stage({ phase: "composing", label: seed ? "起点作品からフォームを再構成中…" : "フォームを構成中…" });
      const result = streamText({
        model,
        abortSignal: req.signal,
        system: COMPOSE_SYSTEM,
        prompt: buildFormPrompt(query, vocab.types, vocab.departments, vocab.hues, vocab.sorts, seed),
      });
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
