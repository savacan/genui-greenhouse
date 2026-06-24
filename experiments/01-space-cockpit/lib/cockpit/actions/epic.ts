import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

// date は apod と同じキー名なので merged router params は増えない。
const params = z.object({
  date: z
    .string()
    .nullish()
    .describe("具体的な過去日(YYYY-MM-DD)のときだけ入れる。『今/最新/今の地球』は空にする（EPIC は2〜4日遅れで今日は空になる）"),
});
type Params = z.infer<typeof params>;

interface EpicItem {
  image: string;
  date: string; // "YYYY-MM-DD HH:MM:SS"（ISO-T ではない）
  caption: string;
  centroid_coordinates: { lat: number; lon: number };
}

export interface EpicState extends Record<string, unknown> {
  date: string;
  count: number;
  heroSrc: string | null;
  heroCaption: string;
  thumbs: Array<{ src: string; caption: string }>;
  available: boolean;
}

/** "epic_1b_20260620004555" + date → アーカイブ URL（PNG=高精細ヒーロー / JPG=軽量サムネ）。 */
function imgUrl(item: EpicItem, kind: "png" | "jpg"): string {
  const [y, m, d] = item.date.split(" ")[0].split("-");
  return `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/${kind}/${item.image}.${kind}`;
}

export const epic: Action<Params, EpicItem[], EpicState> = {
  id: "epic",
  when: "地球を宇宙から丸ごと見る — DSCOVR/EPIC が L1 から撮った“全球の地球写真”。今の地球／その日の地球。1日分は自転のタイムラプスにもなる。",
  params,

  async fetch(p, ctx) {
    const base = "https://epic.gsfc.nasa.gov/api/natural";
    if (p.date) {
      const dated = await fetchJson<EpicItem[]>(`${base}/date/${p.date}`, ctx.signal);
      if (dated.length) return dated;
      // 指定日に画像なし（2〜4日遅れ/未来日/ルーターが今日を埋めた等）→ 最新にフォールバック
    }
    return fetchJson<EpicItem[]>(base, ctx.signal);
  },

  compute(raw) {
    const items = raw ?? [];
    if (!items.length) {
      return { date: "", count: 0, heroSrc: null, heroCaption: "この日の地球画像はまだありません。", thumbs: [], available: false };
    }
    const date = items[0].date.split(" ")[0];
    const hero = items[items.length - 1]; // その日の最新フレーム
    // 1日分を最大12枚で間引き（自転タイムラプス・state を小さく保つ）
    const step = Math.max(1, Math.ceil(items.length / 12));
    const thumbs = items
      .filter((_, i) => i % step === 0)
      .map((it) => ({ src: imgUrl(it, "jpg"), caption: `${it.date.split(" ")[1].slice(0, 5)} UTC` }));
    return {
      date,
      count: items.length,
      heroSrc: imgUrl(hero, "png"),
      heroCaption: `地球の全面 · ${date}（DSCOVR/EPIC, L1 から）`,
      thumbs,
      available: true,
    };
  },

  describe(s): StateHint {
    if (!s.available) {
      return {
        summary: "EPIC: 指定日の地球画像が見つかりません（EPIC は2〜4日遅れ）。",
        paths: [],
        suggest: ["Text", "Heading", "ActionButton"],
        notes: ["この日の全球画像は無い。Text で空状態を出し、最新を見る ActionButton（query='今の地球を見せて'）を添える。"],
        followups: ["今の地球を見せて", "今日の宇宙写真は？", "ISSは今どこ？"],
      };
    }
    return {
      summary: `EPIC 全球地球 ${s.date}: ${s.count} フレーム。`,
      paths: [
        { path: "/epic/heroSrc", type: "string", note: "全球の地球（高精細）→ HeroImage.src（主役）" },
        { path: "/epic/heroCaption", type: "string", note: "HeroImage.caption か credit" },
        { path: "/epic/date", type: "string", note: "撮影日（Heading / HeroImage.title）" },
        { path: "/epic/thumbs", type: "array<{src,caption}>", note: "その日の自転タイムラプス → Gallery.images", sample: `len=${s.thumbs.length}` },
        { path: "/epic/count", type: "number", note: `その日の撮影枚数（${s.count}）→ BigStat(unit='枚') もよい` },
      ],
      suggest: ["HeroImage", "Gallery", "BigStat", "Heading", "Text", "ActionButton"],
      notes: ["主役は HeroImage（全球の地球）。thumbs は1日の自転タイムラプスとして Gallery に。APOD（天体写真）とは別物＝こちらは“地球そのもの”。"],
      followups: ["今週の宇宙写真をまとめて", "ISSは今どこ？", "今週ヤバい小惑星ある？"],
    };
  },
};
