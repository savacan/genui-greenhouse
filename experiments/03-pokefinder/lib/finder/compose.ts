import type { StateHint } from "./types";
import type { TypeVocab, GenVocab } from "./actions/pokeTypes";

/**
 * exp03 の compose プロンプト。2モード:
 *  - buildFormPrompt : 問い → LLM が「ファインダーフォーム」spec を組む（two-way 入力部品 + spec.state 初期選択）。
 *    語彙（タイプ/世代）は reference data なので**全部渡す**（型名・世代を発明させない）。これはユーザーデータでは
 *    ないのでファイアウォールの対象外。
 *  - buildResultsPrompt : 「探す」→ findMons の hint（パス・件数のみ）で結果ボードを組む。
 *    生 mons 配列は渡さず /findMons/mons パスだけ（01/02 と同じ data→prompt ファイアウォール）。
 */

/** §14 起点ポケモン（結果カードを指差して再 compose する種）。client が持っている値をそのまま渡す（再フェッチしない）。 */
export type SeedMon = {
  name: string;
  types: string[];
  stats: { hp: number; attack: number; defense: number; spAtk: number; spDef: number; speed: number };
};

/**
 * route は信頼できない body を受ける境界。seedMon を厳格に検証＆正規化する（不正なら null → 通常フォームへフォールバック）。
 * stats は欠落しても 0 で埋めるので seedSection の参照が TypeError にならない（不正 seed の無言クラッシュを防ぐ）。
 */
export function parseSeedMon(raw: unknown): SeedMon | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) return null;
  const types = Array.isArray(r.types) ? r.types.filter((t): t is string => typeof t === "string") : [];
  if (!types.length) return null;
  const s = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    name: r.name,
    types,
    stats: { hp: num(s.hp), attack: num(s.attack), defense: num(s.defense), spAtk: num(s.spAtk), spDef: num(s.spDef), speed: num(s.speed) },
  };
}

/** seedMon があるとき、フォーム冒頭に置く「似た＝OR の罠」セクション（§13 と同型の graceful 規律を指差し起点でも適用）。 */
function seedSection(seed: SeedMon, types: TypeVocab[]): string {
  const jaOf = (n: string) => types.find((t) => t.name === n)?.ja ?? n;
  const tList = seed.types.map((t) => `${jaOf(t)}(${t})`).join("・");
  const s = seed.stats;
  const statStr = `HP${s.hp} / こうげき${s.attack} / ぼうぎょ${s.defense} / とくこう${s.spAtk} / とくぼう${s.spDef} / すばやさ${s.speed}`;
  return [
    `★ 起点ポケモン（ユーザーが結果カードをクリックして“指差した”・テキストでない入力）: ${seed.name}`,
    `   タイプ: ${tList} / 種族値: ${statStr}`,
    `この起点を足がかりに『${seed.name} に似た相棒』を探すフォームを組む。ユーザーは結果から1匹を指して「これに似たのを」と求めている。`,
    seed.types.length >= 2
      ? `★ 「似た」の符号化（忠実に）: 「似た」は多くの場合「${seed.name} の${seed.types.length}タイプのどれかを共有する」= OR。サーバは typeMode="or" で和集合を表現できる。→ ${seed.name} の各タイプ（${tList}）を TypeCheckbox で全部 ON にし、typeMode="or" の Select も置いて初期 "or"。これで「どれかのタイプを共有する仲間」が出る（黙って AND=複合一致に潰さない）。Text(muted) で「『似た』を“${tList} のどれかを持つ”(OR)で探しています。typeMode を AND に切り替えると『${seed.name} と同じ複合タイプ』だけに絞れます」と両方の読みを明示。`
      : `   → 単タイプ（${tList}）なのでそのタイプを ON・typeMode は and のままでよい。`,
    `   種族値: ${seed.name} の目立つ軸（特に高い stat）があれば、その Slider を ${seed.name} の値より少し低い下限で初期 ON にしてよい（任意・やり過ぎない）。`,
    ``,
  ].join("\n");
}

