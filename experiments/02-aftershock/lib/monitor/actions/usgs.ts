import { z } from "zod";
import type { Action, StateHint, ModelSummary, ModelRow } from "../types";
import { fetchJson } from "../fetchJson";

/**
 * 「線の幅」つまみ（§8(a)/§11）: quakes が addressable list（topEvents）で返す上位イベント数
 * ＝モデルの多エンティティ調査の射程の上限。cap を超える「トップN」は静かに truncate される。
 * 5 = 既定（多くの「トップN比較」を賄い、firewall 無傷・トークン非肥大）。上げると射程は伸びるが、
 * 効くのはトークンでなく **wall-clock 遅延と盤面サイズ**（§11 実測: cap=10/トップ10 で 2.9分・208要素）。
 */
const ADDRESSABLE_TOP_N = 5;

// ---------- shared raw shapes ----------
interface UsgsProps {
  mag: number | null;
  place: string | null;
  time: number; // epoch ms UTC
  updated: number;
  url: string;
  detail: string;
  alert: string | null;
  tsunami: number; // 0/1 int
  sig: number;
  mmi: number | null;
  felt: number | null;
  types: string; // ",origin,shakemap,..."
  magType: string | null;
  title: string;
  products?: Record<
    string,
    Array<{
      properties: Record<string, string>; // ★ products の値は全部 string
      contents?: Record<string, { url: string; contentType?: string; length?: number }>;
    }>
  >;
}
interface UsgsFeature {
  id: string;
  properties: UsgsProps;
  geometry: { type: string; coordinates: [number, number, number] }; // [lon, lat, depthKm]
}
interface UsgsCollection {
  type: "FeatureCollection";
  features: UsgsFeature[];
}

const parseTypes = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

// ============================================================
// quakes — 一覧（loop の入口）
// ============================================================
const listParams = z.object({
  minMagnitude: z.number().min(0).max(10).default(4.5).describe("minimum magnitude"),
  windowDays: z.number().int().min(1).max(30).default(7).describe("look back this many days from now"),
  orderBy: z.enum(["time", "magnitude"]).default("magnitude").describe("largest-first or newest-first"),
  limit: z.number().int().min(1).max(50).default(20),
});
type ListParams = z.infer<typeof listParams>;

export interface QuakeRow {
  id: string;
  mag: number;
  place: string;
  depthKm: number;
  lat: number;
  lon: number;
  ageHours: number;
  magType: string;
  sig: number;
  tsunami: boolean;
  alert: string | null;
  felt: number | null;
  hasShakemap: boolean;
  hasMomentTensor: boolean;
  url: string;
}
export interface QuakesState extends Record<string, unknown> {
  quakes: QuakeRow[];
  count: number;
  maxMag: number;
  strongest: { id: string; place: string; mag: number; depthKm: number } | null;
  medianDepthKm: number;
  shallowCount: number;
  tsunamiFlaggedCount: number;
  redAlertCount: number;
  windowLabel: string;
}

