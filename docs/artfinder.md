# exp04 artfinder — 別題材で「役割反転（双方向入力UI）」をもう1本

> ステータス凡例: ✅ 検証済 / 🔬 recon 済（実 API） / ⬜ 未着手。
> 設計・実施ログの正本はこの docs。方針は README / CLAUDE.md。

## 0. この実験が動かす唯一の変数（取り違えない）

exp03 pokefinder で**核の問い「LLM は two-way 入力フォームを組めるか」は §16 で YES 確定**した。残る破綻は全て**サーバ側**（クエリ言語の表現力・実装の堅牢性・データソースの質）に収束した＝exp02「線の幅↔射程」と同型。

exp04 は **同じ finder アーキタイプ・同じ役割（入力UIを組む）のまま、題材だけ Art Institute of Chicago（AIC）に替える**。狙いは「§16 の結論（伸びしろはサーバ側）が、別ドメイン・別のクエリ形でも立つか」を確かめること。pokefinder と決定的に違うのは、**上流（AIC）が豊かな Elasticsearch クエリ DSL を最初から持つ**点。だから「線の幅」は自前 `findMons` の表現力でなく、**上流 DSL ＋ 我々のサーバの form→DSL 翻訳忠実度**に移る。これが新しい検証面。

| | 03 pokefinder | 04 artfinder |
|---|---|---|
| GenUI の役割 | 入力UIを組む（two-way） | 同（不変＝写経で固定） |
| 題材 | ポケモン（タイプ×世代×種族値） | **AIC 所蔵作品**（分類×年代×色×部門×自由語） |
| サーバの射程 | 自前 findMons（積集合を手で計算） | **上流 ES DSL への翻訳器**（bool/range/term/match） |
| 入力モダリティ | チェック/セレクト/スライダ | ＋**色相スウォッチ（視覚）**・**自由テキスト** |

**核（観察装置として残す）**: 役割は固定。題材交換で新たに開く面＝下の H1–H5 が観察対象。

## 0.1 検証する仮説（H1–H5）

- **H1（再確認）**: LLM は別ドメインでも two-way 入力フォームを正しく組める。
- **H2（新・入力モダリティ）**: **連続/視覚的な入力＝色相スウォッチ**を two-way で組めるか。加えて**自由テキスト入力**（artist/keyword）を state バインドできるか（pokefinder に無い部品型）。
- **H3（新・本命）**: 上流が豊かな DSL を持つとき、load-bearing リスクは**サーバの form→ES 翻訳忠実度**（`term` は `.keyword` 必須等の operator-per-field の fiddliness）に移る。§16「伸びしろ＝サーバ射程/堅牢性」が別構成でも立つか。
- **H4（再確認/拡張）**: 表現不能語（「美しい」「有名」等の主観・品質語）の graceful 明示（§13/§16）。さらに**ファセット内 OR ↔ ファセット間 AND**の既定意味論（pokefinder の typeMode と別形）と、それで表現できない**クロスファセット OR** の開示。
- **H5（新）**: §15「フォーム汚染＝データ粒度」の転移。画像なし作品・非パブリックドメイン・重複/別エディションがボードを汚さないよう、**サーバが正しい粒度に正規化**するか。

## 1. 体験（問い → LLM がフォームを組む → 操作 → 結果）

```
入力「青っぽい近代の油彩、有名なやつ」
  → ① 単発 compose（pokefinder §10/§12 と同型）: LLM が「アート・ファインダーフォーム」spec を組む
       - 分類チェックボックス（FacetCheckbox $bindState /shelf/classification/<value>）
       - 年代レンジ（RangeSelect /shelf/yearFrom・/shelf/yearTo）
       - 色相スウォッチ（ColorSwatch /shelf/hue）          ← H2 新モダリティ
       - 自由テキスト（TextInput /shelf/q）                ← H2 新モダリティ
       - 部門/技法のチェック・on view / public domain トグル・並べ替え Select
       - 「探す」ActionButton
       - spec.state.shelf に初期選択（問いから埋める）＋「有名」は表現不能→中立化＋Text 明示
  → ② ユーザーがフォームを操作 = クライアント内 state がライブに変わる（サーバ往復なし）
  → ③「探す」→ 現在の shelf をサーバへ → サーバが form→ES クエリに翻訳 → AIC 検索 → 結果ボード live 更新（IIIF 画像カード）
```

配線は pokefinder §12 の **controlled StateStore 単一永続ボード**を写経（フォーム＋結果を1枚に compose、「探す」は LLM 不使用で `/api/find` 計算のみ→`store.set("/results",…)`→グリッド live 更新・flash なし）。指差し再 compose（§14）も同型で後段に。

## 2. データ源（AIC・recon 済 2026-06-27 live・鍵不要 / CORS 可）

