import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  date: z.string().nullish().describe("YYYY-MM-DD, or omit/null for today"),
});
type Params = z.infer<typeof params>;

interface ApodRaw {
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  copyright?: string;
  date: string;
  thumbnail_url?: string;
}

export interface ApodState extends Record<string, unknown> {
  title: string;
  explanation: string;
  date: string;
  isVideo: boolean;
  imageUrl: string | null; // full-res for image; thumbnail (maybe null) for video
  videoUrl: string | null;
  credit: string;
}

export const apod: Action<Params, ApodRaw, ApodState> = {
  id: "apod",
  when: "NASA Astronomy Picture of the Day — a single day's space image (or video) with a written explanation.",
  params,

  async fetch(p, ctx) {
    const date = p.date ? `&date=${p.date}` : "";
    const url = `https://api.nasa.gov/planetary/apod?api_key=${ctx.env.nasaKey}&thumbs=true${date}`;
    return fetchJson<ApodRaw>(url, ctx.signal);
  },

  compute(raw) {
    const isVideo = raw.media_type === "video";
    return {
      title: raw.title,
      explanation: raw.explanation,
      date: raw.date,
      isVideo,
      imageUrl: isVideo ? (raw.thumbnail_url || null) : (raw.hdurl || raw.url),
      videoUrl: isVideo ? raw.url : null,
      credit: raw.copyright ? raw.copyright.trim() : "Public domain (NASA)",
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      { path: "/apod/title", type: "string", note: "image title; bind to Heading or HeroImage.title" },
      { path: "/apod/explanation", type: "string", note: "long description; bind to Text" },
      { path: "/apod/credit", type: "string", note: "attribution; HeroImage.credit or Text muted" },
      { path: "/apod/date", type: "string", note: "date of the picture" },
    ];
    const notes: string[] = [];
    if (s.isVideo) {
      paths.push({ path: "/apod/videoUrl", type: "string", note: "video URL (YouTube/Vimeo)" });
      paths.push({ path: "/apod/imageUrl", type: "string|null", note: "video thumbnail still (may be null)" });
      notes.push(
        "Today's APOD is a VIDEO: do NOT bind HeroImage.src to a video. Render the thumbnail (if present) plus a Text link to videoUrl.",
      );
    } else {
      paths.push({ path: "/apod/imageUrl", type: "string", note: "full-res image; bind to HeroImage.src" });
    }
    return {
      summary: `APOD ${s.date}: "${s.title}"${s.isVideo ? " (video)" : ""}.`,
      paths,
      suggest: ["HeroImage", "Heading", "Text", "ActionButton"],
      notes,
      followups: ["昨日の宇宙写真は？", "今週ヤバい小惑星ある？", "ISSは今どこ？"],
    };
  },
};