export function buildFormPrompt(query: string, types: TypeVocab[], generations: GenVocab[], seed?: SeedMon | null): string {
  const typeLines = types.map((t) => `    ${t.name} = ${t.ja} (color ${t.color})`).join("\n");
  const genLines = generations.map((g) => `    ${g.id} = ${g.ja}`).join("\n");
  return [
    `ユーザーの問い: "${query}"`,
    `この問いに答えるための「ポケモン相棒ファインダー」の入力フォームを組む。ユーザーがこのフォームを操作して条件を決め、最後に「探す」を押すとサーバが検索する。`,
    ``,
    ...(seed ? [seedSection(seed, types)] : []),
    `使う部品と two-way バインドの規律（必ず守る）:`,
    `- タイプ: TypeCheckbox を必要なだけ並べる。各 checked は { "$bindState": "/shelf/type/<englishName>" }（<englishName> は下の語彙の name）。label に日本語名、color に下の色。`,
    `- タイプ条件（AND/OR）: タイプを2つ以上 ON にしうるなら Select 1つを置く。value は { "$bindState": "/shelf/typeMode" }。options は [{"value":"and","label":"すべてのタイプを持つ (AND)"},{"value":"or","label":"どれかのタイプを持つ (OR)"}]。and=複合一致（積集合）/ or=どれかを共有（和集合）。タイプが1つだけのフォームなら省略可（既定 and）。`,
    `- 世代（範囲）: Select 2つ。「世代（から）」value { "$bindState": "/shelf/genFrom" }、「世代（まで）」value { "$bindState": "/shelf/genTo" }。各 options は [{"value":null,"label":"指定なし"}, …下の世代] を value=数値 id で。単一世代は genFrom=genTo を同じ値に。`,
    `- 種族値: 問いに「素早さ高め」「火力」等が出たら該当軸の Slider を置く。value は { "$bindState": "/shelf/minStats/<stat>" }（stat = speed|attack|defense|hp|spAtk|spDef）。出ていない軸の Slider は置かない。`,
    `- ActionButton 1つ（label「この条件で探す」, tone primary）。必ず on: { "click": { "action": "find" } }。`,
    `- フォームの下に「結果」リージョンを同じ画面に置く（探すと同じ画面で結果が live 更新される）: Heading「結果」＋ Kpi(label「該当」, value に {"$state":"/findMons/count"}) ＋ Kpi(label「候補」, value に {"$state":"/findMons/matchedCount"}, unit「件」) ＋ Text(muted, text に {"$template":"条件: \${/findMons/criteriaLabel}"}) ＋ Text(muted, text に {"$state":"/findMons/note"})（候補が極端に多い等の注意がここに出る・空なら何も出ない）＋ MonGrid(mons に {"$state":"/findMons/mons"})。/findMons は最初は空（MonGrid は空状態を出す）。「探す」を押すとサーバが値（該当・候補・注意・mons）を入れて更新される。**「候補」と注意は必ず置く**（候補＝条件に合った総数で、該当＝表示件数。OR や広いタイプで母集団がどれだけ広いかが見え、ランキングが何件から選ばれたかが分かる）。`,
    ``,
    `初期選択（重要）: 問いから読み取れる条件を spec.state.shelf に埋める（type の true・typeMode・genFrom・genTo・minStats）。フォームの初期表示がこの state を反映する。`,
    `  例a 「炎か飛行で素早さ高め」→ { "shelf": { "type": { "fire": true, "flying": true }, "typeMode": "or", "genFrom": null, "genTo": null, "minStats": { "speed": 100 } } }（「か」=OR）。`,
    `  例b 「鋼かつ飛行（複合タイプ）」→ { "shelf": { "type": { "steel": true, "flying": true }, "typeMode": "and", "genFrom": null, "genTo": null } }（「かつ/複合」=AND）。`,
    `  例c 「第5世代以降の鋼」→ { "shelf": { "type": { "steel": true }, "typeMode": "and", "genFrom": 5, "genTo": null } }（「以降」=下端だけ）。`,
    ``,
    `レイアウト: Card でセクション分け（タイプ / 世代 / 種族値）。タイプの TypeCheckbox 群は Stack direction=horizontal wrap=true。見出しに Heading。`,
    ``,
    `タイプ語彙（name を $bindState のパスに使う・発明しない）:`,
    typeLines,
    `世代語彙:`,
    genLines,
    ``,
    `★ 意図の忠実な符号化（最重要・サイレント縮約の禁止）: 黙って近似して意図を変えない。サーバは「タイプの AND/OR・世代範囲・種族値の下限」を表現できる:`,
    `  - OR（「AかB」「AまたはB」「どちらか」）: typeMode="or" にして両タイプを ON。**黙って AND に倒さない**（OR→AND は意図反転）。逆に「AかつB」「複合」「両方とも」「A/B タイプ」は typeMode="and"。どちらとも取れる曖昧な問いは and を既定にしつつ Text(muted) で「『〜』は AND/OR どちらにも取れます。タイプ条件で切り替えできます」と一言添える。`,
    `  - 範囲（「N世代以降」「〜まで」「N〜M世代」）: genFrom/genTo で忠実に（「以降」=genFrom のみ・「まで」=genTo のみ・「N〜M」=両方）。単一値に切り詰めない。`,
    `  - API に無い概念（「かわいい」「伝説級」「レア」「かっこいい」「強い」等の主観/メタ語）: 対応する軸が無い＝**まだ表現できない**。→ タイプや種族値を勝手に確定（pre-check）しない（false / 未設定）。近いタイプを“提示”するのは可だが ON にはしない。Text で「『かわいい』は条件化できないので、近そうなタイプを任意で選んでください」と明示。`,
    `  - OR の注意（任意・過剰にしない）: OR は候補が多くなり、サーバは上位 N 件だけ種族値評価する＝「最強」ランキングは近似になりうる。種族値の下限/並べ替えと併用するなら Text で軽く触れてよい。`,
    ``,
    `ルール: カタログにある部品だけ。計算はしない。パスは上の規律どおり（/shelf/...）。問いに対して過不足のないフォームにする（関係ないタイプを全部並べない・問いに沿ったものを優先して ON）。表現できる意図（AND/OR・範囲・下限）は的確に符号化、まだ表現できない意図（主観/メタ語）は中立＋Text 明示（黙って近似しない）。`,
  ].join("\n");
}

