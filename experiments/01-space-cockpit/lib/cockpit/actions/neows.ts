import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  startDate: z.string().describe("YYYY-MM-DD"),
  endDate: z.string().describe("YYYY-MM-DD, <= 7 days after startDate"),
});
type Params = z.infer<typeof params>;

interface NeoWsRaw {
  near_earth_objects: Record<
    string,
    Array<{
      name: string;
      is_potentially_hazardous_asteroid: boolean;
      estimated_diameter: {
        meters: { estimated_diameter_min: number; estimated_diameter_max: number };
      };
      close_approach_data: Array<{
        close_approach_date: string;
        miss_distance: { lunar: string; kilometers: string };
        relative_velocity: { kilometers_per_hour: string };
      }>;
    }>
  >;
}

/** Computed row — these field names ARE the AsteroidTable/Scatter prop contract. */
export interface AsteroidRow {
  name: string;
  hazardous: boolean;
  diameterM: number; // meters, midpoint of min/max (chosen convention)
  missLunar: number;
  missKm: number;
  velocityKmh: number;
  date: string;
}

export interface NeowsState extends Record<string, unknown> {
  rows: AsteroidRow[]; // ranked closest-first
  scatter: Array<{ x: number; y: number; hazardous: boolean; name: string }>; // x=missLunar, y=diameterM
  hazardousCount: number;
  closest: { name: string; missLunar: number } | null;
  windowLabel: string;
  total: number;
}

export const neows: Action<Params, NeoWsRaw, NeowsState> = {
  id: "neows",
  when: "Near-earth asteroids / close approaches in a date window (<= 7 days): ranking, hazard flag, distance-vs-size scatter.",
  params,

  async fetch(p, ctx) {
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${p.startDate}&end_date=${p.endDate}&api_key=${ctx.env.nasaKey}`;
    return fetchJson<NeoWsRaw>(url, ctx.signal);
  },

  compute(raw, p) {
    const rows: AsteroidRow[] = [];
    for (const list of Object.values(raw.near_earth_objects ?? {})) {
      // flatten the DATE-KEYED map
      for (const o of list) {
        const ca = [...(o.close_approach_data ?? [])].sort(
          (a, b) => parseFloat(a.miss_distance.lunar) - parseFloat(b.miss_distance.lunar),
        )[0];
        if (!ca) continue;
        const d = o.estimated_diameter.meters;
        rows.push({
          name: o.name,
          hazardous: o.is_potentially_hazardous_asteroid,
          diameterM: Math.round((d.estimated_diameter_min + d.estimated_diameter_max) / 2),
          missLunar: parseFloat(ca.miss_distance.lunar),
          missKm: parseFloat(ca.miss_distance.kilometers),
          velocityKmh: Math.round(parseFloat(ca.relative_velocity.kilometers_per_hour)),
          date: ca.close_approach_date,
        });
      }
    }
    rows.sort((a, b) => a.missLunar - b.missLunar); // RANK on the server
    return {
      rows,
      scatter: rows.map((r) => ({ x: r.missLunar, y: r.diameterM, hazardous: r.hazardous, name: r.name })),
      hazardousCount: rows.filter((r) => r.hazardous).length,
      closest: rows[0] ? { name: rows[0].name, missLunar: rows[0].missLunar } : null,
      windowLabel: `${p.startDate} → ${p.endDate}`,
      total: rows.length,
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      {
        path: "/neows/rows",
        type: "array<{name,hazardous,diameterM(m),missLunar(LD),missKm,velocityKmh,date}>",
        note: "ranked closest-first; bind to AsteroidTable.rows",
        sample: `len=${s.total}${s.closest ? `, closest='${s.closest.name}' @ ${s.closest.missLunar} LD` : ""}`,
      },
      {
        path: "/neows/scatter",
        type: "array<{x,y,hazardous,name}>",
        note: "x=miss distance (lunar distances), y=diameter (m); OrbitProximity.points（体感・主役向き）または AsteroidScatter.points にバインド",
      },
      {
        path: "/neows/hazardousCount",
        type: "number",
        note: `potentially-hazardous count (${s.hazardousCount}); Kpi, or Badge tone=danger when > 0`,
      },
      { path: "/neows/windowLabel", type: "string", note: "the date window; good for a Heading" },
    ];
    if (s.closest) {
      paths.push({ path: "/neows/closest/name", type: "string", note: "closest asteroid name (BigStat.context や Kpi)" });
      paths.push({
        path: "/neows/closest/missLunar",
        type: "number",
        note: "closest miss distance, unit LD; 主役の数字 → BigStat に decimals=1, unit='月距離', context=最接近の名前 で大きく出す",
      });
    }
    const notes: string[] = [];
    if (s.total === 0) notes.push("No objects in this window — render a Text empty-state, not a table.");
    if (s.hazardousCount > 0) notes.push(`${s.hazardousCount} hazardous — Card tone=danger や OrbitProximity の赤で強調。`);
    notes.push("『ヤバい/近い/危険』寄りの問いは OrbitProximity（接近の体感図）＋最接近 BigStat を主役に、表は補助。");
    return {
      summary: `Near-earth asteroids ${s.windowLabel}: ${s.total} objects, ${s.hazardousCount} hazardous.`,
      paths,
      suggest: ["Heading", "BigStat", "OrbitProximity", "Badge", "AsteroidTable", "AsteroidScatter", "ActionButton"],
      notes,
      followups: ["ISSは今どこ？", "今日の宇宙写真は？", "先週の接近小惑星は？"],
    };
  },
};
