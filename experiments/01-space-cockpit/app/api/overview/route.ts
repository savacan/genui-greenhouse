import { iss } from "@/lib/cockpit/actions/iss";
import { astros } from "@/lib/cockpit/actions/astros";
import { launches } from "@/lib/cockpit/actions/launches";
import { apod } from "@/lib/cockpit/actions/apod";
import type { ActionContext } from "@/lib/cockpit/types";

/**
 * 着地ボード「今、宇宙では」用のライブスナップショット。LLM は通さない（即・確実に出すため）。
 * 生成UIの本体は問いを投げた後（/api/generate）。ここは hero／onboarding なので決定的レイアウト×ライブ値。
 * 各アクションは独立 try/catch で degrade（1つ落ちても他のタイルは出す）。
 */
export const maxDuration = 30;

async function run<S>(
  action: { fetch(p: never, ctx: ActionContext): Promise<unknown>; compute(raw: never, p: never): S },
  params: unknown,
  ctx: ActionContext,
): Promise<S | null> {
  try {
    const raw = await action.fetch(params as never, ctx);
    return action.compute(raw as never, params as never);
  } catch {
    return null; // タイルを出さないだけ。ボード全体は生かす。
  }
}

export async function GET(req: Request) {
  const ctx: ActionContext = {
    signal: req.signal,
    env: { nasaKey: process.env.NASA_API_KEY ?? "DEMO_KEY" },
  };

  const [issS, astrosS, launchesS, apodS] = await Promise.all([
    run(iss, {}, ctx),
    run(astros, {}, ctx),
    run(launches, {}, ctx),
    run(apod, { date: null }, ctx),
  ]);

  return Response.json(
    { iss: issS, astros: astrosS, launches: launchesS, apod: apodS },
    { headers: { "cache-control": "no-store" } },
  );
}
