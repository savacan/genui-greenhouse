import { z } from "zod";
import type { Action, StateHint, ModelSummary } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  latitude: z.number().min(-90).max(90).describe("epicenter latitude"),
  longitude: z.number().min(-180).max(180).describe("epicenter longitude"),
  label: z.string().nullable().default(null).describe("optional place label"),
});
type Params = z.infer<typeof params>;

interface OpenMeteoRaw {
  latitude: number; // grid-snapped
  longitude: number;
  elevation: number; // 0 over ocean → offshore hint
  timezone: string;
  current_units: Record<string, string>;
  current: { time: string; temperature_2m: number; wind_speed_10m: number; weather_code: number };
  hourly_units: Record<string, string>;
  hourly: { time: string[]; temperature_2m: number[] };
}

// WMO weather code → 日本語ラベル+emoji（recon の表）。マッピングはサーバで決める（LLM に作らせない）。
const WMO: Record<number, { label: string; emoji: string }> = {
  0: { label: "快晴", emoji: "☀️" },
  1: { label: "晴れ", emoji: "🌤️" },
  2: { label: "晴れ時々曇り", emoji: "⛅" },
  3: { label: "曇り", emoji: "☁️" },
  45: { label: "霧", emoji: "🌫️" },
  48: { label: "着氷性の霧", emoji: "🌫️" },
  51: { label: "弱い霧雨", emoji: "🌦️" },
  53: { label: "霧雨", emoji: "🌦️" },
  55: { label: "強い霧雨", emoji: "🌧️" },
  56: { label: "着氷性の霧雨", emoji: "🌧️" },
  57: { label: "強い着氷性の霧雨", emoji: "🌧️" },
  61: { label: "弱い雨", emoji: "🌧️" },
  63: { label: "雨", emoji: "🌧️" },
  65: { label: "強い雨", emoji: "🌧️" },
  66: { label: "着氷性の雨", emoji: "🌧️" },
  67: { label: "強い着氷性の雨", emoji: "🌧️" },
  71: { label: "弱い雪", emoji: "🌨️" },
  73: { label: "雪", emoji: "🌨️" },
  75: { label: "強い雪", emoji: "❄️" },
  77: { label: "霧雪", emoji: "🌨️" },
  80: { label: "弱いにわか雨", emoji: "🌦️" },
  81: { label: "にわか雨", emoji: "🌧️" },
  82: { label: "激しいにわか雨", emoji: "⛈️" },
  85: { label: "弱いにわか雪", emoji: "🌨️" },
  86: { label: "にわか雪", emoji: "❄️" },
  95: { label: "雷雨", emoji: "⛈️" },
  96: { label: "雹を伴う雷雨", emoji: "⛈️" },
  99: { label: "激しい雹を伴う雷雨", emoji: "⛈️" },
};

export interface WeatherState extends Record<string, unknown> {
  label: string | null;
  lat: number; // snapped
  lon: number;
  offshore: boolean;
  tempNow: number;
  tempUnit: string;
  wind: number;
  windUnit: string;
  condition: string;
  weatherCode: number;
  tempMin: number;
  tempMax: number;
  trend: "rising" | "falling" | "flat";
  sparkline: Array<{ t: string; temp: number }>;
  current: { time: string; temp: number; wind: number; condition: string };
}

export const weather: Action<Params, OpenMeteoRaw, WeatherState> = {
  id: "weather",
  when: "Current weather + a short temperature trend at a lat/lon (e.g. an earthquake epicenter from quakeDetail). Pass the epicenter's latitude & longitude.",
  params,
  // ★ §8 (b) per-tool-call 名前空間: 丸めた緯度経度ごとに別スロット → 複数震源の天気が並存（後勝ち回避）。
  instanceKey: (p) => `${p.latitude.toFixed(2)}_${p.longitude.toFixed(2)}`,

  async fetch(p, ctx) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
      `&current=temperature_2m,wind_speed_10m,weather_code&hourly=temperature_2m&forecast_days=2&timezone=auto`;
    return fetchJson<OpenMeteoRaw>(url, ctx.signal);
  },

  compute(raw, p) {
    const code = raw.current.weather_code;
    const wmo = WMO[code] ?? { label: `WMO ${code}`, emoji: "❓" };
    const condition = `${wmo.label} ${wmo.emoji}`;
    const temps = raw.hourly?.temperature_2m ?? [];
    const times = raw.hourly?.time ?? [];
    const tempMin = temps.length ? Math.min(...temps) : raw.current.temperature_2m;
    const tempMax = temps.length ? Math.max(...temps) : raw.current.temperature_2m;

    // 48点 hourly を ~8 点に downsample（生配列は LLM に渡さない・部品にだけ $state で）。
    const sparkline: Array<{ t: string; temp: number }> = [];
    const stepN = Math.max(1, Math.floor(temps.length / 8));
    for (let i = 0; i < temps.length && sparkline.length < 8; i += stepN) {
      sparkline.push({ t: times[i], temp: temps[i] });
    }

    // trend: now vs +12h
    const a = temps[0] ?? raw.current.temperature_2m;
    const b = temps[Math.min(12, Math.max(0, temps.length - 1))] ?? a;
    const trend = b > a + 0.5 ? "rising" : b < a - 0.5 ? "falling" : "flat";

    return {
      label: p.label,
      lat: raw.latitude,
      lon: raw.longitude,
      offshore: raw.elevation === 0,
      tempNow: raw.current.temperature_2m,
      tempUnit: raw.current_units?.temperature_2m ?? "°C",
      wind: raw.current.wind_speed_10m,
      windUnit: raw.current_units?.wind_speed_10m ?? "km/h",
      condition,
      weatherCode: code,
      tempMin: Math.round(tempMin * 10) / 10,
      tempMax: Math.round(tempMax * 10) / 10,
      trend,
      sparkline,
      current: { time: raw.current.time, temp: raw.current.temperature_2m, wind: raw.current.wind_speed_10m, condition },
    };
  },

  describe(s): StateHint {
    return {
      summary: `Weather @ ${s.lat.toFixed(2)},${s.lon.toFixed(2)}: ${s.tempNow}${s.tempUnit}, ${s.condition}${s.offshore ? " (offshore)" : ""}.`,
      paths: [
        { path: "/weather/current", type: "{time,temp,wind,condition}", note: "bind to WeatherTile（生のまま）" },
        { path: "/weather/sparkline", type: "array<{t,temp}>", note: "48h temp downsampled to 8 pts; bind to Sparkline.points（生のまま・$format 禁止）" },
        { path: "/weather/tempNow", type: "number", note: "current temp; Kpi（$format 可）" },
        { path: "/weather/condition", type: "string", note: "weather label + emoji; Text/Kpi" },
      ],
      suggest: ["Heading", "WeatherTile", "Sparkline", "Kpi"],
      notes: s.offshore ? ["Epicenter is offshore (elevation 0) — marine weather; no nearby land station."] : [],
    };
  },

  toModel(s): ModelSummary {
    return {
      tempNow: s.tempNow,
      unit: s.tempUnit,
      wind: s.wind,
      windUnit: s.windUnit,
      condition: s.condition,
      tempMin: s.tempMin,
      tempMax: s.tempMax,
      trend: s.trend,
      offshore: s.offshore,
    };
  },
};
