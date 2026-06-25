import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  hasToolCall,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { SPEC_DATA_PART_TYPE } from "@json-render/core";
import { getModel } from "@/lib/monitor/model";
import { buildToolSet } from "@/lib/monitor/tools";
import { StateStore } from "@/lib/monitor/state-store";
import { catalog } from "@/lib/render/catalog";
import type { ActionContext, Stage } from "@/lib/monitor/types";

/**
 * ★ 案B = 終端 renderSpec（compose をループに畳む）。案A（generate/route.ts）の対照実験。
 *
 * 案A: loop（scalar firewall）→ consumeStream で破棄 → **別の** streamText が describe() の
 *      $state パス地図だけ見て compose（生データも loop の文脈も見ない＝spec 経路は hard firewall）。
 * 案B: **同じ**ループのモデルが、十分集めたら終端 tool `renderSpec` を呼んで spec 自身を吐く。
 *      compose 器＝gather 器。モデルが spec を組むときに見えるのは
 *      「tool 結果の ref（例 quakeDetail/us6000t7zp）＋ toModelOutput のスカラー＋カタログ文法」だけ。
 *      describe() の per-instance パス地図は無い。生配列は相変わらず文脈外（toModelOutput）。
 *
 * 観察したいこと（§7④「どこまで agentic にできるか」）:
 *  - リッチな配列部品（QuakeList/MagnitudeBars/Beachball/ShakeMap/Sparkline/ArticleGrid）を、
 *    パス地図なし＝カタログ文法のフィールド名＋名前空間規則＋観測 ref だけで正しく $state バインドできるか。
 *  - スカラーを $state でなく直書き（規律破れ）するか／(b) の per-call 名前空間パスを再構成できるか。
 *  - 注意: 生データ機密は toModelOutput が compose アーキに依らず守る（モデルは生配列を一度も見ない）。
 *    案B で崩れうるのは「機密」でなく「spec バインドの正しさ」。ここが案A/案B の差。
 */
export const maxDuration = 60;

const CATALOG_GRAMMAR = catalog.prompt({ mode: "inline" });
const SPEC_SCHEMA = catalog.zodSchema(); // 検証用（tool 入力には使わない＝下記参照）
const MAX_STEPS = 16;