**Art Institute of Chicago API**（`https://api.artic.edu/api/v1/`）🔬:
- `artworks/search` — Elasticsearch バックの faceted search。`query[bool][must|should|must_not]` に `term`/`match`/`range`/`exists` をネスト。`fields=` で必要列だけ・`limit`/`page`・`q=` 全文。
- **1コールで rich**（pokefinder の N+1 不要）: `id,title,artist_title,date_display,date_start,date_end,medium_display,classification_title,department_title,place_of_origin,is_on_view,is_public_domain,image_id,color` が1回で返る。
- **ファセット語彙**（curate 対象・件数は PD＋画像ありでの実測）: `classification_title`＝painting(1014)/sculpture(427)/print(8807)/drawing(3014)/photograph(749)/textile(6277)/ceramics(384)…／`department_title`＝Europe(6975)/Americas(2720)/Photography(3776)/Africa(1098)…（※ match の癖で取りこぼす語あり＝Phase A で正規化）。
- **色**: `color = {h(0-360),s,l,percentage,population}`（単一支配色の HSL）。`range[color.h]` で色相帯フィルタ可（reds[0,25]=11,836・blues[200,260]=8,752 を実測）。
- **画像（IIIF）**: `config.iiif_url = https://www.artic.edu/iiif/2`。画像 URL = `{iiif}/{image_id}/full/843,/0/default.jpg`。

**🔴 データ源クセ（recon で発見・§16「PokéAPI 非公式メガ」と同類）**: API ホスト `api.artic.edu` は素通しだが、**画像ホスト `www.artic.edu/iiif` は Cloudflare の "Just a moment" managed challenge の裏**。curl/サーバ fetch は 403（HTML チャレンジ頁）を食らう。**実ブラウザはチャレンジ通過後 `<img>` で普通に描画**（実 Chromium で 843×1046・42ms 成功を確認）。含意:
1. 画像はユーザーのブラウザが `<img>` で読む＝**描画される**（アプリの正規経路）。
2. **サーバ側で画像を取得できない**＝probe は `image_id` の有無だけ検査（実 fetch しない）／サーバ画像プロキシは不可。
3. Phase B の Playwright 検証は**事前に `artic.edu` を1回開いてチャレンジ通過**しておく（cf_clearance）。
4. 初回 cross-origin で稀に空カードになり得る＝**既知の制約として docs/README に明記**（フォールバックは Met Museum＝`images.metmuseum.org` で非チャレンジ・recon 済だが視覚で AIC に劣る）。

**※ 題材選定の recon**: REST Countries（`/all` が CDN legacy へ 301・fields 無視で脱落）・Open Library / Open Food Facts（recon 環境から egress 不可で未検証→不採用）。AIC は鍵不要・1コール rich・色相 filter・bool 合成すべて実 API で確認して採用（カクテル廃案＝無料枠が射程不足、の轍を踏まないため）。

## 3. サーバ計算（CLAUDE.md「計算は spec でなくサーバで値に」＝form→ES 翻訳器）

shelf（フォーム state）を ES クエリに**翻訳**して AIC に投げ、**値**を返す（spec 側に算術を入れない・表示整形 `$format` のみ）。

```
shelf = { classification:{painting:true,...}, medium:{...}, department:{...}, place:{...},
          yearFrom:number|null, yearTo:number|null, hue:number|null,
          onView:bool, publicDomain:bool, q:string|null, sortBy:string }
```
`findArt` の翻訳規則:
- **ファセット内 OR**: 1ファセットで複数 ON（例 painting と sculpture）→ `bool.should`＋`minimum_should_match:1`。`term` はテキスト体に **`.keyword` 必須**（recon で `term classification_title=painting`→0件 / `.keyword`→1793件 を確認）。
- **ファセット間 AND**: 異なるファセット同士は `bool.must` で重ねる（painting かつ Europe かつ on view）。
- **年代/色相**: `range[date_start]`/`range[date_end]`/`range[color.h]`（BC は負の date_start で表現可）。
- **on view / public domain**: `term[is_on_view]`/`term[is_public_domain]`。
- **自由テキスト**: `match`（artist/keyword）。
- **常に `exists[field]=image_id`**（H5・ボード汚染防止）。必要なら base/PD 既定で粒度を正規化。
- 返すのは値（id/title/artist/date_display/medium/分類/部門/on_view/image_url/該当件数）。サーバが IIIF URL まで組んで返す。

**初期フォーム用語彙**（classification/medium/department/主要 place/sort）はサーバが curate（LLM に発明させない＝出所を背負わせる・§15「正しい粒度の責務はサーバ」）。

## 4. json-render 双方向 API（pokefinder と同一・0.19.0）

