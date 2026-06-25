import { z } from "zod";
import type { Action, StateHint, ModelSummary, ActionContext } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  lang: z.enum(["en", "ja"]).default("en").describe("Wikipedia language; use 'ja' for places in Japan"),
  radiusM: z.number().int().min(10).max(10000).default(10000).describe("search radius in meters (Wikipedia max 10000)"),
  limit: z.number().int().min(1).max(20).default(8),
});
type Params = z.infer<typeof params>;

interface GeoSearchResp {
  query?: { geosearch?: Array<{ pageid: number; title: string; lat: number; lon: number; dist: number }> };
}
interface SummaryResp {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
  coordinates?: { lat: number; lon: number };
}

export interface Article {
  title: string;
  dist: number; // meters
  description: string | null;
  extract: string | null;
  thumbnail: string | null;
  url: string | null;
}
export interface NearbyState extends Record<string, unknown> {
  articles: Article[];
  count: number;
  nearest: { title: string; dist: number } | null;
  nearestKm: number | null;
  lang: string;
  lat: number;
  lon: number;
}

export const nearby: Action<
  Params,
  { geo: GeoSearchResp; summaries: Record<string, SummaryResp | null> },
  NearbyState
> = {
  id: "nearby",
  when: "Wikipedia articles geotagged near a lat/lon (towns, landmarks around an epicenter). Pass latitude & longitude; lang='ja' for Japan. Empty over open ocean.",
  params,

  async fetch(p, ctx: ActionContext) {
    const base = `https://${p.lang}.wikipedia.org`;
    const headers = { "user-agent": ctx.env.wikiUA };
    const geoUrl =
      `${base}/w/api.php?action=query&list=geosearch&gscoord=${p.latitude}|${p.longitude}` +
      `&gsradius=${p.radiusM}&gslimit=${p.limit}&format=json&origin=*`;
    const geo = await fetchJson<GeoSearchResp>(geoUrl, ctx.signal, { headers });

    // 上位 N 件だけ summary で enrich（per-article 404 は許容して degrade）。
    const top = (geo.query?.geosearch ?? []).slice(0, 5);
    const summaries: Record<string, SummaryResp | null> = {};
    await Promise.all(
      top.map(async (h) => {
        try {
          const sUrl = `${base}/api/rest_v1/page/summary/${encodeURIComponent(h.title)}`;
          summaries[h.title] = await fetchJson<SummaryResp>(sUrl, ctx.signal, { headers });
        } catch {
          summaries[h.title] = null;
        }
      }),
    );
    return { geo, summaries };
  },

  compute(raw, p) {
    const hits = raw.geo.query?.geosearch ?? [];
    const articles: Article[] = hits
      .map((h) => {
        const s = raw.summaries[h.title] ?? null;
        return {
          title: h.title,
          dist: h.dist,
          description: s?.description ?? null,
          extract: s?.extract ?? null,
          thumbnail: s?.thumbnail?.source ?? null,
          url: s?.content_urls?.desktop?.page ?? null,
        };
      })
      .sort((a, b) => a.dist - b.dist);
    const nearest = articles[0] ? { title: articles[0].title, dist: articles[0].dist } : null;
    return {
      articles,
      count: articles.length,
      nearest,
      nearestKm: nearest ? Math.round((nearest.dist / 1000) * 10) / 10 : null,
      lang: p.lang,
      lat: p.latitude,
      lon: p.longitude,
    };
  },

  describe(s): StateHint {
    const notes: string[] = [];
    if (s.count === 0) notes.push("No geotagged articles within 10km — likely offshore/remote. Render a Text empty-state.");
    return {
      summary: s.count
        ? `${s.count} nearby articles (lang=${s.lang}); nearest '${s.nearest?.title}' @ ${s.nearestKm}km.`
        : `No nearby articles (lang=${s.lang}).`,
      paths: [
        { path: "/nearby/articles", type: "array<{title,dist,description,thumbnail,url}>", note: "bind to ArticleGrid.articles（生のまま）" },
        { path: "/nearby/count", type: "number", note: "article count; Kpi" },
      ],
      suggest: ["Heading", "ArticleGrid", "Kpi", "Text"],
      notes,
    };
  },

  toModel(s): ModelSummary {
    return {
      count: s.count,
      nearestTitle: s.nearest?.title ?? null,
      nearestKm: s.nearestKm,
      sample: s.articles.slice(0, 3).map((a) => a.title),
    };
  },
};
