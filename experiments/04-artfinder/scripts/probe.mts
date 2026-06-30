/**
 * Phase A 検証: LLM もブラウザも Next も使わず、データ層を実 AIC API に直接叩く。
 *   pnpm --filter artfinder probe
 *
 * exp04 の肝＝サーバ側の form→ES 翻訳（ファセット内 OR・ファセット間 AND・年代/色相 range・常時 exists:image_id）。
 * 複数の問い形で fetch→compute→describe を回し、さらに**返ってきた“もの”が条件を満たすか**を実 AIC で突き合わせる
 * （§16 の教訓＝機構でなく出力 correctness を検証する）:
 *   ① 語彙(artVocab)  ② 単一ファセット  ③ ファセット内 OR  ④ ファセット間 AND
 *   ⑤ 年代 range  ⑥ 色相 range  ⑦ 自由語 q（+facet AND）  ⑧ 出力 correctness（返った行が条件通り）  ⑨ 粒度/画像（H5）
 */
import { readFileSync } from "node:fs";
import type { ActionContext } from "../lib/finder/types";
import { artVocab } from "../lib/finder/actions/artVocab";
import { findArt, buildSearchBody } from "../lib/finder/actions/findArt";
import { toFindParams, type Shelf } from "../lib/finder/shelf";
import { postJson } from "../lib/finder/fetchJson";

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
const artBase = env.ART_API_BASE || "https://api.artic.edu/api/v1";
const iiifBase = env.ART_IIIF_BASE || "https://www.artic.edu/iiif/2";
const ctx = (): ActionContext => ({ signal: AbortSignal.timeout(40_000), env: { artBase, iiifBase } });

const clip = (v: unknown, n: number) => {
  const s = JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n… (clipped)" : s;
};

/** findArt をフォーム shelf から回す（page と同じ toFindParams 経路）。 */
async function find(shelf: Shelf) {
  const params = toFindParams(shelf);
  const raw = await findArt.fetch(params, ctx());
  return { params, state: findArt.compute(raw, params) };
}

function show(label: string, state: Awaited<ReturnType<typeof find>>["state"]) {
  const head = state.artworks
    .slice(0, 6)
    .map((a) => `    ${(a.title ?? "").slice(0, 32).padEnd(32)} | ${a.artist.slice(0, 20).padEnd(20)} | ${a.type} | h=${a.hue ?? "-"} | img=${a.image ? "y" : "n"}`)
    .join("\n");
  console.log(
    `===== ${label} =====\n` +
      `  matched=${state.matchedCount} shown=${state.count} top='${state.topTitle ?? "-"}'\n` +
      (head ? `  top rows:\n${head}` : "  (no rows)"),
  );
}

/** 独立した直接クエリ（ground truth）。findArt と同じ body を投げて total と raw rows を見る。 */
async function direct(body: Record<string, unknown>) {
  const data = await postJson<{ pagination: { total: number }; data: any[] }>(
    `${artBase}/artworks/search`,
    body,
    ctx().signal,
  );
  return { total: data.pagination?.total ?? 0, rows: data.data ?? [] };
}

const ok = (b: boolean) => (b ? "PASS" : "FAIL");

console.log(`probe: artBase=${artBase}\n`);

// ① 語彙
try {
  const raw = await artVocab.fetch({}, ctx());
  const state = artVocab.compute(raw, {});
  console.log("===== ① artVocab (語彙) OK =====");
  console.log(`  AIC 総作品(疎通)=${raw.total} | types=${state.types.length} depts=${state.departments.length} hues=${state.hues.length}`);
  console.log(`  types: ${state.types.map((t) => `${t.slug}/${t.ja}`).join(", ")}`);
  console.log("  HINT:", clip(artVocab.describe(state), 700), "\n");
} catch (e) {
  console.log("===== ① artVocab FAILED =====\n", String(e), "\n");
}

