import type { TypeVocab, DeptVocab, HueVocab, SortVocab } from "./actions/artVocab";

/**
 * exp04 の compose プロンプト = buildFormPrompt:
 *   問い（or 指差し seed）→ LLM が「アート・ファインダーフォーム」spec を組む（two-way 入力部品 + spec.state 初期選択）。
 *   語彙（種別/部門/色相/並べ替え）は reference data なので**全部渡す**（slug を発明させない）。
 *   「探す」は §12 で `/api/find`（LLM なし・計算のみ）に分離済み。
 *
 * pokefinder §13/§16 の graceful 規律を AIC 版に移植:
 *   - ファセット内 OR / ファセット間 AND の意味論、表現できないクロスファセット OR の開示
 *   - 主観/品質語（美しい・有名・傑作）は中立化＋Text 明示（黙って近似しない）
 *   - 能力/メタ述語（高価・盗難・贋作・「メガできる」相当）は表現できない＝Text 明示・proxy 禁止
 *   - 条件ゼロで「探せます」と見せない（種別/部門/年代/色/検索語の最低1つ）
 *   - AIC は英語データ＝作者名/主題は英語・ローマ字で（「モネ」→Monet）
 */

export type SeedArt = {
  title: string;
  artist: string;
  type: string; // artwork_type_title（英・例 "Painting"）
  hue: number | null;
};

/** route は信頼できない body を受ける境界。seed を厳格に検証＆正規化（不正なら null → 通常フォーム）。 */
export function parseSeedArt(raw: unknown): SeedArt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const artist = str(r.artist);
  const title = str(r.title);
  if (!artist && !title) return null;
  const hue = typeof r.hue === "number" && Number.isFinite(r.hue) ? r.hue : null;
  return { title, artist, type: str(r.type), hue };
}

function seedSection(seed: SeedArt): string {
  return [
    `★ 起点作品（ユーザーが結果カードをクリックして“指差した”・テキストでない入力）: 「${seed.title}」 / 作者: ${seed.artist}${seed.type ? ` / 種別: ${seed.type}` : ""}${seed.hue != null ? ` / 主要色相: ${seed.hue}` : ""}`,
    `この起点を足がかりに『この作品に似た作品』を探すフォームを組む。ユーザーは結果から1点を指して「これに似たのを」と求めている。`,
    `★ 「似た」の符号化（忠実に）: 「似た」は多義なので、最も自然な軸を初期 ON にしつつ、ユーザーが他軸に変えられる形にする:`,
    seed.artist && seed.artist !== "作者不詳"
      ? `   - 同じ作者: TextInput(/shelf/q) に "${seed.artist}"（英語名）を初期値で入れる（同作者の作品が出る）。`
      : `   - 作者不詳なので作者では絞らない。`,
    seed.type ? `   - 同じ種別: その種別の FacetCheckbox を初期 ON にしてよい。` : ``,
    seed.hue != null ? `   - 近い色: ColorSwatch 群を出し、起点の色相(${seed.hue})に最も近い色を初期選択にしてよい（任意）。` : ``,
    `   Text(muted) で「『似た』を“同じ作者/近い色/同じ種別”で解釈しました。条件は自由に変えられます」と明示。やり過ぎない（全部 ON にしない）。`,
    ``,
  ].filter(Boolean).join("\n");
}

