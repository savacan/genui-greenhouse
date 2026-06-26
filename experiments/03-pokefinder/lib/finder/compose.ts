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

export function buildFormPrompt(query: string, types: TypeVocab[], generations: GenVocab[]): string {
  const typeLines = types.map((t) => `    ${t.name} = ${t.ja} (color ${t.color})`).join("\n");
  const genLines = generations.map((g) => `    ${g.id} = ${g.ja}`).join("\n");
  return [
    `ユーザーの問い: "${query}"`,
    `この問いに答えるための「ポケモン相棒ファインダー」の入力フォームを組む。ユーザーがこのフォームを操作して条件を決め、最後に「探す」を押すとサーバが検索する。`,
    ``,
    `使う部品と two-way バインドの規律（必ず守る）:`,
    `- タイプ: TypeCheckbox を必要なだけ並べる。各 checked は { "$bindState": "/shelf/type/<englishName>" }（<englishName> は下の語彙の name）。label に日本語名、color に下の色。複数 ON は AND 条件。`,
    `- 世代: Select 1つ。value は { "$bindState": "/shelf/generationId" }。options は [{"value":null,"label":"全世代"}, …下の世代] を value=数値 id で。`,
    `- 種族値: 問いに「素早さ高め」「火力」等が出たら該当軸の Slider を置く。value は { "$bindState": "/shelf/minStats/<stat>" }（stat = speed|attack|defense|hp|spAtk|spDef）。出ていない軸の Slider は置かない。`,
    `- ActionButton 1つ（label「この条件で探す」, tone primary）。必ず on: { "click": { "action": "find" } }。`,
    `- フォームの下に「結果」リージョンを同じ画面に置く（探すと同じ画面で結果が live 更新される）: Heading「結果」＋ Kpi(label「該当」, value に {"$state":"/findMons/count"}) ＋ Text(muted, text に {"$template":"条件: \${/findMons/criteriaLabel}"}) ＋ MonGrid(mons に {"$state":"/findMons/mons"})。/findMons は最初は空（MonGrid は空状態を出す）。「探す」を押すとサーバが値を入れて MonGrid が更新される。`,
    ``,
    `初期選択（重要）: 問いから読み取れる条件を spec.state に埋める。`,
    `  例: 問いが「炎か飛行で素早さ高め」なら state: { "shelf": { "type": { "fire": true, "flying": true }, "generationId": null, "minStats": { "speed": 100 } } }。`,
    `  spec.state.shelf に、ON にするタイプ（true）・generationId・minStats を入れる。フォームの初期表示がこの state を反映する。`,
    ``,
    `レイアウト: Card でセクション分け（タイプ / 世代 / 種族値）。タイプの TypeCheckbox 群は Stack direction=horizontal wrap=true。見出しに Heading。`,
    ``,
    `タイプ語彙（name を $bindState のパスに使う・発明しない）:`,
    typeLines,
    `世代語彙:`,
    genLines,
    ``,
    `ルール: カタログにある部品だけ。計算はしない。パスは上の規律どおり（/shelf/...）。問いに対して過不足のないフォームにする（関係ないタイプを全部並べない・問いに沿ったものを優先して ON）。`,
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