// ②〜⑦ findArt の各経路
const cases: Array<{ label: string; shelf: Shelf }> = [
  { label: "② 単一ファセット 絵画", shelf: { type: { painting: true } } },
  { label: "③ ファセット内 OR 絵画 or 彫刻", shelf: { type: { painting: true, sculpture: true } } },
  { label: "④ ファセット間 AND 絵画 × ヨーロッパ部門", shelf: { type: { painting: true }, department: { europe: true } } },
  { label: "⑤ 年代 range 絵画 1900〜1950", shelf: { type: { painting: true }, yearFrom: 1900, yearTo: 1950 } },
  { label: "⑥ 色相 range 青い絵画(h=215)", shelf: { type: { painting: true }, hue: 215 } },
  { label: "⑦ 自由語 q=Monet × 絵画", shelf: { type: { painting: true }, q: "Monet" } },
];
const counts: Record<string, number> = {};
for (const c of cases) {
  try {
    const { params, state } = await find(c.shelf);
    counts[c.label] = state.matchedCount;
    show(c.label, state);
    console.log("  params:", JSON.stringify(params));
    console.log("  HINT:", clip(findArt.describe(state), 500), "\n");
  } catch (e) {
    console.log(`===== ${c.label} FAILED =====\n`, String(e), "\n");
  }
}

// ⑧ 出力 correctness（機構でなく“返った行が条件通りか”を実 AIC で検証＝§16 の教訓）
console.log("===== ⑧ 出力 correctness（返った行が条件を満たすか）=====");
try {
  // (a) 単一ファセット: 返り行は全て artwork_type_title=Painting か
  {
    const body = buildSearchBody(toFindParams({ type: { painting: true } }), 40);
    const { rows } = await direct(body);
    const allPainting = rows.every((r) => r.artwork_type_title === "Painting");
    console.log(`  (a) 絵画ファセット: 返り${rows.length}件すべて type=Painting → ${ok(allPainting)}`);
  }
  // (b) ファセット内 OR: 返り行は Painting か Sculpture のどちらか
  {
    const body = buildSearchBody(toFindParams({ type: { painting: true, sculpture: true } }), 40);
    const { rows } = await direct(body);
    const allInSet = rows.every((r) => r.artwork_type_title === "Painting" || r.artwork_type_title === "Sculpture");
    console.log(`  (b) OR(絵画/彫刻): 返り${rows.length}件すべて Painting|Sculpture → ${ok(allInSet)}`);
  }
  // (c) 年代 range: 返り行の date_start が 1900..1950
  {
    const body = buildSearchBody(toFindParams({ type: { painting: true }, yearFrom: 1900, yearTo: 1950 }), 40);
    const { rows } = await direct(body);
    const inRange = rows.every((r) => r.date_start != null && r.date_start >= 1900 && r.date_start <= 1950);
    console.log(`  (c) 年代1900-1950: 返り${rows.length}件すべて date_start∈[1900,1950] → ${ok(inRange)}`);
  }
  // (d) 色相 range: 返り行の color.h が h=215±18（青）に入る
  {
    const body = buildSearchBody(toFindParams({ type: { painting: true }, hue: 215 }), 40);
    const { rows } = await direct(body);
    const inHue = rows.every((r) => r.color && r.color.h >= 197 && r.color.h <= 233);
    console.log(`  (d) 色相215±18: 返り${rows.length}件すべて color.h∈[197,233] → ${ok(inHue)}`);
  }
  // (e) ファセット間 AND の単調性: count(絵画×欧州) <= count(絵画) かつ <= count(欧州)
  {
    const pe = (await find({ type: { painting: true }, department: { europe: true } })).state.matchedCount;
    const p = (await find({ type: { painting: true } })).state.matchedCount;
    const e = (await find({ department: { europe: true } })).state.matchedCount;
    console.log(`  (e) AND 単調性: 絵画×欧州(${pe}) <= 絵画(${p}) && <= 欧州(${e}) → ${ok(pe <= p && pe <= e)}`);
  }
  // (f) ファセット内 OR の範囲: max(絵画,彫刻) <= OR <= 絵画+彫刻
  {
    const p = (await find({ type: { painting: true } })).state.matchedCount;
    const s = (await find({ type: { sculpture: true } })).state.matchedCount;
    const orr = (await find({ type: { painting: true, sculpture: true } })).state.matchedCount;
    console.log(`  (f) OR 範囲: max(${p},${s})=${Math.max(p, s)} <= OR(${orr}) <= 和${p + s} → ${ok(Math.max(p, s) <= orr && orr <= p + s)}`);
  }
  // (g) 自由語は“絞る”（top-level q の並べ替えでなく multi_match の must）: Monet は絵画全件より遥かに小さく、Monet×彫刻=0
  {
    const all = (await find({ type: { painting: true } })).state.matchedCount;
    const monet = (await find({ type: { painting: true }, q: "Monet" })).state.matchedCount;
    const monetSculpt = (await find({ type: { sculpture: true }, q: "Monet" })).state.matchedCount;
    console.log(`  (g) 自由語フィルタ: Monet×絵画(${monet}) << 絵画(${all}) && Monet×彫刻(${monetSculpt})==0 → ${ok(monet < all / 5 && monetSculpt === 0)}`);
  }
} catch (e) {
  console.log("  ⑧ FAILED:", String(e));
}
console.log("");

