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
    `使える tools: quakes(最近の地震一覧・まずこれ。戻り値の topEvents は上位イベントの {id,place,mag,depthKm} リスト) / quakeDetail(eventId で1件を深掘り=発震機構・ShakeMap・PAGER) / weather(緯度経度で震源の天気) / nearby(緯度経度で近傍の Wikipedia 記事) / aircraft(任意).`,
    `調査の型:`,
    `- 単一の関心（「最大の地震は」等）: quakes → 最大イベント(strongestEventId)を quakeDetail → その lat/lon で weather・nearby。`,
    `- 複合・多エンティティ（「トップ3を比較」「複数の地震をそれぞれ」等）: quakes は1回だけ呼ぶ → 戻り値の topEvents から対象 N 件の id を選ぶ → 各 id を quakeDetail で深掘り → 必要なら各震源の lat/lon で weather・nearby を呼ぶ。`,
    `重要な規律:`,
    `- tool の戻り値はスカラー要約（件数・最大値・eventId・lat/lon・topEvents の id リストなど）。次に何を呼ぶかの判断材料に使う。`,
    `- 既に得た結果は文脈にある。同じ tool を同じ引数で二度呼ばない（特に quakes の撃ち直し・同一 eventId の再ドリルは禁止）。複数イベントを調べるときは topEvents の id を順に quakeDetail するだけでよい。`,
    `- quakeDetail の戻り値の lat/lon を weather/nearby の引数にそのまま渡す（緯度経度を自分で発明しない）。`,
    `- 震源が日本周辺なら nearby は lang="ja"。`,
    `- 中間ステップで散文を書かない（tool 呼び出しだけ）。`,
    `- フォローアップの問い（「その中で」「さっきの」「それ」「もっと詳しく」等）は、会話の流れで何を指すか解釈する。**下に「前ターンで判明した震源（eventId/lat/lon）」があれば、その lat/lon をそのまま weather/nearby に渡してよい＝同じ震源について quakes/quakeDetail を撃ち直さない**（再取得税の回避）。新しい/別の震源が要るときだけ quakes から取り直す。盤面（spec/$state）は毎ターン新規に組み直す。`,
    `- 十分に集まったら done を呼んで終わる。最大 ${MAX_STEPS} 手。`,
  ].join("\n");

/**
 * 多ターン: ユーザーの問いの流れを prompt に載せる（参照的フォローアップの解釈用）。
 * data はサーバ側で毎ターン取り直すので、履歴に載せるのは**ユーザーのテキストだけ**＝
 * ターンをまたいで生データもスカラー要約も文脈に積まない（firewall をターン境界でも維持）。
 */
function buildTurnPrompt(allUserTexts: string[]): string {
  const current = allUserTexts.at(-1) ?? "";
  const prior = allUserTexts.slice(0, -1);
  if (!prior.length) return current;
  return [
    `これまでの会話（ユーザーの問いの流れ）:`,
    ...prior.map((q, i) => `  ${i + 1}. ${q}`),
    ``,
    `今の問い: ${current}`,
    `※ 「その中で」「さっき」「それ」等は上の流れを指す。文脈を踏まえて解釈すること。`,
  ].join("\n");
}

type PriorEvent = { eventId: string; place: string; mag: number; lat: number; lon: number };

/**
 * §11(#2) 再フェッチ税の回避: 直近 assistant の data-initialState（クライアントが履歴で送り返す）から
 * **スカラーだけ**（eventId/place/mag/lat/lon）を抜き、次ターンに「再取得不要な既知震源」として渡す。
 * 生配列（nodalPlanes/articles/hourly/quakes[]）は**載せない**＝ターン越境でも firewall を維持。
 * これで参照的フォローアップ（「その震源の周りは？」）が quakes/quakeDetail の撃ち直しを省ける。
 */
function priorEntities(messages: UIMessage[]): PriorEvent[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const part = m.parts.find((p) => (p as { type?: string }).type === "data-initialState") as
      | { data?: Record<string, unknown> }
      | undefined;
    const qd = part?.data?.quakeDetail as Record<string, Record<string, unknown>> | undefined;
    if (!qd) return [];
    const out: PriorEvent[] = [];
    for (const e of Object.values(qd)) {
      if (e && typeof e.eventId === "string" && typeof e.lat === "number" && typeof e.lon === "number") {
        out.push({ eventId: e.eventId, place: String(e.place ?? ""), mag: Number(e.mag ?? 0), lat: e.lat as number, lon: e.lon as number });
      }
    }
    return out; // 直近 assistant のみ見る（さらに前は遡らない）
  }
  return [];
}

function priorEntitiesBlock(prior: PriorEvent[]): string {
  if (!prior.length) return "";
  return [
    ``,
    `前ターンで判明した震源（再取得不要・lat/lon をそのまま weather/nearby に使える）:`,
    ...prior.map((e) => `  - eventId=${e.eventId} M${e.mag} ${e.place} (lat=${e.lat}, lon=${e.lon})`),
  ].join("\n");
}

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
  const allUserTexts = userTexts(messages);
  const query = allUserTexts.at(-1) ?? "";
  if (!query) return new Response(JSON.stringify({ error: "query required" }), { status: 400 });
  // 多ターン: 問いの流れ＋前ターンの既知震源スカラー（再取得税の回避・生データは載せない）
  const promptText = buildTurnPrompt(allUserTexts) + priorEntitiesBlock(priorEntities(messages));

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
        prompt: promptText,
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