pokefinder §4 で確定済を写経（[[json-render-real-api]] / [[verify-library-from-source]]）。要点のみ:
- `{ $bindState: "/p" }`=双方向 / `{ $state: "/p" }`=読取 / `$template`=文字列補間（トークン `${/json/pointer}`）。
- `useBoundProp(propValue, bindingPath): [value, setValue]`＝入力部品の two-way フック。`setValue` が `StateStore.set` を呼ぶ。
- **controlled store（§12）**: `createStateStore({})` を `JSONUIProvider store=` に渡す＝initialState/onStateChange を無視する単一永続ボード。spec.state は**自動 seed されない**ので page が `store.set("/shelf",…)` で手動 seed。
- `$math` は除外（計算はサーバ）。`$format` は使う。

## 5. ディレクトリ / 写経（03 から）

別ポート **3104**（01=3101 / 02=3102 / 03=3103）。own `package.json`（name=`artfinder`）/ own `.env.local`（Azure creds を 03 からローカルコピー・gitignore）。
- `lib/finder/`（data+LLM）: `types`/`model`/`fetchJson`/`shelf`(toFindParams＝page と eval が共有する単一の真実) は写経。actions = `artVocab`(語彙) / `findArt`(form→ES 翻訳＝サーバ計算)。`compose.ts` 写経（buildFormPrompt/seedSection を AIC 版に・graceful 規律移植）。
- `lib/render/`（描画）: 03 の renderer/sanitize/catalog/registry/anchorContext を写経 ＋ **新規入力部品**（FacetCheckbox/ColorSwatch/TextInput/RangeSelect を `useBoundProp` で two-way）＋ 出力 `ArtGrid`（IIIF 作品カード）。
- `app/api/generate/route.ts`（語彙 fetch→`streamText`+`catalog.prompt()`）/ `app/api/find/route.ts`（ES 翻訳のみ・LLM なし）/ `app/page.tsx`（03 シェル写経＝controlled store・onFind・onAnchor）。
- `scripts/probe.mts`（AIC ground-truth）/ `scripts/eval-e2e.mts`（toFindParams 共有・§16）。

## 6. BUILD & VERIFY ORDER（LLM 抜きでデータ層と双方向を先に固める＝03 と同じ）

- **Phase A — データ層 + probe（LLM ゼロ）**: `lib/finder/*` ＋ `scripts/probe.mts` で **form→ES 翻訳**を実 AIC 検証。①語彙 ②単一ファセット ③ファセット内 OR ④ファセット間 AND ⑤年代 range ⑥色相 range ⑦`exists:image_id` で画像なし除外 ⑧**出力 correctness**＝返った集合の total を AIC 直クエリと突合（§16 ⑫相当）⑨**粒度**＝重複/非PD/画像なしが混ざらない（§15）。
- **Phase B — レンダラ写経 + 双方向部品 + ハンド spec（LLM なし）**: 手書き filter-bench spec を `:3104` で。**色相スウォッチ/自由テキスト/年代/ファセットのトグル→「探す」→ in-place 更新＋選択保持（flash なし）**を Playwright 検証（事前に artic.edu でチャレンジ通過）。
- **Phase C — 単発 compose を Azure で配線**: LLM が問い→filter-bench を compose → トグル → 「探す」→ サーバ form→ES → 結果ボード live 更新。H1（核）＋H2（色/テキスト）＋H3（翻訳）＋H4（graceful）を実機確認。
- **多サンプル eval（§11/§16 写経）**: `eval-e2e.mts`（toFindParams 共有）で 12–14 クエリ収集 → ワークフロー多レンズ判定で(a)フォーム忠実度(b)**返った作品が問い通りか**を AIC ground-truth 突合 → scoreAvg／破綻分類 → 発見→修正→同セット再測の閉ループ。

## 7. 観察したいこと（成果物）

- LLM は **新ドメイン**でも `$bindState` のパスを一貫して正しく振れるか（H1）。**色相スウォッチ/自由テキスト**という新部品型も two-way で組めるか（H2）。
- 上流が豊かな DSL を持つとき、破綻は本当に**サーバの翻訳忠実度**に移るか（H3）。`.keyword` 等の fiddliness はどこで効くか。
- **ファセット内 OR ↔ ファセット間 AND** の既定意味論を LLM は正しく扱うか。表現できない**クロスファセット OR** や**主観語**を黙って近似せず開示するか（H4）。
- 画像なし/非PD/重複が**サーバ正規化で汚さない**か（H5）。
- controlled store 単一永続ボードの双方向ループ FEEL（即時トグル↔低レイテンシ live 再検索・flash なし）が別題材でも気持ちよいか。
- 破綻ログそのものが一級の成果物（exp02/03 と同じ姿勢）。

---

## 8. Phase A 実施ログ（データ層・LLM ゼロ・2026-06-27 検証済み）