export const quakes: Action<ListParams, { data: UsgsCollection; fetchedAt: number }, QuakesState> = {
  id: "quakes",
  when: "List recent earthquakes (ranked by magnitude or time) over a day window. ENTRY POINT: call this first to see what happened, then drill into the strongest with quakeDetail.",
  params: listParams,

  async fetch(p, ctx) {
    const end = Date.now();
    const start = end - p.windowDays * 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const url =
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&minmagnitude=${p.minMagnitude}&starttime=${iso(start)}&endtime=${iso(end)}` +
      `&orderby=${p.orderBy}&limit=${p.limit}`;
    const data = await fetchJson<UsgsCollection>(url, ctx.signal);
    return { data, fetchedAt: end };
  },

  compute(raw, p) {
    const now = raw.fetchedAt;
    const rows: QuakeRow[] = (raw.data.features ?? []).map((f) => {
      const pr = f.properties;
      const [lon, lat, depthKm] = f.geometry.coordinates;
      const types = parseTypes(pr.types);
      return {
        id: f.id,
        mag: pr.mag ?? 0,
        place: pr.place ?? pr.title ?? "(unknown)",
        depthKm: Math.round((depthKm ?? 0) * 10) / 10,
        lat,
        lon,
        ageHours: Math.round(((now - pr.time) / 3_600_000) * 10) / 10,
        magType: pr.magType ?? "",
        sig: pr.sig ?? 0,
        tsunami: pr.tsunami === 1,
        alert: pr.alert ?? null,
        felt: pr.felt ?? null,
        hasShakemap: types.includes("shakemap"),
        hasMomentTensor: types.includes("moment-tensor"),
        url: pr.url,
      };
    });
    const byMag = [...rows].sort((a, b) => b.mag - a.mag);
    const depths = rows.map((r) => r.depthKm).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
    const median = depths.length ? depths[Math.floor(depths.length / 2)] : 0;
    const strongest = byMag[0]
      ? { id: byMag[0].id, place: byMag[0].place, mag: byMag[0].mag, depthKm: byMag[0].depthKm }
      : null;
    return {
      quakes: rows,
      count: rows.length,
      maxMag: byMag[0]?.mag ?? 0,
      strongest,
      medianDepthKm: median,
      shallowCount: rows.filter((r) => r.depthKm < 70).length,
      tsunamiFlaggedCount: rows.filter((r) => r.tsunami).length,
      redAlertCount: rows.filter((r) => r.alert === "red").length,
      windowLabel: `past ${p.windowDays} day${p.windowDays > 1 ? "s" : ""}, M≥${p.minMagnitude}`,
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      {
        path: "/quakes/quakes",
        type: "array<{id,mag,place,depthKm,lat,lon,ageHours,alert,tsunami,sig,hasShakemap}>",
        note: "ranked list; bind to QuakeList.rows or MagnitudeBars.rows",
        sample: `len=${s.count}${s.strongest ? `, strongest M${s.strongest.mag} ${s.strongest.place}` : ""}`,
      },
      { path: "/quakes/maxMag", type: "number", note: "largest magnitude in window; BigStat 主役向き" },
      { path: "/quakes/count", type: "number", note: "number of events; Kpi" },
      { path: "/quakes/windowLabel", type: "string", note: "the query window; good for a Heading" },
    ];
    const notes: string[] = [];
    if (s.count === 0) notes.push("No earthquakes in this window — render a Text empty-state, not a table.");
    if (s.tsunamiFlaggedCount > 0) notes.push(`${s.tsunamiFlaggedCount} tsunami-flagged — emphasize (AlertBanner / Badge tone=danger).`);
    if (s.redAlertCount > 0) notes.push(`${s.redAlertCount} red PAGER alert(s).`);
    return {
      summary: `Earthquakes (${s.windowLabel}): ${s.count} events, max M${s.maxMag}${s.strongest ? `, strongest ${s.strongest.place}` : ""}.`,
      paths,
      suggest: ["Heading", "BigStat", "MagnitudeBars", "QuakeList", "AlertBanner", "ActionButton"],
      notes,
      followups: s.strongest
        ? [`いちばん大きい M${s.strongest.mag} の地震を詳しく`, "その震源の天気は？", "震源の周りに何がある？"]
        : ["先週の地震は？"],
    };
  },

  toModel(s): ModelSummary {
    // ★ §8 (a) addressable list: 上位イベントを id 付きで戻す → モデルが #2/#3 を名指して
    // それぞれ quakeDetail できる。単一 strongest* だけだと多エンティティ比較で thrash した（境界の修正）。
    // 葉はすべてスカラー（ModelRow）＝生配列ではない。トークンコスト↑と引き換えに調査の射程を広げる。
    const topEvents: ModelRow[] = [...s.quakes]
      .sort((a, b) => b.mag - a.mag)
      .slice(0, ADDRESSABLE_TOP_N)
      .map((r) => ({ id: r.id, place: r.place, mag: r.mag, depthKm: r.depthKm }));
    return {
      count: s.count,
      maxMag: s.maxMag,
      strongestEventId: s.strongest?.id ?? null,
      strongestPlace: s.strongest?.place ?? null,
      strongestMag: s.strongest?.mag ?? null,
      strongestDepthKm: s.strongest?.depthKm ?? null,
      topEvents,
      tsunamiFlaggedCount: s.tsunamiFlaggedCount,
      redAlertCount: s.redAlertCount,
      windowLabel: s.windowLabel,
    };
  },
};

// ============================================================
// quakeDetail — 1イベントの products パース（ビーチボール / ShakeMap / PAGER）
// ============================================================
const detailParams = z.object({
  eventId: z
    .string()
    .regex(/^[a-z0-9]+$/i)
    .describe("USGS event id, e.g. us6000t7zp (use quakes.strongestEventId)"),
});
type DetailParams = z.infer<typeof detailParams>;

export interface NodalPlane {
  strike: number;
  dip: number;
  rake: number;
}
export interface QuakeDetailState extends Record<string, unknown> {
  eventId: string;
  title: string;
  mag: number;
  place: string;
  depthKm: number;
  lat: number;
  lon: number;
  faultType: string;
  nodalPlanes: NodalPlane[];
  maxMmi: number | null;
  pagerAlert: string | null;
  scalarMoment: number | null;
  shakemapIntensityImgUrl: string | null;
  hasShakemap: boolean;
  hasMomentTensor: boolean;
}

/** rake から断層型を分類（np1 を使う）。+90≒逆断層 / -90≒正断層 / 0,180≒横ずれ。 */
function classifyFault(rake: number): string {
  let n = ((rake % 360) + 360) % 360;
  if (n > 180) n -= 360; // -180..180
  if (n >= 45 && n <= 135) return "逆断層 (reverse/thrust)";
  if (n <= -45 && n >= -135) return "正断層 (normal)";
  return "横ずれ断層 (strike-slip)";
}

export const quakeDetail: Action<DetailParams, UsgsFeature, QuakeDetailState> = {
  id: "quakeDetail",
  when: "Deep detail for ONE earthquake by event id: focal mechanism (nodal planes / fault type), ShakeMap intensity image, PAGER alert. Its lat/lon feed weather and nearby.",
  params: detailParams,
  // ★ §8 (b) per-tool-call 名前空間: eventId ごとに別スロット（/quakeDetail/<eventId>/...）。
  // これで複数イベントのドリルが後勝ちで畳まれず並存できる。
  instanceKey: (p) => p.eventId,

  async fetch(p, ctx) {
    // eventid クエリは単一 Feature を返す（一覧は FeatureCollection）。404 は plain-text → fetchJson が res.ok 先読みで degrade。
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${encodeURIComponent(p.eventId)}&format=geojson`;
    return fetchJson<UsgsFeature>(url, ctx.signal);
  },

  compute(raw) {
    const pr = raw.properties;
    const [lon, lat, depthKm] = raw.geometry.coordinates;
    const products = pr.products ?? {};

    const mt = products["moment-tensor"]?.[0]?.properties;
    const nodalPlanes: NodalPlane[] = [];
    if (mt) {
      for (const i of [1, 2] as const) {
        const strike = parseFloat(mt[`nodal-plane-${i}-strike`]);
        const dip = parseFloat(mt[`nodal-plane-${i}-dip`]);
        const rake = parseFloat(mt[`nodal-plane-${i}-rake`]);
        if (Number.isFinite(strike) && Number.isFinite(dip) && Number.isFinite(rake)) {
          nodalPlanes.push({ strike, dip, rake });
        }
      }
    }

    const sm = products["shakemap"]?.[0];
    const shakemapIntensityImgUrl = sm?.contents?.["download/intensity.jpg"]?.url ?? null;
    const maxMmiStr = sm?.properties?.maxmmi;
    const pager = products["losspager"]?.[0]?.properties;
    const scalarMomentStr = mt?.["scalar-moment"];

    return {
      eventId: raw.id,
      title: pr.title,
      mag: pr.mag ?? (mt ? parseFloat(mt["derived-magnitude"]) : 0),
      place: pr.place ?? pr.title ?? "(unknown)",
      depthKm: Math.round((depthKm ?? 0) * 10) / 10,
      lat,
      lon,
      faultType: nodalPlanes.length ? classifyFault(nodalPlanes[0].rake) : "不明 (no moment tensor)",
      nodalPlanes,
      maxMmi: maxMmiStr != null ? parseFloat(maxMmiStr) : (pr.mmi ?? null),
      pagerAlert: pager?.alertlevel ?? pr.alert ?? null,
      scalarMoment: scalarMomentStr != null ? parseFloat(scalarMomentStr) : null,
      shakemapIntensityImgUrl,
      hasShakemap: !!sm,
      hasMomentTensor: !!mt,
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      { path: "/quakeDetail/faultType", type: "string", note: "fault mechanism label; Kpi or Badge" },
      { path: "/quakeDetail/depthKm", type: "number", note: "hypocenter depth (km); Kpi" },
      { path: "/quakeDetail/mag", type: "number", note: "magnitude; BigStat 主役向き" },
    ];
    if (s.nodalPlanes.length)
      paths.push({ path: "/quakeDetail/nodalPlanes", type: "array<{strike,dip,rake}>", note: "focal mechanism; bind to Beachball.planes（生のまま）" });
    if (s.shakemapIntensityImgUrl)
      paths.push({ path: "/quakeDetail/shakemapIntensityImgUrl", type: "string(url)", note: "ShakeMap intensity image; bind to ShakeMapImage.src（生 url・$format 禁止）" });
    if (s.pagerAlert)
      paths.push({ path: "/quakeDetail/pagerAlert", type: "string(green|yellow|orange|red)", note: "PAGER alert; AlertBanner.level（Verdict-Tempo 色）" });
    const notes: string[] = [];
    if (!s.hasMomentTensor) notes.push("No moment tensor — skip Beachball, no fault type.");
    if (!s.hasShakemap) notes.push("No ShakeMap image for this event.");
    return {
      summary: `${s.title}: depth ${s.depthKm}km, ${s.faultType}${s.pagerAlert ? `, PAGER ${s.pagerAlert}` : ""}.`,
      paths,
      suggest: ["Heading", "BigStat", "Beachball", "ShakeMapImage", "AlertBanner", "ActionButton"],
      notes,
      followups: [`この震源(${s.place})の天気は？`, "震源の周りに何がある？"],
    };
  },

  toModel(s): ModelSummary {
    return {
      eventId: s.eventId,
      mag: s.mag,
      lat: s.lat,
      lon: s.lon,
      depthKm: s.depthKm,
      pagerAlert: s.pagerAlert,
      maxMmi: s.maxMmi,
      faultType: s.faultType,
      hasShakemap: s.hasShakemap,
    };
  },
};
