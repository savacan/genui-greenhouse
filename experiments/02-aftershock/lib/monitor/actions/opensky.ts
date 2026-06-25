import { z } from "zod";
import type { Action, StateHint, ModelSummary } from "../types";

const params = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
type Params = z.infer<typeof params>;

interface OpenSkyRaw {
  states: Array<Array<unknown>> | null; // positional arrays
}

export interface Flight {
  callsign: string;
  lat: number;
  lon: number;
  altM: number | null;
  distKm: number;
}
export interface AircraftState extends Record<string, unknown> {
  unavailable: boolean;
  flights: Flight[];
  count: number;
  nearest: { callsign: string; distKm: number } | null;
}

const hav = (la1: number, lo1: number, la2: number, lo2: number) => {
  const R = 6371,
    d = Math.PI / 180;
  const dla = (la2 - la1) * d,
    dlo = (lo2 - lo1) * d;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * 任意ソース。OpenSky 匿名はレート厳しく不安定 → 失敗は握りつぶして {unavailable:true}。
 * 1ソース死んでも盤面は生きる（01 の soft-degrade 規律）。
 */
export const aircraft: Action<Params, OpenSkyRaw | null, AircraftState> = {
  id: "aircraft",
  when: "OPTIONAL: aircraft currently flying near a lat/lon (OpenSky). Often rate-limited → degrades to unavailable. Only call if the user explicitly asks about air traffic.",
  params,

  async fetch(p, ctx) {
    try {
      const d = 1.5; // bbox ~degrees
      const url = `https://opensky-network.org/api/states/all?lamin=${p.latitude - d}&lomin=${p.longitude - d}&lamax=${p.latitude + d}&lomax=${p.longitude + d}`;
      const res = await fetch(url, { signal: ctx.signal, headers: { accept: "application/json" } });
      if (!res.ok) return null;
      return (await res.json()) as OpenSkyRaw;
    } catch {
      return null; // abort 含め degrade
    }
  },

  compute(raw, p) {
    if (!raw || !raw.states) return { unavailable: true, flights: [], count: 0, nearest: null };
    const flights: Flight[] = raw.states
      .map((s) => {
        const callsign = String(s[1] ?? "").trim() || "(no id)";
        const lon = typeof s[5] === "number" ? s[5] : NaN;
        const lat = typeof s[6] === "number" ? s[6] : NaN;
        const altM = typeof s[7] === "number" ? (s[7] as number) : null;
        const distKm = Number.isFinite(lat) && Number.isFinite(lon) ? Math.round(hav(p.latitude, p.longitude, lat, lon)) : Infinity;
        return { callsign, lat, lon, altM, distKm };
      })
      .filter((f) => Number.isFinite(f.distKm))
      .sort((a, b) => a.distKm - b.distKm);
    const nearest = flights[0] ? { callsign: flights[0].callsign, distKm: flights[0].distKm } : null;
    return { unavailable: false, flights, count: flights.length, nearest };
  },

  describe(s): StateHint {
    if (s.unavailable)
      return { summary: "Aircraft data unavailable (OpenSky rate-limited).", paths: [], notes: ["Air traffic unavailable — skip this panel."] };
    return {
      summary: `${s.count} aircraft nearby${s.nearest ? `; nearest ${s.nearest.callsign} @ ${s.nearest.distKm}km` : ""}.`,
      paths: [{ path: "/aircraft/flights", type: "array<{callsign,lat,lon,altM,distKm}>", note: "bind to a list" }],
      suggest: ["Kpi", "Text"],
    };
  },

  toModel(s): ModelSummary {
    if (s.unavailable) return { unavailable: true };
    return { unavailable: false, count: s.count, nearestCallsign: s.nearest?.callsign ?? null, nearestKm: s.nearest?.distKm ?? null };
  },
};
