/**
 * Phase A 検証: LLM もブラウザも Next も使わず、各アクションの fetch→compute→describe を
 * 実 API に対して直接叩いて state と StateHint を目視確認する。
 *   pnpm --filter space-cockpit exec tsx scripts/probe.ts
 */
import { readFileSync } from "node:fs";
import { ACTIONS } from "../lib/cockpit/actions";
import type { AnyAction } from "../lib/cockpit/types";

// .env.local から NASA_API_KEY を読む（最小パーサ。dotenv 不要）
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
const nasaKey = env.NASA_API_KEY || "DEMO_KEY";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const today = iso(Date.now());
const threeDaysAgo = iso(Date.now() - 3 * 86_400_000);

const paramsById: Record<string, unknown> = {
  apod: { date: null },
  neows: { startDate: threeDaysAgo, endDate: today },
  iss: {},
};

const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};

console.log(`probe: nasaKey=${nasaKey === "DEMO_KEY" ? "DEMO_KEY (rate-limited!)" : "set"}, window ${threeDaysAgo}..${today}\n`);

for (const action of ACTIONS as readonly AnyAction[]) {
  const ctx = { signal: AbortSignal.timeout(30_000), env: { nasaKey } };
  const params = paramsById[action.id];
  try {
    const raw = await action.fetch(params, ctx);
    const state = action.compute(raw, params);
    const hint = action.describe(state);
    console.log(`===== ${action.id} OK =====`);
    console.log("STATE :", clip(state, 1400));
    console.log("HINT  :", clip(hint, 1600));
    console.log("");
  } catch (e) {
    console.log(`===== ${action.id} FAILED =====\n`, String(e), "\n");
  }
}