// ⑨ 粒度/画像（H5）: 返り行は全て画像あり / 種別は粗粒度 artwork_type_title（"oil on canvas" 等の細粒度でない）
console.log("===== ⑨ 粒度・画像（H5: ボード汚染なし）=====");
try {
  const { state } = await find({ type: { painting: true }, hue: 215, limit: 24 } as Shelf);
  const allImg = state.artworks.every((a) => !!a.image);
  console.log(`  返り${state.artworks.length}件すべて画像URLあり（exists:image_id 効果）→ ${ok(allImg)}`);
  // 粗粒度の確認: 絵画ファセットの母集団が“絵画”の粗集合（数千件規模）であること（classification の 1000 規模でない）
  const p = (await find({ type: { painting: true } })).state.matchedCount;
  console.log(`  絵画(artwork_type_title=Painting)の母集団=${p} → ${ok(p > 2000)}（粗粒度を使えている）`);
} catch (e) {
  console.log("  ⑨ FAILED:", String(e));
}
console.log("");

// ⑩ 主題 subject（match subject_titles）: 返り行が主題タグを実際に持つ（§16 出力 correctness）
console.log("===== ⑩ 主題 subject（subject_titles を実際に絞る）=====");
try {
  const body = buildSearchBody(toFindParams({ type: { print: true }, subject: "portrait" }), 30);
  const { rows } = await direct(body);
  const hit = rows.filter(
    (r) => Array.isArray(r.subject_titles) && r.subject_titles.some((t: string) => /portrait/i.test(t)),
  ).length;
  console.log(`  版画×主題portrait: 返り${rows.length}件中 subject に portrait系 ${hit} 件 → ${ok(rows.length > 0 && hit >= rows.length * 0.7)}`);
  // q（作者/作品名）と subject（画題）の分離: 同語でも別フィールドを叩く＝件数が違ってよい
  const sub = (await find({ type: { painting: true }, subject: "landscape" })).state.matchedCount;
  const qq = (await find({ type: { painting: true }, q: "landscape" })).state.matchedCount;
  console.log(`  分離: 絵画×subject=landscape(${sub}) は 絵画×q=landscape(${qq}) と別経路で機能 → ${ok(sub > 0)}`);
} catch (e) {
  console.log("  ⑩ FAILED:", String(e));
}
console.log("");

