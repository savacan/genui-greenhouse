/**
 * Phase C 検証(1): ルーター単体を実 Azure に対して叩く。
 * actions[] (複数アクション) + Output.object が Azure OpenAI の構造化出力で通るか、
 * 複合質問が複数アクションに割れるかを確認。
 *   pnpm --filter space-cockpit exec tsx scripts/probe-router.mts
 */
import { readFileSync } from "node:fs";

// .env.local を全部 process.env に流す（NASA だけでなく Azure キーも要る）
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
}

const { getModel } = await import("../lib/cockpit/model");
const { routeQuery } = await import("../lib/cockpit/router");

const model = getModel();
const today = new Date().toISOString().slice(0, 10);
const queries = [
  "今日の宇宙の写真を見せて",
  "今週ヤバい小惑星ある？",
  "ISS は今どこ？",
  "今日の宇宙の写真と今週の小惑星をまとめて見せて", // 複合 → apod + neows
];

console.log(`router probe — deployment=${process.env.AZURE_OPENAI_DEPLOYMENT}, today=${today}\n`);
for (const q of queries) {
  try {
    const r = await routeQuery(model, q, today, AbortSignal.timeout(40_000));
    console.log(`Q: ${q}\n  -> ${JSON.stringify(r)}\n`);
  } catch (e) {
    console.log(`Q: ${q}\n  -> FAILED: ${String(e).slice(0, 400)}\n`);
  }
}