const AGENT_SYSTEM_B = (today: string) =>
  [
    `あなたは地震モニタの調査エージェント。今日は ${today}。ユーザーの問いに、tools で自分で多段に調べてから、最後に画面(spec)を自分で組む。`,
    `使える tools: quakes(一覧・まずこれ。戻り値の topEvents は上位の {id,place,mag,depthKm} リスト) / quakeDetail(eventId で深掘り) / weather(緯度経度で天気) / nearby(緯度経度で近傍記事) / aircraft(任意).`,
    `調査の型:`,
    `- 単一の関心: quakes → 最大(strongestEventId)を quakeDetail → その lat/lon で weather・nearby。`,
    `- 複合・多エンティティ: quakes は1回だけ → topEvents の id を各 quakeDetail → 各 lat/lon で weather・nearby。`,
    `規律: 中間で散文を書かない。同じ tool を同じ引数で二度呼ばない（quakes 撃ち直し・同一 eventId 再ドリル禁止）。quakeDetail の lat/lon を weather/nearby にそのまま渡す。日本周辺は nearby lang="ja"。`,
    ``,
    `十分集まったら、done でも散文でもなく **renderSpec を1回だけ** 呼ぶ。引数 = 画面の spec（下のカタログ文法）。これが画面になる。`,
    ``,
    `★ データのバインド規則（最重要）:`,
    `- spec にデータを **直書きしない**。必ず {"$state":"/path"} でバインドする。`,
    `- 各 tool 結果の **ref**（例: "quakes" / "quakeDetail/us6000t7zp" / "weather/10.44_-68.47"）が $state のルートキー。`,
    `  そのスライスのフィールドは ref の下にある（例: /quakeDetail/us6000t7zp/nodalPlanes、/weather/10.44_-68.47/sparkline、/nearby/<同じ座標キー>/articles）。`,
    `  カタログ各部品の説明にあるパス（例 /quakeDetail/nodalPlanes）は **単一スロットの形**。複数イベントを調べたなら ref を挟んだ形（/quakeDetail/<eventId>/nodalPlanes）に読み替える。`,
    `- 生 float の表示整形だけ $format（Kpi.value 等のスカラーのみ）。配列/url を受ける部品（QuakeList/MagnitudeBars/Beachball/ShakeMapImage/Sparkline/ArticleGrid/WeatherTile）に渡す値は生のまま $state だけ。`,
    `- 複数イベントは Card を Stack で並べて比較できる形にする。問いに直接答える、過不足ない構成。`,
    ``,
    `=== カタログ文法（使える部品とspec構造） ===`,
    CATALOG_GRAMMAR,
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

      // 案A の tool 工場を流用し、done を renderSpec に差し替え（compose をループ内に畳む）。
      const tools = buildToolSet(ctx, store);
      delete (tools as Record<string, unknown>).done;
      let capturedSpec: Record<string, unknown> | null = null;
      // 入力は **緩く**（z.any）受ける。終端 tool に catalog.zodSchema() を渡すと
      // スキーマがモデルの構造作りを肩代わりしてしまい「文法だけで自己組成できるか」を測れない
      // ＝ agentic の純粋テストにならない。文法はプロンプト(CATALOG_GRAMMAR)で渡し、
      // 妥当性は後段で自分で検証する（zodSchema.safeParse + catalog.validate）。
      (tools as Record<string, unknown>).renderSpec = tool({
        description:
          "Call this ONCE when you have gathered enough. Pass { spec: <the complete nested UI spec per the catalog grammar above> }. Bind all data via {\"$state\":\"/path\"} to what you gathered — never inline raw arrays/values. Do NOT call other tools afterward.",
        inputSchema: z.object({ spec: z.any() }),
        async execute(input: unknown) {
          capturedSpec = (input as { spec?: Record<string, unknown> }).spec ?? null;
          return { ok: true };
        },
        toModelOutput: () => ({ type: "json" as const, value: { ok: true } }),
      });

      stage({ phase: "routing", label: "調査計画を立案中（案B: 終端 renderSpec）" });
      let stepNo = 0;
      const loop = streamText({
        model,
        abortSignal: req.signal,
        tools,
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("renderSpec")],
        system: AGENT_SYSTEM_B(today),
        prompt: query,
        onStepFinish: (sr) => {
          stepNo++;
          const calls = sr.toolCalls?.map((c) => c.toolName) ?? [];
          if (process.env.NODE_ENV !== "production") {
            const u = sr.usage;
            console.log(
              `[loopB] step ${stepNo}: tools=[${calls.join(",")}] textLen=${(sr.text ?? "").length}` +
                ` inTok=${u?.inputTokens ?? "?"} outTok=${u?.outputTokens ?? "?"}`,
            );
          }
          const cur = calls.filter((c) => c !== "renderSpec").join(" → ") || (calls.includes("renderSpec") ? "画面を構成" : "thinking");
          stage({ phase: calls.includes("renderSpec") ? "composing" : "fetching", label: cur, steps: store.stepLog() });
        },
      });

      await loop.consumeStream();

      if (process.env.NODE_ENV !== "production") {
        try {
          const steps = await loop.steps;
          const curve = steps.map((s) => s.usage?.inputTokens ?? 0);
          const total = await loop.totalUsage;
          console.log(
            `[loopB-summary] steps=${steps.length} inputTokenCurve=[${curve.join(",")}]` +
              ` totalIn=${total?.inputTokens ?? "?"} totalOut=${total?.outputTokens ?? "?"} tools=${store.stepLog().map((s) => `${s.tool}:${s.status}`).join(",")}`,
          );
        } catch {
          /* observation only */
        }
      }

      if (!capturedSpec) {
        // モデルが renderSpec を呼ばずに打ち切った＝終端畳み込みが回らなかった（観察データ）。
        if (process.env.NODE_ENV !== "production") console.log(`[terminal] NO renderSpec call — model failed to self-compose`);
        stage({ phase: "error", label: "案B: モデルが renderSpec を呼ばずに終了しました（終端畳み込み不成立）。" });
        return;
      }

      // 生 slice を $state にシード → 終端 tool が組んだ nested spec を1発で描画。
      const state = store.snapshot();
      writer.write({ type: "data-initialState", data: state });

      if (process.env.NODE_ENV !== "production") {
        const specStr = JSON.stringify(capturedSpec);
        const stateRefs = (specStr.match(/"\$state"/g) || []).length;
        const statesByNs: Record<string, number> = {};
        for (const m of specStr.matchAll(/"\$state"\s*:\s*"\/([^/"]+)/g)) {
          statesByNs[m[1]] = (statesByNs[m[1]] ?? 0) + 1;
        }
        const zr = SPEC_SCHEMA.safeParse(capturedSpec);
        const vr = catalog.validate(capturedSpec) as { valid?: boolean; issues?: unknown[] };
        console.log(
          `[terminal] renderSpec captured: specBytes=${specStr.length} zodValid=${zr.success} structValid=${vr?.valid}` +
            ` $stateRefs=${stateRefs} byNamespace=${JSON.stringify(statesByNs)}`,
        );
        if (!zr.success) {
          const issues = zr.error.issues.slice(0, 8).map((i) => `${i.path.join("/") || "<root>"}: ${i.message}`);
          console.log(`[terminal] zod issues (first 8 of ${zr.error.issues.length}): ${JSON.stringify(issues)}`);
        }
        if (vr && vr.valid === false) console.log(`[terminal] struct issues: ${JSON.stringify(vr.issues)}`);
      }

      // 不正でも描画させて「何が組めたか」を観察する（sanitize が不正要素を落とす）。
      // モデルは flat 形（{root, elements, state}）を吐くので flat パートで送る（nested で送ると root 解決に失敗して空になる）。
      stage({ phase: "composing", label: "案B: 終端 renderSpec の spec を描画" });
      writer.write({ type: SPEC_DATA_PART_TYPE, data: { type: "flat", spec: capturedSpec } });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
