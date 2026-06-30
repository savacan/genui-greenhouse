/**
 * エンドツーエンド意味検証の収集段（docs/artfinder.md・pokefinder §16 写経）。
 * クエリ → LLM がフォーム compose → 実際の変換 toFindParams → /api/find → **返ってきた作品** まで通して記録する。
 * 使い方: dev 起動中に  pnpm --filter artfinder exec tsx scripts/eval-e2e.mts > e2e-samples.json
 *   進捗・サマリは stderr、サンプル JSON 配列は stdout（後段の多レンズ判定はワークフロー）。
 */
import { toFindParams, type Shelf } from "../lib/finder/shelf";

const GEN = process.env.ARTFINDER_URL || "http://localhost:3104/api/generate";
const FIND = GEN.replace("/api/generate", "/api/find");

// 表現できる意図（種別/部門/主題/産地/年代/色/自由語・ファセット内OR・ファセット間AND・軸またぎOR）
// ＋表現できない意図（主観/メタ語）を網羅。先頭13は§11/§16 と同一セット（線を太くした前後の比較用）、末尾4は新射程の検証。
const QUERIES = [
  "青っぽい近代の油彩",            // color + type + year（表現可）
  "モネの絵",                      // artist q（英語化が要る）
  "アジアの彫刻か陶磁",            // dept AND × type 内OR
  "19世紀ヨーロッパの版画",        // §4: 版画×地域 → 今回 region で忠実化されるか
  "赤い抽象画",                    // §5: color + 主題「抽象」→ 今回 subject で拾えるか
  "有名な彫刻",                    // 主観「有名」→ graceful（type は可）
  "葛飾北斎の浮世絵",              // artist(Hokusai 英語化) + print
  "1850年より前の絵画",            // year 上端のみ
  "緑色のアフリカの美術",          // color + dept/region
  "高価な絵画",                    // メタ述語「高価」→ graceful（絵画 type は残す）
  "展示中の現代美術",              // onView + dept contemporary
  "水辺の風景画",                  // §12: 主題「水辺」→ 今回 subject=water で忠実化されるか
  "とにかく古い作品",              // sort oldest（フィルタ無し→最低1条件の促し or 年代）
  "睡蓮を描いた絵画",              // 新: subject（water/lilies）+ type painting
  "フランスの版画",                // 新: region=France（国・産地）+ print
  "絵画か、青い作品",              // 新: クロスファセット OR（type painting OR hue blue → combineMode=or）
  "アフリカの染織",                // 新: region=Africa（大陸→サーバ展開）+ textile
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
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: query }] }] }),
  });
  const spec = parseSSE(await gres.text());
  const shelf = ((spec.state as any)?.shelf ?? null) as Shelf | null;
  const notes = noteTexts(spec);
  const params = toFindParams(shelf ?? undefined);

  // 「探す」を実際に回す（条件が無ければ検索しない＝表現不能/未指定の正当な分岐）。
  const hasFilter =
    params.types.length ||
    params.departments.length ||
    params.yearFrom != null ||
    params.yearTo != null ||
    params.hue != null ||
    (params.q && params.q.length) ||
    (params.subject && params.subject.length) ||
    (params.region && params.region.length);
  let result: any = { skipped: true, reason: "no filter" };
  if (hasFilter) {
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
          // 返ってきた作品（判定ハーネスが観測を取りこぼさないよう全件・スカラーのみ）。
          // origin/subjects も載せて主題・産地フィルタの出力 correctness を判定可能に（§16）。
          artworks: (data.artworks ?? []).map((a: any) => ({
            title: a.title, artist: a.artist, dateText: a.dateText, type: a.type, department: a.department,
            origin: a.origin ?? "", subjects: Array.isArray(a.subjects) ? a.subjects.slice(0, 6) : [], hue: a.hue,
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
  const top = r.artworks?.[0]?.title ?? (r.skipped ? "(検索なし)" : "(0件)");
  process.stderr.write(
    `${s.query} | type=${JSON.stringify(s.params.types)} dept=${JSON.stringify(s.params.departments)} subj=${s.params.subject ?? "-"} region=${s.params.region ?? "-"} yr=${s.params.yearFrom ?? "-"}..${s.params.yearTo ?? "-"} hue=${s.params.hue ?? "-"} q=${s.params.q ?? "-"} mode=${s.params.combineMode} sort=${s.params.sortBy}` +
    ` | 該当${r.count ?? "-"}/候補${r.matchedCount ?? "-"} top=${top}${s.notes.length ? ` | notes=${s.notes.length}` : ""}\n`,
  );
}
console.log(JSON.stringify(samples, null, 2));
