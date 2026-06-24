/**
 * 系外惑星アクションの検証: 実 ADQL（NASA Exoplanet Archive TAP）に対して
 * fetch→compute→describe を全 mode で叩き、state 形・分類・summary・hint を目視確認する。
 * NASA_API_KEY 不要（TAP は公開）。
 *   pnpm --filter space-cockpit exec tsx scripts/probe-exoplanet.mts
 */
import { exoplanet } from "../lib/cockpit/actions/exoplanet";

const MODES = ["earthlike", "recent", "giants", "all"] as const;

const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};

for (const mode of MODES) {
  const ctx = { signal: AbortSignal.timeout(30_000), env: { nasaKey: "DEMO_KEY" } };
  // route と同じく action 自身の schema で parse（default/catch を通す）。
  const p = exoplanet.params.parse({ mode });
  const t0 = Date.now();
  try {
    const raw = await exoplanet.fetch(p, ctx);
    const state = exoplanet.compute(raw, p);
    const hint = exoplanet.describe(state);
    const fams = state.scatterPoints.reduce<Record<string, number>>((a, pt) => {
      a[pt.family] = (a[pt.family] ?? 0) + 1;
      return a;
    }, {});
    console.log(`===== ${mode} OK (${Date.now() - t0}ms) =====`);
    console.log("points:", state.scatterPoints.length, "families:", JSON.stringify(fams));
    console.log("summary:", JSON.stringify(state.summary));
    console.log("first 3 points:", clip(state.scatterPoints.slice(0, 3), 600));
    console.log("hist len:", state.histogram.length, "head:", JSON.stringify(state.histogram.slice(0, 2)));
    console.log("hint.summary:", hint.summary);
    console.log("");
  } catch (e) {
    console.log(`===== ${mode} FAILED =====\n`, String(e), "\n");
  }
}

// nullable mode（route が null を strip → default earthlike になる）も一応確認。
const pDefault = exoplanet.params.parse({});
console.log("default mode (empty params) →", pDefault.mode);
const pBad = exoplanet.params.parse({ mode: "garbage" });
console.log("invalid mode 'garbage' → catch →", pBad.mode);