// ⑪ 産地 region（place_of_origin・大陸展開）: 国レベルは literal 一致／大陸はサーバ展開で literal を遥かに超える
console.log("===== ⑪ 産地 region（国 match ＋ 大陸はサーバ展開）=====");
try {
  const { rows } = await direct(buildSearchBody(toFindParams({ region: "Japan" }), 30));
  const jpHit = rows.filter((r) => typeof r.place_of_origin === "string" && /japan/i.test(r.place_of_origin)).length;
  console.log(`  産地Japan: 返り${rows.length}件中 place=Japan ${jpHit} 件 → ${ok(rows.length > 0 && jpHit >= rows.length * 0.8)}`);
  const euExp = (await find({ type: { print: true }, region: "Europe" })).state.matchedCount;
  const euLit = (
    await direct({
      query: { bool: { must: [{ term: { "artwork_type_title.keyword": "Print" } }, { match: { place_of_origin: "Europe" } }, { exists: { field: "image_id" } }] } },
      limit: 0,
    })
  ).total;
  console.log(`  大陸展開 版画×Europe: 展開${euExp} >> literal "Europe"=${euLit} → ${ok(euExp > euLit * 5)}（§4 版画×地域を産地で忠実化）`);
} catch (e) {
  console.log("  ⑪ FAILED:", String(e));
}
console.log("");

// ⑫ クロスファセット OR（combineMode=or）: 包除原理が厳密に成立＝OR は“近似でなく本物”（§16 出力 correctness の核）
console.log("===== ⑫ クロスファセット OR（包除原理で本物だと検証）=====");
try {
  const A = (await find({ type: { painting: true } })).state.matchedCount;
  const B = (await find({ hue: 215 })).state.matchedCount;
  const AND = (await find({ type: { painting: true }, hue: 215 })).state.matchedCount;
  const OR = (await find({ type: { painting: true }, hue: 215, combineMode: "or" })).state.matchedCount;
  console.log(`  絵画(${A}) ∪ 青(${B}): OR=${OR} == A+B-AND(${A + B - AND}) → ${ok(OR === A + B - AND)}（OR は本物・近似でない）`);
  // 内容条件1つだけのとき combineMode=or は AND と同義（should に畳まれない安全弁）
  const single = (await find({ type: { painting: true }, combineMode: "or" })).state.matchedCount;
  console.log(`  単一条件で or 指定: 絵画のみ(${single}) == 絵画AND(${A}) → ${ok(single === A)}（OR は内容2件以上のときだけ）`);
} catch (e) {
  console.log("  ⑫ FAILED:", String(e));
}
console.log("");

// ⑬ 主題ランキング（§13 残課題の修正）: top-level q で「集合は不変・並びは主題関連度」になるか
console.log("===== ⑬ 主題ランキング（top-level q で並びを主題順に・集合は不変）=====");
try {
  const shelf: Shelf = { type: { painting: true }, subject: "water lilies" };
  const withQ = buildSearchBody(toFindParams(shelf), 12);
  const noQ: Record<string, unknown> = { ...withQ };
  delete noQ.q; // q を外した構造化クエリのみ
  const cWith = (await direct(withQ)).total;
  const cNo = (await direct(noQ)).total;
  console.log(`  (a) q は集合を絞らずランクのみ: q付き総数(${cWith}) == q無し総数(${cNo}) → ${ok(cWith === cNo)}`);
  const { rows } = await direct(withQ);
  const onSubj = rows.slice(0, 6).filter((r) => {
    const s = ((r.subject_titles ?? []).join(" ") + " " + (r.title ?? "")).toLowerCase();
    return /water|lil|nymph|pond/.test(s);
  }).length;
  console.log(`  (b) 主題ランク: 上位6件中 water/lily/Nymphaea/pond 系 ${onSubj} 件・top='${rows[0]?.title ?? "-"}' → ${ok(onSubj >= 4)}（人気順でなく主題順）`);
} catch (e) {
  console.log("  ⑬ FAILED:", String(e));
}
console.log("");