`lib/finder/`（types/fetchJson(+postJson)/model 写経 ＋ shelf ＋ actions `artVocab`/`findArt`）と `scripts/probe.mts` を実装。probe で **9 チェック全 PASS**（実 AIC）。**form→ES 翻訳**が端から端まで動き、サーバが**値まで計算**（IIIF URL 含む）し、`StateHint` はスカラーのみ（firewall 健在）。

| # | 問い | 結果 |
|---|---|---|
| ① | artVocab 語彙 | 8 種別 / 11 部門 / 8 色相 / 3 並べ替え（疎通 total=132,132）|
| ② | 単一ファセット 絵画 | matched=3544・top='Starry Night and the Astronauts' |
| ③ | ファセット内 OR 絵画∪彫刻 | matched=5800 |
| ④ | ファセット間 AND 絵画×欧州 | matched=1005 |
| ⑤ | 年代 1900–1950 | matched=715 |
| ⑥ | 色相 青(h=215±18) | matched=252・top='Paris Street; Rainy Day'(h=205) |
| ⑦ | 自由語 Monet×絵画 | matched=34（全 Monet）|
| ⑧ | **出力 correctness**(a–g) | 返り行が全て条件通り（type/OR集合/年代/色相∈窓）・AND 単調性・OR 範囲・自由語フィルタ（Monet×彫刻=0）→ 全 PASS |
| ⑨ | 粒度・画像(H5) | 返り全件 image_id あり・絵画母集団=3544（粗粒度 artwork_type_title）→ PASS |

**実装知見**:
1. **§16 の教訓が即効いた＝自由語は“絞る”でなく“並べ替え”だった**: 当初 AIC の top-level `q` を使ったが、`query`(filter) と併用すると **q は関連度の並べ替えだけで件数を絞らない**（Monet×絵画の matched が絵画全件 3544 のまま＝「候補3544件」は嘘）。`multi_match` の `must` 句に変えて**実際に AND フィルタ**（Monet×絵画=34・Monet×彫刻=0）＝件数が正直に。**機構が動く≠出力が正しい**を probe (g) で検出。
2. **§15 の粒度がここでも**: 種別 facet に `classification_title`（"oil on canvas"/"painting" 等の技法混じり細粒度）でなく `artwork_type_title`（"Painting" 粗粒度）を使う。**ドメインの正しい粒度への正規化責務はサーバ**（pokefinder の form名 vs 種名と同型）。
3. **term は .keyword 必須**（recon・[1]0件→[2]1793）。fiddly だが LLM でなくサーバ(翻訳器)が背負う＝H3「線の幅＝上流DSL＋翻訳忠実度」の実物。

## 9. Phase B 実施ログ（双方向部品・ブラウザ検証済み・2026-06-27）

`lib/render/`（renderer/sanitize/catalog/registry/anchorContext 写経 ＋ **新規入力部品 FacetCheckbox / ColorSwatch(色相・視覚) / TextInput(自由語) / RangeSelect(年代2値)** を `useBoundProp` で two-way）＋ 出力 `ArtGrid` ＋ `app/demo`（LLM 抜きハンド spec）。:3104 で Playwright 検証＝**双方向ループが端から端まで動作**。

検証できた全経路（demo で実操作）:
1. `spec.state.shelf` を controlled store に手動 seed → 初期選択反映（絵画 checked・青スウォッチ選択）。
2. ColorSwatch 単一選択（複数 swatch が `/shelf/hue` を共有）・FacetCheckbox・RangeSelect・TextInput・Toggle・Select の two-way。
3. 「探す」= find ハンドラ → `toFindParams` → `/api/find`（form→ES）→ `store.set("/findArt")` → ArtGrid live 更新（該当24・候補252・条件「絵画 / 青系」）。
4. **状態保持（flash なし）**: 探索後も絵画チェック・青選択が残る（§12 controlled store）。
5. **トグルがサーバを駆動**: 青→赤に変えて再検索 → 候補 252→722・条件「絵画 / 赤系」・ボードの色チップが全部赤系に反転。

**🔴 最大の発見＝データ源クセ「AIC 画像は cross-origin 表示不可」（実ブラウザ検証で初めて判明・§16 級）**: `api.artic.edu`(JSON) は素通しだが、画像ホスト `www.artic.edu/iiif` は **(a) Cloudflare の "Just a moment" JS challenge**（サーバ/curl fetch は 403＝**画像プロキシも不可**）かつ **(b) レスポンスが CORP `same-origin`**（ブラウザ cross-origin `<img>` は `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` で弾く）。＝**localhost/第三者アプリから AIC 画像は出せない**（artic.edu と同一オリジンなら出る・実 Chromium で 843×1046 を確認済み）。**curl では CORP が見えず・実ブラウザで初めて出た**＝「機構の検証(probe)だけでなく実ブラウザで出力を見る」の好例（pokefinder §16 と同型）。
→ **graceful 対応＝各作品の `color`(HSL) で色チップを敷く**: 画像が出ない環境では作品の主要色ブロックがボードを埋める（読める環境では画像が上に乗る）。結果「青い絵画」は青の色面・「赤」は赤の色面になり、**色フィルタの視覚的証明**になった＝制約を色データ(H2)の可視化に転化。

