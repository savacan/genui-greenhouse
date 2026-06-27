import type { TypeVocab, GenVocab } from "./actions/pokeTypes";

/**
 * exp03 の compose プロンプト = buildFormPrompt のみ:
 *   問い（or 指差し seedMon）→ LLM が「ファインダーフォーム」spec を組む（two-way 入力部品 + spec.state 初期選択）。
 *   語彙（タイプ/世代）は reference data なので**全部渡す**（型名・世代を発明させない）。ユーザーデータではないので firewall 対象外。
 *   「探す」は §12 で `/api/find`（LLM なし・計算のみ）に分離済み（旧 buildResultsPrompt は撤去）。
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
    `   種族値: ${seed.name} の目立つ軸（特に高い stat）があれば、その Slider を ${seed.name} の値より少し低い下限で初期 ON にし、sortBy も同じ軸にしてよい（任意・やり過ぎない）。`,
    `   includeForms は false（${seed.name} のような“普通のポケモン”の仲間を出す。メガ等は出さない）。`,
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
    `- タイプ: TypeCheckbox を必要なだけ並べる。各 checked は { "$bindState": "/shelf/type/<englishName>" }（<englishName> は下の語彙の name）。label に日本語名、color に下の色。**サーバは types を1つ以上必須**＝検索には最低1タイプの ON が要る（種族値や並べ替えだけでは検索できない）。`,
    `- タイプ条件（AND/OR）: タイプを2つ以上 ON にしうるなら Select 1つを置く。value は { "$bindState": "/shelf/typeMode" }。options は [{"value":"and","label":"すべてのタイプを持つ (AND)"},{"value":"or","label":"どれかのタイプを持つ (OR)"}]。and=複合一致（積集合）/ or=どれかを共有（和集合）。タイプが1つだけのフォームなら省略可（既定 and）。`,
    `- 世代（範囲）: Select 2つ。「世代（から）」value { "$bindState": "/shelf/genFrom" }、「世代（まで）」value { "$bindState": "/shelf/genTo" }。各 options は [{"value":null,"label":"指定なし"}, …下の世代] を value=数値 id で。単一世代は genFrom=genTo を同じ値に。`,
    `- 種族値: 問いに「素早さ高め」「火力」等が出たら該当軸の Slider を置く。value は { "$bindState": "/shelf/minStats/<stat>" }（stat = speed|attack|defense|hp|spAtk|spDef）。出ていない軸の Slider は置かない。`,
    `- 並べ替え: Select 1つ。value は { "$bindState": "/shelf/sortBy" }。options は [{"value":"total","label":"総合力"},{"value":"hp","label":"HP"},{"value":"attack","label":"こうげき"},{"value":"defense","label":"ぼうぎょ"},{"value":"spAtk","label":"とくこう"},{"value":"spDef","label":"とくぼう"},{"value":"speed","label":"すばやさ"}]。**問いが軸を強調していたら（「素早さ高め」「火力重視」等）その軸を初期 sortBy に**（下限 Slider と両方）。既定 total。`,
    `- 別形態トグル: Toggle 1つ（label「メガ・キョダイマックス等の特殊形態も含める」, checked { "$bindState": "/shelf/includeForms" }）。**既定 false（基本形態＝普通のポケモンだけ出す）**。問いに「メガ」「キョダイ」「特殊形態」等が明示されたときだけ初期 true。`,
    `- ActionButton 1つ（label「この条件で探す」, tone primary）。必ず on: { "click": { "action": "find" } }。`,
    `- フォームの下に「結果」リージョンを同じ画面に置く（探すと同じ画面で結果が live 更新される）: Heading「結果」＋ Kpi(label「該当」, value に {"$state":"/findMons/count"}) ＋ Kpi(label「候補」, value に {"$state":"/findMons/matchedCount"}, unit「件」) ＋ Text(muted, text に {"$template":"条件: \${/findMons/criteriaLabel}"}) ＋ Text(muted, text に {"$state":"/findMons/note"})（候補が極端に多い等の注意がここに出る・空なら何も出ない）＋ MonGrid(mons に {"$state":"/findMons/mons"})。/findMons は最初は空（MonGrid は空状態を出す）。「探す」を押すとサーバが値（該当・候補・注意・mons）を入れて更新される。**「候補」と注意は必ず置く**（候補＝条件に合った総数で、該当＝表示件数。OR や広いタイプで母集団がどれだけ広いかが見え、ランキングが何件から選ばれたかが分かる）。`,
    ``,
    `初期選択（重要）: 問いから読み取れる条件を spec.state.shelf に埋める（type の true・typeMode・genFrom・genTo・minStats・sortBy・includeForms）。フォームの初期表示がこの state を反映する。`,
    `  例a 「炎か飛行で素早さ高め」→ { "shelf": { "type": { "fire": true, "flying": true }, "typeMode": "or", "genFrom": null, "genTo": null, "minStats": { "speed": 100 }, "sortBy": "speed", "includeForms": false } }（「か」=OR・「素早さ高め」は下限＋並べ替え両方 speed）。`,
    `  例b 「鋼かつ飛行（複合タイプ）」→ { "shelf": { "type": { "steel": true, "flying": true }, "typeMode": "and", "genFrom": null, "genTo": null, "sortBy": "total", "includeForms": false } }（「かつ/複合」=AND）。`,
    `  例c 「第5世代以降の鋼」→ { "shelf": { "type": { "steel": true }, "typeMode": "and", "genFrom": 5, "genTo": null, "sortBy": "total", "includeForms": false } }（「以降」=下端だけ）。`,
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
    `  - API に無い概念（「かわいい」「レア」「かっこいい」「強い」等の主観語）: 対応する軸が無い＝**まだ表現できない**。→ タイプや種族値を勝手に確定（pre-check）しない（false / 未設定）。近いタイプを“提示”するのは可だが ON にはしない。Text で「『かわいい』は条件化できないので、近そうなタイプを任意で選んでください」と明示。`,
    `  - 能力/メタ述語（「メガシンカできる」「伝説級」「進化前」「タマゴ未発見」等）: findMons に対応フィルタが無い＝**表現できない**。**includeForms 等で黙ってすり替えない**（includeForms は「別形態を“結果に出す”」トグルであって「メガ進化“できる種”を絞る」ではない＝別物）。→ 関係ない属性を付けず、Text で「『メガシンカできる』は条件として絞れません」「『伝説級』は指定できません」と明示。`,
    `  - タイプが問いに無いとき（「速い」「壁」「かわいい」等の type なしクエリ）: サーバは types 必須なので**タイプ0のフォームを“探せる”ように見せない**（「タイプ未指定でも探せます」は嘘）。問いに沿う代表タイプがあれば1つ以上 ON にし、無ければ Text で「種族値だけでは検索できません。タイプを1つ以上選んでください」と促す。`,
    `  - 別形態の既定除外: 結果は既定で基本形態（普通のポケモン）だけ。メガ/キョダイ/特殊形態は includeForms トグルを ON にしたときだけ出る（黙って混ぜない）。「メガも見たい」と明示されたとき ON にする（能力フィルタの代用にはしない）。`,
    ``,
    `ルール: カタログにある部品だけ。計算はしない。パスは上の規律どおり（/shelf/...）。問いに対して過不足のないフォームにする（関係ないタイプを全部並べない・問いに沿ったものを優先して ON）。表現できる意図（AND/OR・範囲・下限）は的確に符号化、まだ表現できない意図（主観/メタ語）は中立＋Text 明示（黙って近似しない）。`,
  ].join("\n");
}
