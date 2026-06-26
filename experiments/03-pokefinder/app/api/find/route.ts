import { findMons } from "@/lib/finder/actions/findMons";
import type { ActionContext } from "@/lib/finder/types";

/**
 * form 永続 live 再検索（docs §12）専用の計算エンドポイント。
 * 「探す」は LLM を介さず（spec を組み直さず）、現在 shelf でサーバ findMons を回して
 * **値だけ** JSON で返す。クライアントは controlled StateStore の /findMons に書き込み、
 * 同一 spec 内の MonGrid を live 更新する（ボード remount なし＝form 選択も結果も飛ばない）。
 */
export const maxDuration = 30;

type FindBody = { types?: string[]; generationId?: number | null; minStats?: Record<string, number> };

export async function POST(req: Request) {
  const body = (await req.json()) as FindBody;
  const types = (body.types ?? []).filter(Boolean);
  if (!types.length) {
    return Response.json({ error: "タイプを1つ以上選んでください。" }, { status: 400 });
  }
  const params = findMons.params.parse({
    types,
    generationId: body.generationId ?? null,
    minStats: body.minStats ?? {},
  });
  const ctx: ActionContext = {
    signal: req.signal,
    env: { pokeBase: process.env.POKE_API_BASE ?? "https://pokeapi.co/api/v2" },
  };
  try {
    const fetched = await findMons.fetch(params, ctx);
    const state = findMons.compute(fetched, params);
    const c = state.criteria;
    const criteriaLabel =
      c.types.join("∩") +
      (c.generationId ? ` ∩ 第${c.generationId}世代` : "") +
      (Object.keys(c.minStats).length ? ` / 下限 ${JSON.stringify(c.minStats)}` : "");
    // MonGrid / Kpi が読む形（値のみ・spec には算術なし）。
    return Response.json({
      mons: state.mons,
      count: state.count,
      matchedCount: state.matchedCount,
      criteriaLabel,
      note: findMons.describe(state).notes?.join(" / ") ?? "",
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
