/**
 * Phase A 検証: LLM もブラウザも Next も使わず、データ層を実 API に対して直接叩く。
 *   pnpm --filter aftershock probe
 *
 * 単発 action ではなく **agentic chain** を手で再現する（02 の肝はこの連鎖）:
 *   quakes（一覧）→ 最強 eventId で quakeDetail → 震源座標で weather + nearby。
 * 各手で state / StateHint / toModel(state)（= モデルに戻すスカラー）を目視確認する。
 * さらに固定座標テスト（Tokyo=記事が密 / 洋上=疎・offshore）で recon の落とし穴を確認。
 */
import { readFileSync } from "node:fs";
import type { ActionContext } from "../lib/monitor/types";
import { quakes, quakeDetail } from "../lib/monitor/actions/usgs";
import { weather } from "../lib/monitor/actions/weather";
import { nearby } from "../lib/monitor/actions/nearby";
import { aircraft } from "../lib/monitor/actions/opensky";

function loadEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = loadEnv();
const ctx = (): ActionContext => ({
  signal: AbortSignal.timeout(30_000),
  env: { wikiUA: env.WIKI_USER_AGENT || "aftershock/0.1 (probe)" },
});

const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};
const show = (id: string, state: unknown, hint: unknown, model: unknown) => {
  console.log(`===== ${id} =====`);
  console.log("STATE  :", clip(state, 1200));
  console.log("HINT   :", clip(hint, 1100));
  console.log("toMODEL:", clip(model, 800), "  ← これだけがモデル文脈に戻る（生配列ゼロを確認）");
  console.log("");
};

async function main() {
  console.log("== aftershock Phase A probe (real APIs, no LLM) ==\n");

  // --- 手1: quakes 一覧 ---
  let strongestId: string | null = null;
  let epicenter: { lat: number; lon: number; place: string } | null = null;
  try {
    const p = quakes.params.parse({ minMagnitude: 4.5, windowDays: 7, orderBy: "magnitude", limit: 20 });
    const raw = await quakes.fetch(p, ctx());
    const state = quakes.compute(raw, p);
    show("quakes", state, quakes.describe(state), quakes.toModel(state));
    strongestId = state.strongest?.id ?? null;
  } catch (e) {
    console.log("quakes FAILED:", String(e), "\n");
  }

  // --- 手2: 最強イベントで quakeDetail（chain の蝶番: lat/lon を取り出す）---
  if (strongestId) {
    try {
      const p = quakeDetail.params.parse({ eventId: strongestId });
      const raw = await quakeDetail.fetch(p, ctx());
      const state = quakeDetail.compute(raw, p);
      show("quakeDetail", state, quakeDetail.describe(state), quakeDetail.toModel(state));
      epicenter = { lat: state.lat, lon: state.lon, place: state.place };
    } catch (e) {
      console.log("quakeDetail FAILED:", String(e), "\n");
    }
  } else {
    console.log("(no strongest eventId — skipping drill chain)\n");
  }

  // --- 手3: 震源座標で weather + nearby（chain の連鎖先）---
  if (epicenter) {
    console.log(`>> 震源 ${epicenter.place} @ ${epicenter.lat.toFixed(2)},${epicenter.lon.toFixed(2)} で連鎖\n`);
    const lang: "en" | "ja" = epicenter.lat > 24 && epicenter.lat < 46 && epicenter.lon > 122 && epicenter.lon < 154 ? "ja" : "en";
    try {
      const p = weather.params.parse({ latitude: epicenter.lat, longitude: epicenter.lon });
      const state = weather.compute(await weather.fetch(p, ctx()), p);
      show("weather (epicenter)", state, weather.describe(state), weather.toModel(state));
    } catch (e) {
      console.log("weather FAILED:", String(e), "\n");
    }
    try {
      const p = nearby.params.parse({ latitude: epicenter.lat, longitude: epicenter.lon, lang });
      const state = nearby.compute(await nearby.fetch(p, ctx()), p);
      show("nearby (epicenter)", state, nearby.describe(state), nearby.toModel(state));
    } catch (e) {
      console.log("nearby FAILED:", String(e), "\n");
    }
  }

  // --- 固定座標テスト: Tokyo（記事が密）---
  console.log(">> 固定テスト Tokyo（35.68,139.69）= 記事が密\n");
  try {
    const p = nearby.params.parse({ latitude: 35.68, longitude: 139.69, lang: "ja" });
    const state = nearby.compute(await nearby.fetch(p, ctx()), p);
    show("nearby (Tokyo/ja)", state, nearby.describe(state), nearby.toModel(state));
  } catch (e) {
    console.log("nearby Tokyo FAILED:", String(e), "\n");
  }

  // --- 固定座標テスト: 洋上（Tohoku 沖 38.3,142.4）= offshore + 記事疎 ---
  console.log(">> 固定テスト 洋上（38.3,142.4 Tohoku 沖）= offshore + 記事疎\n");
  try {
    const wp = weather.params.parse({ latitude: 38.3, longitude: 142.4 });
    const ws = weather.compute(await weather.fetch(wp, ctx()), wp);
    show("weather (offshore)", { offshore: ws.offshore, tempNow: ws.tempNow, condition: ws.condition }, weather.describe(ws), weather.toModel(ws));
    const np = nearby.params.parse({ latitude: 38.3, longitude: 142.4, lang: "en" });
    const ns = nearby.compute(await nearby.fetch(np, ctx()), np);
    show("nearby (offshore)", ns, nearby.describe(ns), nearby.toModel(ns));
  } catch (e) {
    console.log("offshore test FAILED:", String(e), "\n");
  }

  // --- 任意: aircraft（degrade 確認）---
  if (epicenter) {
    try {
      const p = aircraft.params.parse({ latitude: epicenter.lat, longitude: epicenter.lon });
      const state = aircraft.compute(await aircraft.fetch(p, ctx()), p);
      show("aircraft (optional)", { unavailable: state.unavailable, count: state.count }, aircraft.describe(state), aircraft.toModel(state));
    } catch (e) {
      console.log("aircraft FAILED (expected/degrade ok):", String(e), "\n");
    }
  }

  console.log("== probe done ==");
}

main();
