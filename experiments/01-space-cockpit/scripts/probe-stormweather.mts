/**
 * Storm Inbound M1 検証: spaceWeather / cme を実 API で叩き、compute→describe を目視。
 * cme は「今」のウィンドウ（静穏なら present:false が正常）。
 *   pnpm --filter space-cockpit exec tsx scripts/probe-stormweather.mts
 */
import { readFileSync } from "node:fs";
import { spaceWeather } from "../lib/cockpit/actions/spaceWeather";
import { cme } from "../lib/cockpit/actions/cme";
import { aurora } from "../lib/cockpit/actions/aurora";

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
const nasaKey = loadEnv().NASA_API_KEY || "DEMO_KEY";
const ctx = { signal: AbortSignal.timeout(30_000), env: { nasaKey } };
const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};

console.log(`probe: nasaKey=${nasaKey === "DEMO_KEY" ? "DEMO_KEY(429注意)" : "set"}\n`);

// --- spaceWeather ---
try {
  const raw = await spaceWeather.fetch({}, ctx);
  const s = spaceWeather.compute(raw, {});
  console.log("===== spaceWeather OK =====");
  console.log("scalars:", JSON.stringify({ windSpeedKmS: s.windSpeedKmS, density: s.density, temperatureK: s.temperatureK, bzNt: s.bzNt, kpNow: s.kpNow, gScale: s.gScale, verdict: s.verdict, boardColor: s.boardColor, asOf: s.asOf }));
  console.log("windSeries len:", s.windSeries.length, "head:", JSON.stringify(s.windSeries.slice(0, 2)));
  console.log("kpForecast len:", s.kpForecast.length, "tail:", JSON.stringify(s.kpForecast.slice(-2)));
  console.log("hint.summary:", spaceWeather.describe(s).summary);
  console.log("hint.notes:", JSON.stringify(spaceWeather.describe(s).notes));
  console.log("");
} catch (e) {
  console.log("===== spaceWeather FAILED =====\n", String(e), "\n");
}

// --- cme（今のウィンドウ） ---
try {
  const raw = await cme.fetch({}, ctx);
  const s = cme.compute(raw, {});
  console.log("===== cme (now window) OK =====");
  console.log("rawCount:", Array.isArray(raw) ? raw.length : "n/a");
  console.log("state:", clip(s, 800));
  console.log("hint.summary:", cme.describe(s).summary);
  console.log("");
} catch (e) {
  console.log("===== cme FAILED =====\n", String(e), "\n");
}

// --- cme の嵐ブランチ確認（2024-05 の compute ロジックを単体で検証） ---
// fetch を迂回し、2024-05 の生データで compute が approaching/arrived を出せるか（到達時刻が過去なので arrived 期待）。
try {
  const start = "2024-05-08";
  const end = "2024-05-12";
  const url = `https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${nasaKey}`;
  const res = await fetch(url, { signal: ctx.signal });
  const raw = (await res.json()) as Parameters<typeof cme.compute>[0];
  const s = cme.compute(raw, {});
  console.log("===== cme (2024-05 storm window・compute検証) =====");
  console.log("rawCount:", raw.length, "→ present:", s.present, "status:", s.status, "(過去なので none か arrived が正常)");
  // 「到達が未来」を擬似再現するのは難しいので、候補抽出が効いているかを件数で確認
  let withShock = 0;
  for (const c of raw) for (const a of c.cmeAnalyses ?? []) for (const e of a.enlilList ?? []) if (e.estimatedShockArrivalTime) withShock++;
  console.log("enlil-with-shock 候補数:", withShock, "(>0 なら地球到達判定ロジックが拾えている)");
} catch (e) {
  console.log("cme storm-window check failed:", String(e));
}

// --- aurora（観測地あり=東京 / なし） ---
for (const obs of [{ lat: 35.68, lon: 139.69 }, null] as Array<{ lat: number; lon: number } | null>) {
  try {
    const c = { ...ctx, observer: obs };
    const raw = await aurora.fetch({}, c);
    const s = aurora.compute(raw, {});
    console.log(`\n===== aurora (${obs ? `観測地 東京 ${obs.lat},${obs.lon}` : "観測地なし"}) =====`);
    console.log("scalars:", JSON.stringify({ hemisphere: s.hemisphere, southEdgeLat: s.southEdgeLat, maxProb: s.maxProb, observerEdgeLat: s.observerEdgeLat, reaches: s.reaches }));
    console.log("ovalBand len(間引き後・LLMには非送出):", s.ovalBand.length);
    console.log("verdict:", s.verdict);
    console.log("hint.summary:", aurora.describe(s).summary.slice(0, 160));
  } catch (e) {
    console.log("aurora FAILED:", String(e));
  }
}
