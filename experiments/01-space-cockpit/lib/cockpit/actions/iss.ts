import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({});
type Params = z.infer<typeof params>;

interface IssPosRaw {
  latitude: number;
  longitude: number;
  altitude: number; // km
  velocity: number; // km/h
  timestamp: number; // unix seconds
  visibility: string;
}
interface AstrosRaw {
  people: Array<{ name: string; craft: string }>;
  number: number;
}
interface IssFetched {
  pos: IssPosRaw;
  crew: string[];
  crewAvailable: boolean;
}

export interface IssState extends Record<string, unknown> {
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  visibility: string;
  asOf: string; // ISO
  crew: string[];
  crewCount: number;
  crewAvailable: boolean;
}

export const iss: Action<Params, IssFetched, IssState> = {
  id: "iss",
  when: "Where is the ISS right now — live position on a map plus altitude/velocity, and who is aboard.",
  params,

  async fetch(_p, ctx) {
    const pos = await fetchJson<IssPosRaw>(
      "https://api.wheretheiss.at/v1/satellites/25544",
      ctx.signal,
    );
    // crew is optional & flaky (open-notify is http-only) — soft-degrade, never fail the action.
    let crew: string[] = [];
    let crewAvailable = false;
    try {
      const astros = await fetchJson<AstrosRaw>("http://api.open-notify.org/astros.json", ctx.signal);
      crew = astros.people.filter((p) => p.craft === "ISS").map((p) => p.name);
      crewAvailable = true;
    } catch {
      /* degrade: map + KPIs still render without crew */
    }
    return { pos, crew, crewAvailable };
  },

  compute(raw) {
    const { pos, crew, crewAvailable } = raw;
    return {
      lat: pos.latitude,
      lon: pos.longitude,
      altitudeKm: Math.round(pos.altitude * 10) / 10,
      velocityKmh: Math.round(pos.velocity),
      visibility: pos.visibility,
      asOf: new Date(pos.timestamp * 1000).toISOString(),
      crew,
      crewCount: crew.length,
      crewAvailable,
    };
  },

  describe(s): StateHint {
    const paths: StateHint["paths"] = [
      { path: "/iss/lat", type: "number", note: "latitude deg; Globe3D.lat（主役）または IssMap.lat" },
      { path: "/iss/lon", type: "number", note: "longitude deg; Globe3D.lon（主役）または IssMap.lon" },
      { path: "/iss/altitudeKm", type: "number", note: "altitude in km; 主役の数字なら BigStat(unit='km')、補助なら Kpi" },
      { path: "/iss/velocityKmh", type: "number", note: "speed in km/h; BigStat か Kpi（unit='km/h'）" },
      { path: "/iss/asOf", type: "string", note: "ISO timestamp of this fix; show as provenance ('as of …')" },
    ];
    const notes: string[] = ["ISS の現在地は Globe3D（3D地球）を主役に。高度/速度は BigStat か Kpi。"];
    const suggest = ["Globe3D", "BigStat", "Kpi", "Heading", "Text", "IssMap"];
    if (s.crewAvailable && s.crewCount > 0) {
      paths.push({
        path: "/iss/crew",
        type: "array<string>",
        note: `${s.crewCount} ISS crew names; render with List (the only string-array component) bound to /iss/crew`,
      });
      suggest.push("List");
      notes.push("Crew names are a string array — use a List bound to /iss/crew (do NOT put them in Text/Kpi).");
    } else {
      notes.push("Crew list unavailable (open-notify down) — render map + KPIs without a crew panel.");
    }
    return {
      summary: `ISS at ${s.lat.toFixed(1)}, ${s.lon.toFixed(1)}; ${s.altitudeKm} km, ${s.velocityKmh} km/h.`,
      paths,
      suggest: [...suggest, "ActionButton"],
      notes,
      // 先頭は同じ問い = 再取得（位置が動く）。残りは別アクションへの導線。
      followups: ["ISSは今どこ？", "今週ヤバい小惑星ある？", "今日の宇宙写真は？"],
    };
  },
};