**核の問いへの早期答え（H1/H2 機構面）**: 新規の two-way 部品（色スウォッチ・自由テキスト・年代レンジ）も `$bindState` で正しく双方向動作。controlled store 単一永続ボードは別題材でも flash なく成立。

## 10. Phase C 実施ログ（単発 compose で LLM にフォームを組ませる・実 LLM 検証済み・2026-06-27）

`lib/finder/compose.ts`（buildFormPrompt ＋ seedSection ＋ parseSeedArt）＋ `app/api/generate/route.ts`（artVocab fetch → `streamText`+`catalog.prompt()`）＋ `app/page.tsx`（controlled store・onFind・onAnchor）。:3104 で Azure OpenAI 実呼び出し・Playwright で全ループ検証。

### 核の問いへの答え: LLM は別ドメインでも two-way 入力フォームを正しく組めた（◎）
「青っぽい近代の油彩」に対し LLM は:
- **`$bindState` のパスを一貫して正しく**（FacetCheckbox.checked=`/shelf/type/painting`・ColorSwatch.value=`/shelf/hue`・RangeSelect.from=`/shelf/yearFrom`・TextInput.value=`/shelf/q`・Select.value=`/shelf/sortBy`）。
- **新規モダリティも正しく組んだ（H2）**: 色相スウォッチ群を出し青(h=215)を初期選択・自由テキスト欄・年代レンジ。pokefinder に無い視覚/連続/テキスト入力部品が two-way で動いた。
- **意味のマッピングが的確**: 「油彩」→種別「絵画」・「近代」→年代1900以降（＋「目安として1900年以降」と明示）・「青っぽい」→hue 215・作者欄に「英語で（例 Monet）」の注記。
- 探す→該当24/候補149（全て1900年以降の青い絵画＝Monet「睡蓮」・O'Keeffe・Bacon・Hockney…）＝**H3 サーバ翻訳も忠実**。

### graceful 明示（H4）も新ドメインで機能
「有名な彫刻」→ 彫刻 FacetCheckbox は ON（客観部分は符号化）＋ Text「**『有名』は検索条件として指定できません。種別・部門・制作年・色・作者名などの客観条件で絞り込んでください**」。**主観語を黙って近似せず中立化＋明示**（§13/§16 の規律が別題材で再現）。色等の捏造なし。

### 配線の gotcha は再発せず
pokefinder §10 の「handler 凍結で探すが無反応」「§9 remount-flash」は、写経した controlled store ＋ 安定 handler（useCallback []）＋ ref で**再発しなかった**（境界地図が効いた）。トグル→探す→in-place 更新＋選択保持を実機確認（青→赤で候補252→722・色面が反転）。

### 残課題＝画像（§9 の発見）
core（入力役割）は完全に動くが、結果ボードの**写真は cross-origin 制約で出せない**（色チップで graceful・§9）。＝GenUI の伸びしろでなく**データソースの制約**（exp02/exp03 と同じく、破綻はサーバ/データ側に出る）。

## 11. 多サンプル E2E 意味検証（§16 写経・実モデル収集 → 多レンズ判定・2026-06-27）

`scripts/eval-e2e.mts`（`toFindParams` を page と共有＝“実際の変換”を測る）で **13 クエリ**を実モデルで収集（クエリ→LLM compose→toFindParams→`/api/find`→返った作品）→ ワークフローで各サンプルを美術キュレーター視点の多レンズ判定（fidelity＝フォーム忠実度／fit＝返った作品が問い通りか／破綻 type・severity・**locus**＝llm/server/data）。

### Round 1 結果（fidelityAvg 4.4 / fitAvg 3.9 / 忠実 10/13 / coreHolds=YES）

| # | クエリ | fid/fit | 主破綻(locus) |
|---|---|---|---|
| 1 | 青っぽい近代の油彩 | 5/5 ✓ | 油彩→painting に medium 丸め(server・軽微) |
| 2 | モネの絵 | 5/5 ✓ | — |
| 3 | アジアの彫刻か陶磁 | 5/5 ✓ | — (内OR×部門AND 完璧・OR→AND 反転なし) |
| 4 | 19世紀ヨーロッパの版画 | 2/1 ✗ | **版画×欧州部門で0件**(taxonomy・llm+data) |
| 5 | 赤い抽象画 | 3/3 ✗ | **絵画 type の取りこぼし**(llm)・非絵画混入 |
| 6 | 有名な彫刻 | 5/4 ✓ | 「有名」表現不能→明示中立化(server・disclosed) |
| 7 | 葛飾北斎の浮世絵 | 5/5 ✓ | — (Hokusai 英語化＋print・Great Wave) |
| 8 | 1850年より前の絵画 | 5/5 ✓ | — |
| 9 | 緑色のアフリカの美術 | 5/5 ✓ | — |
| 10 | 高価な絵画 | 5/4 ✓ | 「高価」表現不能→明示(server・disclosed) |
| 11 | 展示中の現代美術 | 5/5 ✓ | — (onView+dept) |
| 12 | 水辺の風景画 | 5/3 | 「水辺」を multi_match が強制不能(server) |
| 13 | とにかく古い作品 | 2/1 ✗ | **yearTo=0 過剰付与**(llm)＋date_start=0/null を拾う(data) |

