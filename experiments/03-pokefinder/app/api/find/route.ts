import { findMons, criteriaLabelJa } from "@/lib/finder/actions/findMons";
import type { ActionContext } from "@/lib/finder/types";

/**
 * form 永続 live 再検索（docs §12）専用の計算エンドポイント。
 * 「探す」は LLM を介さず（spec を組み直さず）、現在 shelf でサーバ findMons を回して
 * **値だけ** JSON で返す。クライアントは controlled StateStore の /findMons に書き込み、
 * 同一 spec 内の MonGrid を live 更新する（ボード remount なし＝form 選択も結果も飛ばない）。
 */
// 全候補の種族値を取り切る（ランキング正確化）ぶん広めに。OR の大きい和集合でも余裕を持たせる。
export const maxDuration = 60;

type FindBody = {
  types?: string[];
  typeMode?: "and" | "or";
  genFrom?: number | null;
  genTo?: number | null;
  minStats?: Record<string, number>;
  sortBy?: string;
  includeForms?: boolean;
};

const STAT_OR_TOTAL = new Set(["total", "hp", "attack", "defense", "spAtk", "spDef", "speed"]);

export async function POST(req: Request) {
  const body = (await req.json()) as FindBody;
  const types = (body.types ?? []).filter(Boolean).slice(0, 3);
  if (!types.length) {
    return Response.json({ error: "タイプを1つ以上選んでください。" }, { status: 400 });
  }
  let params: ReturnType<typeof findMons.params.parse>;
  try {
    params = findMons.params.parse({
      types,
      typeMode: body.typeMode === "or" ? "or" : "and",
      genFrom: body.genFrom ?? null,
      genTo: body.genTo ?? null,
      minStats: body.minStats ?? {},
      sortBy: typeof body.sortBy === "string" && STAT_OR_TOTAL.has(body.sortBy) ? body.sortBy : undefined,
      includeForms: body.includeForms === true,
    });
  } catch (e) {
    return Response.json({ error: `パラメータが不正です: ${String(e)}` }, { status: 400 });
  }
  const ctx: ActionContext = {
    signal: req.signal,
    env: { pokeBase: process.env.POKE_API_BASE ?? "https://pokeapi.co/api/v2" },
  };
  try {
    const fetched = await findMons.fetch(params, ctx);
    const state = findMons.compute(fetched, params);
    const criteriaLabel = criteriaLabelJa(state.criteria);
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
