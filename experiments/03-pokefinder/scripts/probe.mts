/**
 * Phase A 検証: LLM もブラウザも Next も使わず、データ層を実 PokéAPI に直接叩く。
 *   pnpm --filter pokefinder probe
 *
 * exp03 の肝＝サーバ側の積集合チェーン（タイプ AND → generation 積集合 → 種族値フィルタ＆並べ替え）。
 * 複数の問い形で fetch→compute→describe を回し、state / StateHint を目視確認する:
 *   ① 語彙（pokeTypes）   ② 単一の広いタイプ（cap 発火）   ③ 2タイプ積集合（小さい）
 *   ④ タイプ×世代          ⑤ 種族値しきい値＋並べ替え       ⑥ 該当0件（空状態）
 * §14b: ⑦ OR 和集合（cap 発火）   ⑧/⑧' AND vs OR 比較   ⑨ 世代範囲「N以降」   ⑩ 世代範囲「N〜M」   ⑪ 単一世代を範囲で（④と一致）
 */
import { readFileSync } from "node:fs";
import type { ActionContext } from "../lib/finder/types";
import { pokeTypes } from "../lib/finder/actions/pokeTypes";
import { findMons } from "../lib/finder/actions/findMons";
import { fetchJson, mapLimit } from "../lib/finder/fetchJson";

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
const pokeBase = env.POKE_API_BASE || "https://pokeapi.co/api/v2";
const ctx = (): ActionContext => ({ signal: AbortSignal.timeout(40_000), env: { pokeBase } });

const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};

/** findMons の結果を眼で追いやすく要約（行は name/types/total/speed だけ）。 */
function showMons(state: Awaited<ReturnType<typeof findMons.compute>>) {
  const head = state.mons
    .slice(0, 8)
    .map((m) => `    ${m.name.padEnd(16)} [${m.types.join("/")}]  total=${m.total} spd=${m.speed}`)
    .join("\n");
  console.log(
    `  criteria   : ${JSON.stringify(state.criteria)}\n` +
      `  matched=${state.matchedCount} shown=${state.count} filteredOut=${state.filteredOut} truncated=${state.truncated} dropped=${state.droppedCount}\n` +
      `  typeCounts : ${JSON.stringify(state.typeCounts)}\n` +
      (head ? `  top rows:\n${head}` : "  (no rows)"),
  );
}

console.log(`probe: pokeBase=${pokeBase}\n`);

// ① 語彙
try {
  const raw = await pokeTypes.fetch({}, ctx());
  const state = pokeTypes.compute(raw, {});
  console.log("===== ① pokeTypes (語彙) OK =====");
  console.log(`  types=${state.types.length} generations=${state.generations.length}`);
  console.log(`  types: ${state.types.map((t) => `${t.name}/${t.ja}`).join(", ")}`);
  console.log(`  gens : ${state.generations.map((g) => `${g.id}:${g.ja}`).join(", ")}`);
  console.log("  HINT:", clip(pokeTypes.describe(state), 900), "\n");
} catch (e) {
  console.log("===== ① pokeTypes FAILED =====\n", String(e), "\n");
}

const cases: Array<{ label: string; params: Parameters<typeof findMons.fetch>[0] }> = [
  { label: "② 単一の広いタイプ fire（cap 発火想定）", params: { types: ["fire"] } },
  { label: "③ 2タイプ積集合 fire ∩ flying（小さい）", params: { types: ["fire", "flying"] } },
  { label: "④ タイプ×世代 water ∩ gen1（genFrom=genTo=1）", params: { types: ["water"], genFrom: 1, genTo: 1 } },
  { label: "⑤ 種族値 fire / speed>=100 / sort=speed", params: { types: ["fire"], minStats: { speed: 100 }, sortBy: "speed" } },
  { label: "⑥ 該当0件 normal ∩ ghost（空状態）", params: { types: ["normal", "ghost"] } },
  // §14b: OR(和集合)と世代範囲の忠実化を検証。
  { label: "⑦ OR 和集合 fire ∪ flying（>∩ かつ単タイプも入る・cap 発火）", params: { types: ["fire", "flying"], typeMode: "or", sortBy: "total" } },
  { label: "⑧ AND vs OR 比較 dragon ∩ flying", params: { types: ["dragon", "flying"], typeMode: "and" } },
  { label: "⑧' AND vs OR 比較 dragon ∪ flying（似た＝どれか共有 を忠実化）", params: { types: ["dragon", "flying"], typeMode: "or" } },
  { label: "⑨ 世代範囲 steel ∩ gen5–9（『第5世代以降』を忠実化）", params: { types: ["steel"], genFrom: 5, genTo: 9 } },
  { label: "⑩ 世代範囲 water ∩ gen1–3（『第1〜3世代』）+ sort total", params: { types: ["water"], genFrom: 1, genTo: 3, sortBy: "total" } },
  { label: "⑪ 単一世代を範囲で water ∩ gen1（genFrom=genTo=1・④と一致するはず）", params: { types: ["water"], genFrom: 1, genTo: 1 } },
];

for (const c of cases) {
  try {
    const raw = await findMons.fetch(c.params, ctx());
    const state = findMons.compute(raw, c.params);
    console.log(`===== ${c.label} OK =====`);
    showMons(state);
    console.log("  HINT:", clip(findMons.describe(state), 900), "\n");
  } catch (e) {
    console.log(`===== ${c.label} FAILED =====\n`, String(e), "\n");
  }
}

// ⑫ ランキング正しさ assertion（件数でなく“答えが正しいか”を検証する＝§14b の教訓）。
// 真の全件ランク（cap なしで fire 全部の total を出す）と findMons の上位を突き合わせ、取りこぼしを検出する。
{
  const STAT = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
  try {
    const fireRaw = await fetchJson<{ pokemon: { pokemon: { name: string } }[] }>(`${pokeBase}/type/fire`, ctx().signal);
    const names = fireRaw.pokemon.map((e) => e.pokemon.name);
    const totals = await mapLimit(names, 16, async (n) => {
      const m = await fetchJson<{ stats: { base_stat: number; stat: { name: string } }[] }>(`${pokeBase}/pokemon/${n}`, ctx().signal);
      return { n, t: m.stats.filter((s) => STAT.includes(s.stat.name)).reduce((a, s) => a + s.base_stat, 0) };
    });
    totals.sort((a, b) => b.t - a.t);
    const trueTop5 = totals.slice(0, 5).map((x) => x.n);
    const state = await findMons.compute(await findMons.fetch({ types: ["fire"], sortBy: "total" }, ctx()), { types: ["fire"], sortBy: "total" });
    const shown = new Set(state.mons.map((m) => m.name));
    const missed = trueTop5.filter((n) => !shown.has(n));
    console.log(`===== ⑫ ランキング正しさ（fire 全${names.length}件の真のトップ5を findMons が取りこぼさないか）=====`);
    console.log(`  真のトップ5: ${trueTop5.join(", ")}`);
    console.log(`  取りこぼし : ${missed.length ? missed.join(", ") : "なし"}  → ${missed.length ? "FAIL（cap がランキングを壊している）" : "PASS"}`);
  } catch (e) {
    console.log("===== ⑫ ランキング正しさ FAILED =====\n", String(e), "\n");
  }
}