export function buildFormPrompt(
  query: string,
  types: TypeVocab[],
  departments: DeptVocab[],
  hues: HueVocab[],
  sorts: SortVocab[],
  seed?: SeedArt | null,
): string {
  const typeLines = types.map((t) => `    ${t.slug} = ${t.ja}`).join("\n");
  const deptLines = departments.map((d) => `    ${d.slug} = ${d.ja}`).join("\n");
  const hueLines = hues.map((h) => `    ${h.slug} = ${h.ja} (hue ${h.h}, swatch ${h.swatch})`).join("\n");
  const sortLines = sorts.map((s) => `    ${s.value} = ${s.ja}`).join("\n");
  return [
    `ユーザーの問い: "${query}"`,
    `この問いに答えるための「Art Institute of Chicago 作品ファインダー」の入力フォームを組む。ユーザーがこのフォームを操作して条件を決め、最後に「探す」を押すとサーバが AIC を検索する。`,
    ``,
    ...(seed ? [seedSection(seed)] : []),
    `使う部品と two-way バインドの規律（必ず守る）:`,
    `- 種別: FacetCheckbox を並べる。checked は { "$bindState": "/shelf/type/<slug>" }（<slug> は下の語彙）。label に日本語名。同じ種別ファセットで複数 ON = そのどれか（OR）。`,
    `- 部門: FacetCheckbox。checked は { "$bindState": "/shelf/department/<slug>" }。問いに地域/文化（ヨーロッパ・アジア等）が出たとき。`,
    `- 制作年: RangeSelect 1つ。from { "$bindState": "/shelf/yearFrom" }・to { "$bindState": "/shelf/yearTo" }（西暦・紀元前は負数）。「N年以降」=from のみ・「〜M年」=to のみ・「N〜M年」=両方。問いに年代/時代（「近代」「19世紀」等）が出たら埋める。`,
    `- 色: 色に言及があれば（「青っぽい」「暖色」等）ColorSwatch を語彙ぶん並べる。各 hue/swatch は下の語彙、value は全 swatch 共通で { "$bindState": "/shelf/hue" }。問いの色に当たる swatch の hue を初期 state /shelf/hue に入れる。色の話が無ければ色セクションは省略可。`,
    `- 検索語（作者名・主題）: TextInput 1つ。value { "$bindState": "/shelf/q" }。**AIC は英語データなので作者名・主題語は英語/ローマ字で**（「モネ」→Monet・「葛飾北斎」→Hokusai）。問いに固有名詞/主題があれば初期 state /shelf/q に英語で入れる。`,
    `- 展示中/PD: 必要なら Toggle。展示中のみ→checked { "$bindState": "/shelf/onView" }・パブリックドメインのみ→{ "$bindState": "/shelf/publicDomain" }（既定 false）。`,
    `- 並べ替え: Select 1つ。value { "$bindState": "/shelf/sortBy" }。options は下の sorts（relevance/newest/oldest）。「古い順」「新しい順」が問いにあれば初期値に。既定 relevance。`,
    `- ActionButton 1つ（label「この条件で探す」, tone primary）。必ず on: { "click": { "action": "find" } }。`,
    `- フォームの下に「結果」リージョンを同じ画面に置く（探すと同じ画面で結果が live 更新される）: Heading「結果」＋ Kpi(label「該当」, value {"$state":"/findArt/count"}) ＋ Kpi(label「候補」, value {"$state":"/findArt/matchedCount"}, unit「件」) ＋ Text(muted, text {"$template":"条件: \${/findArt/criteriaLabel}"}) ＋ Text(muted, text {"$state":"/findArt/note"}) ＋ ArtGrid(artworks {"$state":"/findArt/artworks"})。/findArt は最初は空（ArtGrid は空状態）。「探す」でサーバが値を入れて更新する。`,
    ``,
    `初期選択（重要）: 問いから読み取れる条件を spec.state.shelf に埋める（type/department の true・yearFrom/yearTo・hue・q・onView/publicDomain・sortBy）。フォーム初期表示がこの state を反映する。`,
    `  例a 「青っぽい近代の油彩」→ { "shelf": { "type": { "painting": true }, "hue": 215, "yearFrom": 1900, "yearTo": null, "sortBy": "relevance" } }（油彩=絵画・青=hue 215・近代=1900〜）。`,
    `  例b 「モネの絵」→ { "shelf": { "type": { "painting": true }, "q": "Monet" } }（作者は英語で q）。`,
    `  例c 「アジアの彫刻か陶磁」→ { "shelf": { "type": { "sculpture": true, "ceramics": true }, "department": { "asia": true } } }（種別内 OR・部門 AND）。`,
    ``,
    `★ 意図の忠実な符号化（最重要・サイレント縮約の禁止）: 黙って近似して意図を変えない。サーバが表現できるのは「種別/部門の選択（ファセット内 OR・ファセット間 AND）・制作年範囲・色相・展示中/PD・自由語」だけ:`,
    `  - 種別の取りこぼし禁止（問いが種別を含意したら必ず ON）: 「〜画」＝painting・「〜の彫刻」＝sculpture・「版画/浮世絵」＝print のように問いが種別を含意するなら、その FacetCheckbox を初期 state で **true** にする（Text で「絵画から始めるのがおすすめ」等と書くなら state も必ずそれに合わせる＝言行一致）。`,
    `  - 「古い/新しい/最近」＝並べ替え（sortBy=oldest/newest）で表す。**具体的な年代語（「19世紀」「1900年以降」等）が無い限り yearFrom/yearTo を付けない**（特に yearTo=0 のような全件除外を作らない＝「とにかく古い」は sortBy=oldest だけ）。`,
    `  - 版画/素描 × 地域部門の落とし穴（AIC のデータ構造）: 版画・素描は専用部門「版画・素描(Prints and Drawings)」にあり、「ヨーロッパ絵画・彫刻(europe)」等の地域部門には**入らない**。＝種別=版画/素描 と 地域部門(europe/americas/asia/africa) の AND は **0 件になりうる**。版画で地域を絞りたいときは**地域部門を付けず**、Text で「版画には地域別の部門が無いため『ヨーロッパ』では絞れません（作者名や主題を英語で指定してください）」と明示する（部門 prints は“版画”の種別と重複するので使わなくてよい）。`,
    `  - ファセット内 OR（「絵画か彫刻」「アジアかアフリカ」）: 同じファセットで両方 ON。これは表現できる（どれかに一致）。`,
    `  - ファセット間 AND（「アジアの絵画」=部門 asia かつ 種別 painting）: 別ファセットを両方指定。これも表現できる。`,
    `  - クロスファセット OR（「絵画 “または” ヨーロッパ部門のもの」のように種別と部門をまたいだ OR）: **表現できない**（サーバは別ファセット間は AND のみ）。→ 黙って AND にも片方にも倒さず、Text で「種別と部門をまたいだ『または』は指定できません。どちらか主たる条件で絞ってください」と明示。`,
    `  - 制作年範囲（「19世紀」「1850年以降」「古いもの」）: yearFrom/yearTo で忠実に（「古い順/新しい順」は sortBy）。`,
    `  - 主観・品質語（「美しい」「有名」「傑作」「すごい」等）: 対応する軸が無い＝**表現できない**。→ 種別や色を勝手に確定しない。Text で「『有名』は条件化できません」と明示し、関連しそうな客観条件（種別・部門・年代）があれば任意で選べる形にする。`,
    `  - 能力/メタ述語（「高価な」「盗まれた」「贋作」「修復された」等）: フィルタが無い＝**表現できない**。**別の軸（展示中など）で黙ってすり替えない**。Text で「『高価』は条件として絞れません」と明示。`,
    `  - 条件が何も取れないとき（純粋に主観語だけ等）: サーバは最低1条件（種別/部門/年代/色/検索語）が必要なので**条件ゼロのフォームを“探せる”ように見せない**。問いに沿う客観条件を1つ以上促し、無ければ Text で「種別・年代・色・作者名のいずれかを指定してください」と促す。`,
    ``,
    `語彙（slug/値を $bindState のパスや初期 state に使う・発明しない）:`,
    `種別 type（/shelf/type/<slug>）:`,
    typeLines,
    `部門 department（/shelf/department/<slug>）:`,
    deptLines,
    `色相 hue（ColorSwatch の hue/swatch・初期 /shelf/hue にはこの hue 数値）:`,
    hueLines,
    `並べ替え sortBy（/shelf/sortBy）:`,
    sortLines,
    ``,
    `レイアウト: Card でセクション分け（種別 / 部門 / 年代 / 色 / 検索語）。FacetCheckbox 群・ColorSwatch 群は Stack direction=horizontal wrap=true。見出しに Heading。`,
    `ルール: カタログにある部品だけ。計算はしない。パスは上の規律どおり（/shelf/...）。問いに対して過不足のないフォームにする（関係ないファセットを全部出さない・問いに沿うものを優先 ON）。表現できる意図は的確に符号化、できない意図（クロスファセット OR・主観/メタ語）は中立＋Text 明示（黙って近似しない）。`,
  ].join("\n");
}