破綻 locus 集計＝**llm 5・server 5・data 2**。

> **Round 1 verdict（核は YES）**: 13中10が忠実・LLM は別ドメイン（AIC アート）でも `$bindState` two-way フォームを正しく組める。ファセット・ルーティング（作者名→自由語 q・「絵画」→type・「アジア」→department）、**同一ファセット内 OR × 部門 AND の正しい分解**（「アジアの彫刻か陶磁」）、表現不能語（「有名」「高価」）の捏造せぬ明示中立化、そして **exp03 §11 最大の破綻だった OR→AND サイレント反転を起こさず開示できている**＝pokefinder 由来の規律が別題材へ移植成功。
> 破綻は **LLM と server に拮抗**して出るが質が違う: server/data 側は**クエリ言語の表現力不足とデータ粒度**（=設計責務がサーバに残る部分・OR以外の主題述語・素材medium・価格・「有名」・版画の地域）。LLM 側は (a) 表現可能な意図の取りこぼし（#5 絵画型）・(b) 地名→部門の機械マッピングが収蔵構造と衝突（#4）。最深の破綻 #4/#13 は計算でなく**データ粒度の設計判断**（版画は別部門・date_start=0 は欠損）＝§15 と同型「ドメインの正しい粒度への正規化責務はサーバに残る」。**機構が動き正直に開示しても、出てきた“作品”がドメイン概念を満たすかは別問題**＝[[verify-output-correctness-not-just-mechanics]] の再確認。GenUI の伸びしろは LLM でなくサーバの射程と粒度設計にある（exp02「線の幅↔射程」と同型）。

### Round 2（発見→修正→再測の閉ループ）

compose プロンプトに3点追加して同14クエリを再測:
1. **種別の取りこぼし禁止**（「〜画」=絵画等を含意したら必ず state で ON＝言行一致）→ #5。
2. **「古い/新しい」は sortBy で表し、具体年代語が無ければ year 範囲を付けない**（yearTo=0 の全件除外を作らない）→ #13。
3. **版画/素描 × 地域部門の落とし穴**（版画は地域部門に入らない＝AND 0件→地域部門を付けず Text で「版画は地域で絞れません」と明示）→ #4。

**Round 2 結果（fidelityAvg 4.4→4.5 / fitAvg 3.9→3.9 / 忠実 10→12 / locus llm 5→3・server 5→2・data 2）**:

| # | クエリ | r1 | r2 | 変化 |
|---|---|---|---|---|
| 4 | 19世紀ヨーロッパの版画 | 2/1✗ | **4/3✓** | 0件→該当24・部門を外し「版画は地域で絞れない」明示。地域 fit は server/data 限界で中（非欧州の北斎が混入）|
| 5 | 赤い抽象画 | 3/3✗ | **4/2✓** | 絵画 type を ON＝忠実化。ただし r1 で使っていた q=abstract を落とし「抽象」制約が結果に未反映→fit 微減（llm 近似チャネルの放棄）|
| 13 | とにかく古い作品 | 2/1✗ | **4/2✓** | yearTo=0 過剰付与を撤去＝忠実化（sort=oldest のみ）。ただし条件ゼロで skip（フィルタ無しは「検索なし」）|
| 10 | 高価な絵画 | 5/4✓ | **2/1✗** | **回帰**: 「高価」を中立化する際に表現可能な「絵画」type まで黙って落とし skip。唯一の faithful=false |
| 他9件 | — | — | 無回帰（5/5・5/4 維持） |

