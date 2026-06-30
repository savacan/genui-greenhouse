import type { TypeVocab, DeptVocab, HueVocab, SortVocab } from "./actions/artVocab";

/**
 * exp04 の compose プロンプト = buildFormPrompt:
 *   問い（or 指差し seed）→ LLM が「アート・ファインダーフォーム」spec を組む（two-way 入力部品 + spec.state 初期選択）。
 *   語彙（種別/部門/色相/並べ替え）は reference data なので**全部渡す**（slug を発明させない）。
 *   「探す」は §12 で `/api/find`（LLM なし・計算のみ）に分離済み。
 *
 * pokefinder §13/§16 の graceful 規律を AIC 版に移植 ＋ 線を太くした分の忠実化（§14b 同型）:
 *   - ファセット内 OR / ファセット間 AND の意味論
 *   - クロスファセット OR は combineMode=or で**表現できる**（黙って AND に倒さず or で忠実化）
 *   - 主題は subject（水辺=water 等）・産地は region（大陸はサーバ展開・版画も地域で絞れる）に忠実符号化
 *   - 主観/品質語（美しい・有名・傑作）と メタ述語（高価・盗難・贋作）は依然**表現できない**＝中立化＋Text 明示・proxy 禁止
 *   - 条件ゼロで「探せます」と見せない（種別/部門/年代/色/主題/産地/検索語の最低1つ）
 *   - AIC は英語データ＝作者名/作品名/主題/産地は英語・ローマ字で（「モネ」→Monet）
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
    `- 検索語（作者名・作品名だけ）: 作者名や作品名があれば TextInput 1つ。value { "$bindState": "/shelf/q" }。**作者名・作品名のみ**（主題や産地はここに入れない）。**英語/ローマ字で**（「モネ」→Monet・「葛飾北斎」→Hokusai）。`,
    `- 主題・画題（何が描かれているか／画風）: 主題に言及があれば TextInput 1つ。value { "$bindState": "/shelf/subject" }。**英語で**（「水辺」→water・「抽象」→abstract・「肖像」→portrait・「風景」→landscape・「静物」→still life・「動物」→animals・「宗教画」→religious）。作者でなく“描かれている題材”。初期 state /shelf/subject に英語で。`,
    `- 産地・地域: 地域/文化（ヨーロッパ・日本・フランス等）に言及があれば TextInput 1つ。value { "$bindState": "/shelf/region" }。**英語で**大陸名（Europe/Asia/Africa/Americas）か国名（France/Japan/Italy/China…）。サーバが大陸を代表国へ展開する。**版画・素描でも産地で絞れる**（部門と違い産地は種別を選ばない）。地域は基本この region を使い、部門(department)は所蔵分野（近代/現代/写真等）に使う。`,
    `- 展示中/PD: 必要なら Toggle。展示中のみ→checked { "$bindState": "/shelf/onView" }・パブリックドメインのみ→{ "$bindState": "/shelf/publicDomain" }（既定 false）。`,
    `- 並べ替え: Select 1つ。value { "$bindState": "/shelf/sortBy" }。options は下の sorts（relevance/newest/oldest）。「古い順」「新しい順」が問いにあれば初期値に。既定 relevance。`,
    `- 組み合わせ方（軸またぎの「または」のときだけ）: Select 1つ。value { "$bindState": "/shelf/combineMode" }。options=[{value:"and",label:"すべての条件"},{value:"or",label:"いずれかの条件"}]。既定 and。問いが種別と色・産地など**別の軸をまたいで「または」**で繋ぐとき（「絵画か、青い作品」）だけ "or" を初期値に。同じ軸の中の「AかB」（絵画か彫刻）は FacetCheckbox を両方 ON にするだけ＝combineMode は不要。`,
    `- ActionButton 1つ（label「この条件で探す」, tone primary）。必ず on: { "click": { "action": "find" } }。`,
    `- フォームの下に「結果」リージョンを同じ画面に置く（探すと同じ画面で結果が live 更新される）: Heading「結果」＋ Kpi(label「該当」, value {"$state":"/findArt/count"}) ＋ Kpi(label「候補」, value {"$state":"/findArt/matchedCount"}, unit「件」) ＋ Text(muted, text {"$template":"条件: \${/findArt/criteriaLabel}"}) ＋ Text(muted, text {"$state":"/findArt/note"}) ＋ ArtGrid(artworks {"$state":"/findArt/artworks"})。/findArt は最初は空（ArtGrid は空状態）。「探す」でサーバが値を入れて更新する。`,
    ``,
    `初期選択（重要）: 問いから読み取れる条件を spec.state.shelf に埋める（type/department の true・yearFrom/yearTo・hue・q・onView/publicDomain・sortBy）。フォーム初期表示がこの state を反映する。`,
    `  例a 「青っぽい近代の油彩」→ { "shelf": { "type": { "painting": true }, "hue": 215, "yearFrom": 1900, "yearTo": null, "sortBy": "relevance" } }（油彩=絵画・青=hue 215・近代=1900〜）。`,
    `  例b 「モネの絵」→ { "shelf": { "type": { "painting": true }, "q": "Monet" } }（作者は英語で q）。`,
    `  例c 「アジアの彫刻か陶磁」→ { "shelf": { "type": { "sculpture": true, "ceramics": true }, "department": { "asia": true } } }（種別内 OR・部門 AND）。`,
    `  例d 「水辺を描いた風景画」→ { "shelf": { "type": { "painting": true }, "subject": "water" } }（主題は英語で subject・作者でない）。`,
    `  例e 「ヨーロッパの版画」→ { "shelf": { "type": { "print": true }, "region": "Europe" } }（版画の地域は region＝産地で・地域部門は付けない）。`,
    `  例f 「絵画か、青い作品」→ { "shelf": { "type": { "painting": true }, "hue": 215, "combineMode": "or" } }（軸またぎの「または」は combineMode=or・対象条件を両方 state に）。`,
    ``,
    `★ 意図の忠実な符号化（最重要・サイレント縮約の禁止）: 黙って近似して意図を変えない。サーバが表現できるのは「種別/部門（ファセット内 OR・ファセット間 AND・combineMode=or で軸またぎ OR）・主題(subject)・産地(region・大陸はサーバ展開)・制作年範囲・色相・展示中/PD・自由語(作者/作品名)」:`,
    `  - 種別の取りこぼし禁止（問いが種別を含意したら必ず ON）: 「〜画」＝painting・「〜の彫刻」＝sculpture・「版画/浮世絵」＝print のように問いが種別を含意するなら、その FacetCheckbox を初期 state で **true** にする（Text で「絵画から始めるのがおすすめ」等と書くなら state も必ずそれに合わせる＝言行一致）。`,
    `  - 主題/画題の取りこぼし禁止（「水辺」「抽象」「肖像」「動物」等）: 描かれている題材は /shelf/subject に英語で入れる（黙って落とさない・主観語と混同しない＝「抽象」は subject=abstract で表現できる）。`,
    `  - 「〜画」複合語は**主題と種別の両取り**（取りこぼし厳禁）: 「抽象画」「風景画」「静物画」「肖像画」「人物画」等は **subject に主題（abstract/landscape/still life/portrait…）を入れ、かつ type=painting も必ず ON**（「〜画」の「画」＝絵画なので type=painting を落とさない）。片方だけにしない。`,
    `  - 「古い/新しい/最近」＝並べ替え（sortBy=oldest/newest）で表す。**具体的な年代語（「19世紀」「1900年以降」等）が無い限り yearFrom/yearTo を付けない**（特に yearTo=0 のような全件除外を作らない＝「とにかく古い」は sortBy=oldest だけ）。`,
    `  - 版画/素描の地域は**産地(/shelf/region)で絞る**（地域部門でなく）: 版画・素描は専用部門「版画・素描」にあり地域部門(europe 等)には入らない＝種別=版画 と 地域部門 の AND は 0 件になりうる。地域で絞りたいときは**地域部門を付けず /shelf/region に地域名（英語）を入れる**＝産地は種別を選ばないので「ヨーロッパの版画」も忠実に表現できる（地域部門は版画には使わない）。`,
    `  - ファセット内 OR（「絵画か彫刻」「アジアかアフリカ」）: 同じファセットで両方 ON。これは表現できる（どれかに一致）。`,
    `  - ファセット間 AND（「アジアの絵画」=部門 asia かつ 種別 painting）: 別ファセットを両方指定。これも表現できる。`,
    `  - クロスファセット OR（「絵画 “または” 青い作品」のように**別の軸をまたいだ「または」**）: **combineMode=or で表現できる**（内容条件を“いずれか一致”にする）。問いが軸またぎの「または」なら /shelf/combineMode を "or" にし、対象の条件を両方 state に入れる。ただし combineMode は全内容条件にかかる大域フラグ＝AND が本意なら付けない（既定 and・黙って OR に倒さない）。`,
    `  - 制作年範囲（「19世紀」「1850年以降」「古いもの」）: yearFrom/yearTo で忠実に（「古い順/新しい順」は sortBy）。`,
    `  - **主観/メタ語と客観語が同居する複合句**（「高価な絵画」「有名な彫刻」「美しい風景画」等）＝最重要: 主観/メタ語を中立化しても、**同居する表現可能な客観語（種別/主題/産地/年代/色）は必ず符号化する**。例「高価な絵画」→『高価』は中立化＋Text 明示しつつ **type=painting は必ず ON**。主観語があることを理由に客観条件まで落として条件ゼロ（検索不能）にしない（＝中立化の巻き添えで表現可能な意図を捨てない）。`,
    `  - 主観・品質語（「美しい」「有名」「傑作」「すごい」等）が**単独で**現れ客観語が無いとき: 対応する軸が無い＝**表現できない**。→ 種別や色を勝手に**発明**しない。Text で「『有名』は条件化できません」と明示し、関連しそうな客観条件（種別・部門・年代）があれば任意で選べる形にする。`,
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
    `ルール: カタログにある部品だけ。計算はしない。パスは上の規律どおり（/shelf/...）。問いに対して過不足のないフォームにする（関係ないファセットを全部出さない・問いに沿うものを優先 ON）。表現できる意図は的確に符号化（軸またぎ OR は combineMode=or・地域は region・主題は subject）、できない意図（主観/品質・メタ語）は中立＋Text 明示（黙って近似しない）。`,
  ].join("\n");
}