export function buildResultsPrompt(criteriaLabel: string, hint: StateHint, originalQuery: string): string {
  const paths = hint.paths
    .map((p) => `    ${p.path} : ${p.type} — ${p.note}${p.sample ? ` (${p.sample})` : ""}`)
    .join("\n");
  const notes = hint.notes?.length ? `\n  注意:\n${hint.notes.map((n) => "    - " + n).join("\n")}` : "";
  return [
    `検索条件: ${criteriaLabel}`,
    `サーバが条件に合うポケモンを計算した。${hint.summary}`,
    `この結果ボードを組む。次の $state パスにだけ {"$state":"/path"} でバインドする（パスを発明しない・生値を埋めない）:`,
    paths,
    notes,
    ``,
    `構成: 上部に Heading（条件の要約）と件数（Kpi に /findMons/count）。本体は MonGrid に /findMons/mons をそのままバインド（生のまま・整形しない）。`,
    `0件なら MonGrid を出さず Text で空状態（条件をゆるめる助言）。`,
    `末尾に ActionButton 1つ（label「別の条件でさがす」）。on: { "click": { "action": "ask", "params": { "query": ${JSON.stringify(originalQuery)} } } }。`,
    ``,
    `表示整形: 数値の桁が要るときだけ $format（MonGrid の mons は生のまま）。`,
    `ルール: カタログにある部品だけ。計算はしない。`,
  ]
    .filter(Boolean)
    .join("\n");
}