> **Round 2 verdict（閉ループの正直な教訓）**: 狙った3破綻（#4 taxonomy・#5 型取りこぼし・#13 過剰 year）は **faithful 化に成功**（10→12/13）。しかし**プロンプト nudge は単調改善ではない**＝(1) #10 で**新たな回帰**（「高価」中立化が表現可能な「絵画」まで巻き添えに＝過剰中立化）、(2) #5 は型は直ったが r1 で持っていた自由語近似（q=abstract）を落とし fit はむしろ下がった。＝**「表現不能語は中立化」と「表現可能語は必ず符号化」の境界判断に LLM 個体差（run 変動）が残る**。**残る fit 制約（#4 版画の地域・#12 主題・#13 フィルタ要求）は一貫して server/data 側**（クエリ言語の表現力＋データ粒度）＝§13/§14b と同じく忠実化はサーバ拡張（線を太くする＝主題タグ・地域メタ・OR 等）で取りに行く。GenUI の伸びしろは LLM でなく**サーバの射程と母集団の粒度**にある（exp02「線の幅↔射程」/ exp03 §15「粒度はサーバ」が別ドメインで再確認）。[[verify-output-correctness-not-just-mechanics]]。

## 12. 結論（exp04 の核）

- **核の問い＝「LLM は別題材でも双方向の入力フォームを組めるか」＝ YES**（fidelityAvg 4.5・忠実 12/13）。pokefinder の規律（graceful 明示・controlled store・handler 安定参照）はそのまま別ドメインへ移植でき、**新モダリティ（色相スウォッチ・自由テキスト・年代レンジ）も two-way で正しく組めた**。exp03 §11 最大の破綻 OR→AND サイレント反転も再発せず。
- **上流が豊かな DSL を持つ構成**（AIC ES）では、load-bearing は自前 findMons でなく**サーバの form→ES 翻訳忠実度＋上流クエリ言語の射程**に移った（H3 実証）。`.keyword` 必須・自由語は multi_match で“絞る”・ファセット内 OR/間 AND は LLM でなく**サーバが背負う**＝H3 の通り。
- **破綻は一貫して LLM でなくサーバ/データ側**（クエリ言語の表現力＝版画の地域/主題/価格/OR、データ粒度＝版画の部門・date_start=0 の欠損・medium サブファセット不在）。exp02「線の幅↔射程」と完全に同型。
- **データソースの実在性クセ（§16 級）**: AIC 画像は cross-origin 表示不可（Cloudflare＋CORP）＝第三者アプリで写真を出せない。**実ブラウザ検証で初めて判明**（curl では見えない）＝「機構でなく実出力を見る」の再確認。色チップ視覚化に転化。
- **NEXT 候補**: ~~findArt の射程拡張（主題タグ subject・地域メタの正規化・クロスファセット OR）~~ → §13 で実施。主題の relevance ランキング改善（fit の残課題）／画像の代替表示（色チップ以外）の検討／さらに別の役割（編集・構成）への反転。

## 13. 線を太くして fit を測る（subject・region・クロスファセット OR をサーバに追加・発見→修正→再測・2026-06-30）

§12 は「破綻は server/data 側＝線を太くすれば fit は上がるはず」で終わったが、**「実際に太くすると、stuck していた fitAvg 3.9 はどこまで上がるか」は未測定**だった。これを測る。着手前に実 AIC を probe したところ、§11 が「サーバ/上流の限界」と記録した破綻のうち **2つは上流の限界でなく findArt の翻訳ギャップ**だった（[[verify-output-correctness-not-just-mechanics]] の逆＝過去ログも疑う）:
- **クロスファセット OR**: ES は `should + minimum_should_match` で1ボディ表現可能（findArt が `must` に潰していただけ）。実証 `(絵画∧仏) OR 版画 = 48373`（= 528+47845 で disjoint 和に一致）。
- **medium サブファセット**: `classification_titles.keyword=etching → 12770` 等で到達可能（粗粒度 `artwork_type_title` の下に足せる）。

### 足したもの（サーバの「線」を太く＝§14b 同型・全て probe で実 AIC 突き合わせ済）
- **主題 subject**（`match subject_titles`）: 「水辺」→water・「抽象」→abstract・「肖像」→portrait。q（作者/作品名）から主題を**分離**（q の fields を title/artist_title に絞り、term_titles を外した＝「q が主題を暗に約束する」嘘を解消）。
- **産地 region**（`match place_of_origin`）: 国レベルは直 match（France=15257・Japan=12529）、**大陸語はサーバが代表国の OR へ展開**（"Europe"→France/Italy/… ＝§15「正しい粒度への正規化はサーバの責務」）。版画・素描も**産地で地域を絞れる**（地域部門と違い産地は種別を選ばない）→ §4 の「版画×地域は 0 件」を**忠実化**（開示でなく実フィルタに）。
- **クロスファセット OR `combineMode`**（and 既定 / or）: 「絵画か、青い作品」のような**軸またぎ OR** を内容条件の `should`（いずれか一致）に翻訳。pokefinder §14b の typeMode を cross-facet に持ち上げた形。
- **候補件数の開示**（§16 の正直さ）: matchedCount>表示件数なら「候補N件のうち上位M件を表示」を note に。
- compose プロンプトを更新: §4 の「版画は地域で絞れない」開示 → region で**忠実化**、クロスファセット OR の「表現不能」開示 → **combineMode=or で表現可能**へ反転（黙って AND に倒さず or で忠実に）。主観/メタ語（有名・高価）は依然中立化＋明示（価格フィールドは AIC に皆無＝不可能性で確定）。
- **probe 恒久追加**: ⑩主題（版画×portrait の返り行が subject タグを持つ）⑪産地（国 match＋大陸展開が literal を遥かに超える）⑫**クロスファセット OR は包除原理が厳密成立**（`OR == A+B−AND` で“近似でない本物”を検証）。全 PASS。

