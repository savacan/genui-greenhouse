import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

// startDate/endDate は neows と同じキー名なので merged router params は増えない。
const params = z.object({
  startDate: z.string().describe("YYYY-MM-DD"),
  endDate: z.string().describe("YYYY-MM-DD, 範囲の終端（既定は今日、~7日窓）"),
});
type Params = z.infer<typeof params>;

interface ApodEntry {
  title: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  date: string;
  thumbnail_url?: string;
}

export interface ApodGalleryState extends Record<string, unknown> {
  images: Array<{ src: string; caption: string }>;
  count: number;
  windowLabel: string;
  skipped: number; // 画像が無い（動画でサムネ無し）エントリ数
}

export const apodGallery: Action<Params, ApodEntry[], ApodGalleryState> = {
  id: "apodGallery",
  when: "複数日の NASA APOD を画像ギャラリーで（日付レンジ・「今週の宇宙写真まとめて」等、1日ではなく複数日が欲しいとき）。",
  params,

  async fetch(p, ctx) {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${ctx.env.nasaKey}&thumbs=true&start_date=${p.startDate}&end_date=${p.endDate}`;
    return fetchJson<ApodEntry[]>(url, ctx.signal);
  },

  compute(raw, p) {
    const images: Array<{ src: string; caption: string }> = [];
    let skipped = 0;
    for (const e of raw ?? []) {
      const src = e.media_type === "video" ? e.thumbnail_url || "" : e.url || "";
      if (!src) {
        skipped++;
        continue;
      }
      images.push({ src, caption: e.title });
    }
    images.reverse(); // 最新が先頭
    return {
      images,
      count: images.length,
      windowLabel: `${p.startDate} → ${p.endDate}`,
      skipped,
    };
  },

  describe(s): StateHint {
    const notes: string[] = [];
    if (s.skipped) notes.push(`${s.skipped} 件は画像なし（動画）でギャラリーから除外。`);
    if (s.count === 0) notes.push("画像が無い期間 — Text で空状態を出す。");
    return {
      summary: `APOD gallery ${s.windowLabel}: ${s.count} images.`,
      paths: [
        {
          path: "/apodGallery/images",
          type: "array<{src,caption}>",
          note: "Gallery.images にバインド（最新が先頭・計算済み）",
          sample: `len=${s.count}`,
        },
        { path: "/apodGallery/windowLabel", type: "string", note: "期間ラベル（Heading 向き）" },
      ],
      suggest: ["Heading", "Gallery", "Text", "ActionButton"],
      notes,
      followups: ["今日の宇宙写真は？", "今週ヤバい小惑星ある？", "ISSは今どこ？"],
    };
  },
};
