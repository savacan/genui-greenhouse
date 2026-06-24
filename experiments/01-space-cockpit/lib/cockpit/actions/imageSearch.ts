import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  query: z.string().describe("宇宙の検索語（例: nebula, supernova, aurora, mars, saturn, 土星）"),
});
type Params = z.infer<typeof params>;

interface NasaImageItem {
  data?: Array<{ title?: string; description?: string }>;
  links?: Array<{ href: string; rel?: string; render?: string }>;
}
interface NasaImageRaw {
  collection?: { items?: NasaImageItem[]; metadata?: { total_hits?: number } };
}

export interface ImageSearchState extends Record<string, unknown> {
  query: string;
  totalHits: number;
  shown: number;
  images: Array<{ src: string; caption: string }>;
}

const MAX = 24;

export const imageSearch: Action<Params, NasaImageRaw, ImageSearchState> = {
  id: "imageSearch",
  when: "宇宙の“言葉”で NASA 画像アーカイブを検索（任意の語: nebula/aurora/black hole/土星 等）→ 画像ギャラリー。問いに応じて中身が変わる探索向き。",
  params,

  async fetch(p, ctx) {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(p.query)}&media_type=image`;
    return fetchJson<NasaImageRaw>(url, ctx.signal);
  },

  compute(raw, p) {
    const items = raw.collection?.items ?? [];
    const images: Array<{ src: string; caption: string }> = [];
    for (const it of items) {
      // renditions は不揃い: preview(=thumb) を優先、無ければ render=image の最初
      const src =
        it.links?.find((l) => l.rel === "preview")?.href ??
        it.links?.find((l) => l.render === "image")?.href ??
        "";
      if (!src) continue;
      const title = (it.data?.[0]?.title ?? "").replace(/\s+/g, " ").trim();
      images.push({ src, caption: title.length > 80 ? title.slice(0, 79) + "…" : title });
      if (images.length >= MAX) break;
    }
    return {
      query: p.query,
      totalHits: raw.collection?.metadata?.total_hits ?? images.length,
      shown: images.length,
      images,
    };
  },

  describe(s): StateHint {
    if (s.shown === 0) {
      return {
        summary: `NASA画像検索 "${s.query}": 0件。`,
        paths: [{ path: "/imageSearch/query", type: "string", note: "検索語" }],
        suggest: ["Heading", "Text", "ActionButton"],
        notes: ["ヒット0。Text で空状態を出し、別の語を試す ActionButton を添える。"],
        followups: ["オーロラの画像を探して", "土星の画像を探して", "今の地球を見せて"],
      };
    }
    return {
      summary: `NASA画像 "${s.query}": ${s.totalHits} 件中 ${s.shown} 枚。`,
      paths: [
        { path: "/imageSearch/images", type: "array<{src,caption}>", note: "Gallery.images にバインド（主役）", sample: `len=${s.shown}` },
        { path: "/imageSearch/query", type: "string", note: "検索語（Heading）" },
        { path: "/imageSearch/totalHits", type: "number", note: `総ヒット数（${s.totalHits}）→ BigStat(unit='件') もよい` },
      ],
      suggest: ["Heading", "Gallery", "BigStat", "Text", "ActionButton"],
      followups: ["オーロラの画像を探して", "ブラックホールの画像を探して", "今の地球を見せて"],
    };
  },
};