### Round 1（線を太くした直後・同17クエリ＝§11 の13＋新射程4）

| metric | §11 Round 2（太くする前） | **§13 Round 1（太くした後）** |
|---|---|---|
| fidelityAvg | 4.5 | **4.82** |
| **fitAvg（検索実行分）** | **3.9** | **4.63** |
| 忠実 | 12/13 | **16/17** |
| 破綻 locus | llm 3 / server 2 / data 2 | **llm 1 / server 2** |

§11 の大破綻が忠実＋高 fit に転じた: **#4 19世紀ヨーロッパの版画**（region+print+year で 5/5・欧州各国の Print）／**#12 水辺**（subject=water で実フィルタ）／**#16 絵画か青い作品**（combineMode=or 5/5・候補11696 の和集合）／**#17 アフリカの染織**（region 大陸展開）。残る非満点は #5（type 取りこぼし・llm）と #12/#14（subject の relevance ランキング・server）。

### Round 2（発見→修正→再測の閉ループ・#5 を直す）

#5「赤い抽象画」が `subject=abstract`＋赤は入れたが **`type=painting` を取りこぼし**（彫刻が混入・唯一の faithful=false）。compose に「**『〜画』複合語（抽象画/風景画/静物画/肖像画）は subject に主題を入れ、かつ type=painting も必ず ON**」を追加して同17再測:

| metric | §13 Round 1 | **§13 Round 2** | 変化 |
|---|---|---|---|
| fidelityAvg | 4.82 | **4.88** | ↑ |
| fitAvg（検索分） | 4.63 | **4.60** | ほぼ横ばい |
| 忠実 | 16/17 | **17/17** | ↑ |
| locus | llm 1 / server 2 | llm 1 / server 2 | — |

- **#5 修正成功**: type=painting＋subject=abstract→候補135→51（絵画のみ）・fid3→5/fit3→5/faithful 化。nudge が般化し **#12 も `subject="water landscape"`**（「風景画」→landscape）に。
- **だが #10「高価な絵画」が新規回帰**（5/5→3/3・type 取りこぼし）: 「高価」中立化の際に表現可能な「絵画」type まで落として skip。**§11 Round 2 と同じ #10 の失敗を live で再現**＝プロンプト nudge は**非単調**（#5 を直すと #10 が戻る whack-a-mole）。#5 修正が #10 を**引き起こしたのではない**（「絵画」単体で「〜画」複合語トリガに非該当・独立した run 変動）。

### §13 の結論（正直に）

1. **サーバの線を太くすると fit は単調に上がる＝thesis を“測れた”**: fitAvg **3.9→4.6**・忠実 12/13→17/17。exp02「線の幅↔射程」を**議論でなく数値で実証**（クエリ言語を広げる→fit が上がる）。GenUI の伸びしろが LLM でなくサーバの射程にある、を別ドメインで定量化。
2. **過去ログの“限界”は鵜呑みにしない**: §11 が「server/上流の限界」と記録した OR・medium は**実は findArt の翻訳ギャップ**＝線は上流が許すより細く引かれていた。probe で実突き合わせて初めて判明（[[verify-output-correctness-not-just-mechanics]]）。
3. **残る server 側 fit 残課題＝主題の“ランキング”**（#12/#14）: subject の集合（matchedCount）は正しいが、自由語が無いと relevance ソートが人気順に流れ、上位24件が**主題特異度で並ばない**（「睡蓮」検索で Monet の Water Lilies が先頭に来ない）。**集合は正しいが top-N の並びが弱い**＝線の“幅”でなく“ランキング品質”の射程。NEXT＝主題 relevance ブースト／sort。
4. **compose プロンプト nudge は非単調**（#5↔#10 の type 取りこぼし whack-a-mole）＝LLM 側の run 変動で、nudge を足して潰し切れない（§11 Round 2 の教訓を再確認）。**サーバの線拡張（堅牢な単調改善）とは別物**で、後者の方がロバスト。

**検証**: probe ⑩⑪⑫ live PASS／ブラウザで combineMode フォーム compose→探す→**in-place 更新＋選択保持（§9/§10 再発なし）**＋カードに産地表示／E2E 17クエリ×2 round 多レンズ判定。コミットは PR #4 に乗る。

