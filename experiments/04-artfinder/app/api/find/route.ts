import { findArt, criteriaLabelJa } from "@/lib/finder/actions/findArt";
import { hasAnyFilter, type ArtFindParams } from "@/lib/finder/shelf";
import type { ActionContext } from "@/lib/finder/types";

/**
 * form 永続 live 再検索（docs §12）専用の計算エンドポイント。
 * 「探す」は LLM を介さず（spec を組み直さず）、現在 shelf から作った params を受けて findArt（form→ES 翻訳）を回し
 * **値だけ** JSON で返す。クライアントは controlled StateStore の /findArt に書き込み、同一 spec 内の ArtGrid を live 更新する。
 */
export const maxDuration = 60;

type FindBody = Partial<ArtFindParams>;

export async function POST(req: Request) {
  const body = (await req.json()) as FindBody;

  // 検索に意味のある条件が1つもないなら 400（「条件ゼロでも探せます」の嘘を防ぐ・§16）。
  const probe: ArtFindParams = {
    types: body.types ?? [],
    departments: body.departments ?? [],
    yearFrom: body.yearFrom ?? null,
    yearTo: body.yearTo ?? null,
    hue: body.hue ?? null,
    onView: body.onView === true,
    publicDomain: body.publicDomain === true,
    q: typeof body.q === "string" && body.q.trim() ? body.q.trim() : null,
    sortBy: body.sortBy === "newest" || body.sortBy === "oldest" ? body.sortBy : "relevance",
  };
  if (!hasAnyFilter(probe)) {
    return Response.json(
      { error: "種別・部門・年代・色・検索語のいずれかを1つ以上指定してください。" },
      { status: 400 },
    );
  }

  let params: ReturnType<typeof findArt.params.parse>;
  try {
    params = findArt.params.parse({
      types: probe.types,
      departments: probe.departments,
      yearFrom: probe.yearFrom,
      yearTo: probe.yearTo,
      hue: probe.hue,
      onView: probe.onView,
      publicDomain: probe.publicDomain,
      q: probe.q,
      sortBy: probe.sortBy,
    });
  } catch (e) {
    return Response.json({ error: `パラメータが不正です: ${String(e)}` }, { status: 400 });
  }

  const ctx: ActionContext = {
    signal: req.signal,
    env: {
      artBase: process.env.ART_API_BASE ?? "https://api.artic.edu/api/v1",
      iiifBase: process.env.ART_IIIF_BASE ?? "https://www.artic.edu/iiif/2",
    },
  };

  try {
    const fetched = await findArt.fetch(params, ctx);
    const state = findArt.compute(fetched, params);
    const criteriaLabel = criteriaLabelJa(state.criteria);
    return Response.json({
      artworks: state.artworks,
      count: state.count,
      matchedCount: state.matchedCount,
      criteriaLabel,
      note: findArt.describe(state).notes?.join(" / ") ?? "",
    });
  } catch (e) {
    console.error("/api/find failed:", e); // 内部 URL/スタックはサーバログのみ
    return Response.json({ error: "検索に失敗しました。条件を変えて再試行してください。" }, { status: 500 });
  }
}
