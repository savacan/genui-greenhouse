/**
 * エンドツーエンド意味検証の収集段（docs/pokefinder.md §16）。
 * §11 はフォーム spec までを測ったが、§15 の教訓＝「出てきた“もの”が妥当か」を測るため、
 * クエリ → LLM がフォーム compose → 実際の変換 toFindParams → /api/find → **返ってきたポケモン** まで通して記録する。
 * 使い方: dev 起動中に  pnpm --filter pokefinder exec tsx scripts/eval-e2e.mts > e2e-samples.json
 *   進捗・サマリは stderr、サンプル JSON 配列は stdout（後段の多レンズ判定はワークフロー）。
 */
import { toFindParams, type Shelf } from "../lib/finder/shelf";

const GEN = process.env.POKEFINDER_URL || "http://localhost:3103/api/generate";
const FIND = GEN.replace("/api/generate", "/api/find");

// 新 catalog（OR/AND・世代範囲・sortBy・別形態トグル）＋表現不能・不可能・奇クエリを網羅。
const QUERIES = [
  "炎か飛行タイプで素早さが高い相棒",          // OR + speed sort
  "ドラゴンタイプで一番強いやつ",              // single + total（base のはず・eternamax でない）
  "第1世代の水タイプでタフな相棒",             // gen single + 耐久(防御/特防)
  "むしポケモンで第5世代以降",                 // gen 範囲「以降」
  "はがねかつ飛行の複合タイプ",                // AND
  "とにかく素早いポケモン",                    // stat のみ + speed sort
  "防御も特防も高い壁ポケモン",                // 2 stat
  "メガシンカできる炎タイプ",                  // includeForms=true 想定
  "かわいいポケモン",                          // 表現不能（主観）→ graceful
  "伝説級のドラゴン",                          // 「伝説級」表現不能 + dragon は表現可
  "第2世代から第4世代のでんきタイプ",          // gen 範囲 両端
  "ノーマルかつゴーストの両方を持つ相棒",      // ほぼ不可能（空〜極少）→ graceful
  "くさタイプで素早くて攻撃も高い",            // type + 2 stat + sort
  "エスパーか鋼で特攻が高い第9世代",           // OR + gen + stat + sort 複合
];

type Patch = { op: string; path: string; value?: unknown };
function parseSSE(text: string): { elements: Record<string, any>; state?: any } {
  let spec: any = { elements: {} };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") continue;
    let obj: any;
    try { obj = JSON.parse(payload); } catch { continue; }
    if (obj?.type !== "data-spec") continue;
    const d = obj.data;
    if (d?.type === "flat" && d.spec) { spec = { ...d.spec, elements: { ...d.spec.elements } }; continue; }
    const patch: Patch | undefined = d?.type === "patch" ? d.patch : undefined;
    if (!patch) continue;
    if (patch.path === "" || patch.path === "/") { spec = { ...(patch.value as any), elements: { ...(patch.value as any)?.elements } }; continue; }
    const parts = patch.path.replace(/^\//, "").split("/");
    let cur = spec;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = patch.value;
  }
  if (!spec.elements) spec.elements = {};
  return spec;
}

/** spec から「説明 Text」（graceful 明示はここ）を素の文字列だけ拾う。 */
function noteTexts(spec: any): string[] {
  return Object.values(spec.elements ?? {})
    .filter((e: any) => e?.type === "Text" && typeof e?.props?.text === "string")
    .map((e: any) => e.props.text as string);
}

async function run(query: string) {
  const gres = await fetch(GEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "form", messages: [{ role: "user", parts: [{ type: "text", text: query }] }] }),
  });
  const spec = parseSSE(await gres.text());
  const shelf = ((spec.state as any)?.shelf ?? null) as Shelf | null;
  const notes = noteTexts(spec);
  const params = toFindParams(shelf ?? undefined);

  // 「探す」を実際に回す（タイプ未選択なら検索しない＝表現不能/未指定の正当な分岐）。
  let result: any = { skipped: true, reason: "no types selected" };
  if (params.types.length) {
    const fres = await fetch(FIND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await fres.json();
    result = fres.ok
      ? {
          count: data.count,
          matchedCount: data.matchedCount,
          criteriaLabel: data.criteriaLabel,
          note: data.note ?? "",
          // 返ってきたポケモン（全件・count と一致させる＝判定ハーネスが観測を取りこぼさない・§13 教訓）。
          mons: (data.mons ?? []).map((m: any) => ({
            name: m.name, types: m.types, hp: m.hp, attack: m.attack, defense: m.defense,
            spAtk: m.spAtk, spDef: m.spDef, speed: m.speed, total: m.total,
          })),
        }
      : { error: data?.error ?? `HTTP ${fres.status}` };
  }
  return { query, shelf, params, notes, result };
}

const samples: any[] = [];
for (const q of QUERIES) {
  process.stderr.write(`. ${q}\n`);
  try { samples.push(await run(q)); } catch (e) { samples.push({ query: q, error: String(e) }); }
}
for (const s of samples) {
  if (s.error) { process.stderr.write(`FAIL ${s.query}: ${s.error}\n`); continue; }
  const r = s.result;
  const top = r.mons?.[0]?.name ?? (r.skipped ? "(検索なし)" : "(0件)");
  process.stderr.write(
    `${s.query} | types=${JSON.stringify(s.params.types)} mode=${s.params.typeMode} gen=${s.params.genFrom ?? "-"}..${s.params.genTo ?? "-"} sort=${s.params.sortBy ?? "total"} forms=${s.params.includeForms}` +
    ` | 該当${r.count ?? "-"}/候補${r.matchedCount ?? "-"} top=${top}\n`,
  );
}
console.log(JSON.stringify(samples, null, 2));
