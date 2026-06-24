import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

interface LaunchRaw {
  count: number;
  results: Array<{
    name: string;
    net: string; // ISO T-0
    lsp_name: string;
    status: { abbrev: string };
    net_precision: { abbrev: string } | null;
    pad: string;
    location: string;
    mission: string | null;
  }>;
}

export interface LaunchesState extends Record<string, unknown> {
  next: { name: string; provider: string; net: string; location: string; status: string; precision: string } | null;
  upcoming: Array<{ name: string; provider: string; net: string; location: string; status: string }>;
  totalUpcoming: number;
}

// LL2 free tier は ~15 req/hr。サーバ側でキャッシュし、429/失敗時は stale を返す（クライアントは絶対に直叩きしない）。
const TTL = 10 * 60 * 1000;
let cache: { at: number; data: LaunchRaw } | null = null;

export const launches: Action<Params, LaunchRaw, LaunchesState> = {
  id: "launches",
  when: "次のロケット打ち上げ／今後の打ち上げ予定（ライブ T-カウントダウン＋タイムライン）。",
  params,

  async fetch(_p, ctx) {
    const now = Date.now();
    if (cache && now - cache.at < TTL) return cache.data;
    try {
      const data = await fetchJson<LaunchRaw>(
        "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list",
        ctx.signal,
      );
      cache = { at: now, data };
      return data;
    } catch (e) {
      if (cache) return cache.data; // stale-on-error（レート制限/ダウン時も画面は出す）
      throw e;
    }
  },

  compute(raw) {
    const now = Date.now();
    const all = raw.results ?? [];
    // net が未来のものだけ（データ遅れで過去の "upcoming" が混じることがある → カウントダウンが下がるように）
    const future = all.filter((r) => new Date(r.net).getTime() > now);
    const list = future.length ? future : all;
    const rows = list.map((r) => ({
      name: r.name,
      provider: r.lsp_name,
      net: r.net,
      location: r.location,
      status: r.status?.abbrev ?? "TBD",
    }));
    const first = list[0];
    return {
      next: first
        ? {
            name: first.name,
            provider: first.lsp_name,
            net: first.net,
            location: first.location,
            status: first.status?.abbrev ?? "TBD",
            precision: first.net_precision?.abbrev ?? "Hour",
          }
        : null,
      upcoming: rows,
      totalUpcoming: raw.count ?? rows.length,
    };
  },

  describe(s): StateHint {
    if (!s.next) {
      return {
        summary: "今後の打ち上げ予定が取得できませんでした。",
        paths: [],
        suggest: ["Text", "Heading", "ActionButton"],
        notes: ["Text で空状態を出す。"],
        followups: ["ISSは今どこ？", "今の地球を見せて"],
      };
    }
    return {
      summary: `次の打ち上げ: ${s.next.provider} ${s.next.name}（${s.next.net}）。今後 ${s.totalUpcoming} 件。`,
      paths: [
        { path: "/launches/next/net", type: "string(ISO)", note: "次の打ち上げ時刻 → Countdown.target（主役・ライブT-）" },
        { path: "/launches/next/precision", type: "string", note: "時刻精度（Second/Minute/Hour/Day）→ Countdown.precision" },
        { path: "/launches/next/name", type: "string", note: "ロケット/ミッション名（Heading/Text）" },
        { path: "/launches/next/provider", type: "string", note: "打ち上げ事業者（Text）" },
        { path: "/launches/next/location", type: "string", note: "射場（Text）" },
        { path: "/launches/upcoming", type: "array<{name,provider,net,location,status}>", note: "今後の打ち上げ → LaunchTimeline.items", sample: `len=${s.upcoming.length}` },
        { path: "/launches/totalUpcoming", type: "number", note: `登録済みの今後の打ち上げ総数（${s.totalUpcoming}）→ BigStat もよい` },
      ],
      suggest: ["Countdown", "LaunchTimeline", "BigStat", "Heading", "Text", "Card", "ActionButton"],
      notes: ["主役は次の打ち上げの Countdown（ライブ T-）。その下に LaunchTimeline で今後の予定。"],
      followups: ["ISSは今どこ？", "今の地球を見せて", "今週ヤバい小惑星ある？"],
    };
  },
};
