/**
 * 組成品質評定の収集段（docs/pokefinder.md §11）。
 * 実 /api/generate(intent=form) を多様なクエリで叩き、実モデルが組んだフォーム spec を集めて
 * 機械的指標（$bindState パス妥当性・カタログ逸脱・find ボタン・初期 state）を算出する。
 * 使い方: dev 起動中に  pnpm --filter pokefinder exec tsx scripts/eval-collect.mts > samples.json
 *   進捗・サマリは stderr、サンプル JSON 配列は stdout。後段の多レンズ判定はワークフローで実施。
 */
const BASE = process.env.POKEFINDER_URL || "http://localhost:3103/api/generate";

const VALID_TYPES = new Set([
  "normal","fire","water","electric","grass","ice","fighting","poison","ground",
  "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy",
]);
const VALID_STATS = new Set(["hp","attack","defense","spAtk","spDef","speed"]);
const CATALOG = new Set([
  "Stack","Card","Heading","Text","Badge","Kpi","TypeCheckbox","Select","Slider","ActionButton","MonGrid",
]);

const QUERIES = [
  "炎か飛行で素早さ高め",
  "第1世代の水タイプでタフなやつ",
  "ドラゴンタイプで攻撃が高いポケモン",
  "はがね・エスパーで打たれ強い相棒",
  "とにかく速いポケモン",                 // タイプ無し・stat のみ
  "かわいいポケモン",                     // マップ不能な主観
  "第3世代のゴーストで特攻が高い",
  "電気と地面の両方を持つ伝説級",          // 「伝説級」は API に無い概念
  "防御も特防も高い壁ポケモン",           // 2つの stat
  "草タイプ",                             // 素のタイプのみ
  "ノーマルでHPが高くて素早い",            // type + 2 stats
  "むしポケモンで第5世代以降",             // 「以降」= 範囲（Select は単一）
];

type Patch = { op: string; path: string; value?: unknown };
function parseSSE(text: string): { root?: string; elements: Record<string, any>; state?: any } {
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

function collectBindPaths(obj: any, out: string[]) {
  if (!obj || typeof obj !== "object") return;
  if (typeof obj.$bindState === "string") out.push(obj.$bindState);
  for (const v of Object.values(obj)) if (v && typeof v === "object") collectBindPaths(v, out);
}

async function run(query: string) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "form", messages: [{ role: "user", parts: [{ type: "text", text: query }] }] }),
  });
  const spec = parseSSE(await res.text());
  const els = Object.entries(spec.elements ?? {}) as Array<[string, any]>;
  const componentsUsed = [...new Set(els.map(([, e]) => e?.type).filter(Boolean))];
  const offCatalog = componentsUsed.filter((c) => !CATALOG.has(c));
  const bindPaths: string[] = [];
  for (const [, e] of els) collectBindPaths(e?.props, bindPaths);
  const badPaths = bindPaths.filter((p) => {
    const mType = /^\/shelf\/type\/(.+)$/.exec(p);
    if (mType) return !VALID_TYPES.has(mType[1]);
    // §14b: 世代範囲 genFrom/genTo・タイプ結合 typeMode が正しい新パス（旧 generationId は廃止）。
    if (p === "/shelf/typeMode" || p === "/shelf/genFrom" || p === "/shelf/genTo") return false;
    const mStat = /^\/shelf\/minStats\/(.+)$/.exec(p);
    if (mStat) return !VALID_STATS.has(mStat[1]);
    return true;
  });
  const types = els.filter(([, e]) => e?.type === "TypeCheckbox").map(([, e]) => {
    const m = /^\/shelf\/type\/(.+)$/.exec(e?.props?.checked?.$bindState ?? "");
    return { name: m?.[1], label: e?.props?.label, validName: m ? VALID_TYPES.has(m[1]) : false };
  });
  const sliders = els.filter(([, e]) => e?.type === "Slider").map(([, e]) => {
    const m = /^\/shelf\/minStats\/(.+)$/.exec(e?.props?.value?.$bindState ?? "");
    return m?.[1];
  });
  const findButton = els.some(([, e]) => e?.type === "ActionButton" && e?.on?.click?.action === "find");
  // 説明 Text（非表現語の graceful 明示はここに出る）。$template/オブジェクトは除外し素の文字列だけ拾う。
  // ※ これを捕捉しないと判定が「告知付き縮約」と「無告知サイレント縮約」を切り分けられない（v1/v2 評定の盲点）。
  const notes = els
    .filter(([, e]) => e?.type === "Text" && typeof e?.props?.text === "string")
    .map(([, e]) => e.props.text as string);
  return {
    query,
    elementCount: els.length,
    hasSelect: els.some(([, e]) => e?.type === "Select"),
    types,
    sliders,
    findButton,
    offCatalog,
    badPaths,
    notes,
    state: (spec.state as any)?.shelf ?? null,
  };
}

const samples = [];
for (const q of QUERIES) {
  process.stderr.write(`. ${q}\n`);
  try { samples.push(await run(q)); } catch (e) { samples.push({ query: q, error: String(e) }); }
}
for (const s of samples as any[]) {
  if (s.error) { process.stderr.write(`FAIL ${s.query}: ${s.error}\n`); continue; }
  process.stderr.write(
    `${s.findButton ? "✓" : "✗find"} ${s.query} | els=${s.elementCount} cb=${s.types.length} sld=${s.sliders.length}` +
    ` | offCatalog=${s.offCatalog.join(",") || "-"} | badPaths=${s.badPaths.length}\n`,
  );
}
console.log(JSON.stringify(samples, null, 2)); // stdout = サンプル JSON（ワークフロー判定の入力）
