import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  hasToolCall,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { getModel } from "@/lib/monitor/model";
import { buildToolSet } from "@/lib/monitor/tools";
import { StateStore } from "@/lib/monitor/state-store";
import { buildComposePrompt } from "@/lib/monitor/compose";
import { catalog } from "@/lib/render/catalog";
import type { ActionContext, Stage } from "@/lib/monitor/types";

/**
 * ★ 02 の核 = multi-step agentic loop（案A: loop → 別 compose）。
 * 01 の単発 router（tool 結果をモデルに戻さない=ハードファイアウォール）と違い、
 * モデル自身が tools を選んで何手も回す。各 tool 結果は toModelOutput でスカラー要約だけ
 * モデル文脈に再投入される（=部分ファイアウォール）。生 slice は store→$state のみ。
 * loop 収束後、集めた hint だけで別 streamText が spec を構成（spec 経路は 01 と同型の hard firewall）。
 */
export const maxDuration = 60;

const COMPOSE_SYSTEM = catalog.prompt({ mode: "inline" });
const MAX_STEPS = 14; // 複合・多イベントの深い chain も踏めるように（境界観察用）。上限に達したら部分結果で compose。

const AGENT_SYSTEM = (today: string) =>
  [
    `あなたは地震モニタの調査エージェント。今日は ${today}。ユーザーの問いに答えるため、tools を使って自分で多段に調べる。`,
    `使える tools: quakes(最近の地震一覧・まずこれ) / quakeDetail(eventId で1件を深掘り=発震機構・ShakeMap・PAGER) / weather(緯度経度で震源の天気) / nearby(緯度経度で近傍の Wikipedia 記事) / aircraft(任意).`,
    `調査の型: まず quakes で一覧を見る → 関心の中心（多くは最大イベント = strongestEventId）を quakeDetail で深掘り → その戻り値の lat/lon を使って weather や nearby を呼ぶ。問いに不要な手は省く。`,
    `重要な規律:`,
    `- tool の戻り値はスカラー要約だけ（件数・最大値・eventId・lat/lon など）。次に何を呼ぶかの判断材料に使う。`,
    `- quakeDetail の戻り値の lat/lon を weather/nearby の引数にそのまま渡す（緯度経度を自分で発明しない）。`,
    `- 震源が日本周辺なら nearby は lang="ja"。`,
    `- 中間ステップで散文を書かない（tool 呼び出しだけ）。`,
    `- 十分に集まったら done を呼んで終わる。最大 ${MAX_STEPS} 手。`,
  ].join("\n");

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
  const query = userTexts(messages).at(-1) ?? "";
  if (!query) return new Response(JSON.stringify({ error: "query required" }), { status: 400 });

  const model = getModel();
  const today = new Date().toISOString().slice(0, 10);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const stage = (s: Stage) => writer.write({ type: "data-stage", data: s });

      const store = new StateStore();
      const ctx: ActionContext = {
        signal: req.signal,
        env: { wikiUA: process.env.WIKI_USER_AGENT ?? "aftershock/0.1 (genui-greenhouse experiment)" },
      };
      const tools = buildToolSet(ctx, store);

      // ① AGENTIC LOOP: モデルが tools を選んで多段に調べる。tool 結果は toModelOutput でスカラーだけ戻る。
      stage({ phase: "routing", label: "調査計画を立案中" });
      let stepNo = 0;
      const loop = streamText({
        model,
        abortSignal: req.signal,
        tools,
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("done")],
        system: AGENT_SYSTEM(today),
        prompt: query,
        onStepFinish: (sr) => {
          stepNo++;
          const calls = sr.toolCalls?.map((c) => c.toolName) ?? [];
          // 観察ログ（部分ファイアウォールの measure）: 手選択・中間散文(非空なら規律破れ)・
          // この手でモデルが受けた入力トークン(=文脈の肥大カーブ)。
          if (process.env.NODE_ENV !== "production") {
            const u = sr.usage;
            console.log(
              `[loop] step ${stepNo}: tools=[${calls.join(",")}] textLen=${(sr.text ?? "").length}` +
                ` inTok=${u?.inputTokens ?? "?"} outTok=${u?.outputTokens ?? "?"}`,
            );
          }
          const cur = calls.filter((c) => c !== "done").join(" → ") || "thinking";
          stage({ phase: "fetching", label: cur, steps: store.stepLog() });
        },
      });

      // 案A: loop のテキスト/ツールイベントは client に流さない（中間散文漏れを構造で防ぐ）。
      await loop.consumeStream();

      // 観察サマリ: 文脈の肥大カーブ（各手の入力トークン）＝「濃すぎ」境界の一次データ。
      if (process.env.NODE_ENV !== "production") {
        try {
          const steps = await loop.steps;
          const curve = steps.map((s) => s.usage?.inputTokens ?? 0);
          const total = await loop.totalUsage;
          console.log(
            `[loop-summary] steps=${steps.length} inputTokenCurve=[${curve.join(",")}]` +
              ` totalIn=${total?.inputTokens ?? "?"} totalOut=${total?.outputTokens ?? "?"} tools=${store.stepLog().map((s) => `${s.tool}:${s.status}`).join(",")}`,
          );
        } catch {
          /* observation only */
        }
      }

      // ② 生 slice を initialState に flush（spec より先にシード）。
      const state = store.snapshot();
      writer.write({ type: "data-initialState", data: state });

      const parts = store.composeParts();
      if (!parts.length) {
        stage({ phase: "error", label: "調査結果が得られませんでした。問いを変えて試してください。" });
        return;
      }

      // ③ COMPOSE: 01 同型。LLM は catalog 文法 + 各 tool が残した hint だけ見る（生配列ゼロ）。
      stage({ phase: "composing", label: parts.map((p) => p.id).join(", ") });
      const result = streamText({
        model,
        abortSignal: req.signal,
        system: COMPOSE_SYSTEM,
        prompt: buildComposePrompt(query, parts),
      });
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
