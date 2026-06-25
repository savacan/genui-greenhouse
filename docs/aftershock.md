# 実験02: aftershock（agentic ループ × データファイアウォール）

genui-greenhouse の2本目。**「真の agentic ループ（tool 結果がモデル文脈に再投入される）と、データファイアウォール（生データを LLM に通さない）の緊張点を線引きする」**ための学習装置。

> このドキュメントは「何を作るか」の言語化＋ Phase 0 の確定設計。
> 2026-06-25 に一次ソース recon 完了（USGS 2.4.0 / Open-Meteo / Wikipedia 実レスポンス検証済み・**AI SDK v6.0.208 の multi-step 実 API をインストール済みソースで確認**・01 現行配線確認済み）。
> 着手するセッションはまず [`../CLAUDE.md`](../CLAUDE.md)（方針・規律）と 01 の確定設計 [`space-cockpit-m1-design.md`](space-cockpit-m1-design.md)（写経元）を読むこと。

---

## 0. この実験が動かす唯一の変数（取り違えない）

苗床の目的は「GenUI が効く/効かない**境界の地図**」。01（探索ダッシュボード × 宇宙 × json-render × Azure）は matrix の1セルを縦横に掘り切った。02 が埋めるのは**オーケストレーション軸の最大の空白**＝01 が構造的に据え置いた「真の agentic ループ」。

| | 01 space-cockpit | 02 aftershock |
|---|---|---|
| firewall | **ハード**。router が1度アクションを選び、tool 結果はモデルに二度と戻らない。firewall は構造であって規律ではない。 | **部分**。multi-step tool loop でモデル自身が何手も回す。tool 結果が文脈に**再投入される**。 |
| 動かす変数 | — | **オーケストレーションのみ**（router 1回 → モデル駆動の多段）。ライブラリ=json-render / プロバイダー=Azure は 01 固定。 |
| 題材 | 宇宙（高視覚・低ステークス） | 地球モニタ（地震 → 気象 → 近傍記事の異種混在・連鎖） |

**核の問い（= 観察装置として残すもの）**:
> tool 結果がモデル文脈に戻る世界で、「次の手選択に要るスカラー要約だけ戻し、生配列は `$state` で部品にだけ渡す＝**部分ファイアウォール**」は成立するか。**どこで足りない（モデルが次の手を誤る）/ どこで濃すぎる（トークン肥大・生配列漏れ）か。**

これは「もう1個の wow デモ」ではない。**01 の2段オーケストレーションを multi-step loop に最小改造し、緊張点だけを観察可能に残す縦スライス**。wow（ShakeMap JPG・ビーチボール・PAGER 警報帯）は agentic loop を「観察に値する題材」にするための燃料であって目的ではない。

**新しい seam = `toModelOutput`**（recon で確認）。これが部分ファイアウォールを first-class にする支点。各 tool の `execute` はフル結果（生配列＋スカラー）を返すが、`toModelOutput` がモデルに戻すバイトを**スカラーだけ**に絞る。生配列は別経路（`writer.write({type:"data-initialState"})`）で `$state` に退避。**1つの execute 戻り値に2つのシンク**（モデル ← `toModelOutput` の要約 / UI ← 生配列）。`toModelOutput` を書き忘れると「`JSON.stringify(execute 全戻り)`」がそのまま文脈に流れる＝生配列漏れ。だから 02 の Action は `toModel(state)` を持ち、tool 工場がそれを `toModelOutput` に配線する。

---

## 1. 体験（問い → エージェントが調べる）

| ユーザーの問い | エージェントの手順（モデル駆動） | 組まれる画面 |
|---|---|---|
| 「最近の大きい地震は？」 | `quakes`（一覧）→ 必要なら `quakeDetail`（最大イベント） | ランキング＋規模バー＋（最大の）ShakeMap・PAGER 帯 |
| 「いちばん大きい地震を詳しく」 | `quakes` → `quakeDetail` | ビーチボール（発震機構）＋ ShakeMap 画像＋断層型 |
| 「その震源、今どんな天気？周りに何がある？」 | `quakes` → `quakeDetail` → 震源座標で `weather` ＋ `nearby` | 気象タイル＋気温 sparkline＋近傍記事グリッド |

ポイントは 01 と同じ recombination だが、**部品の取捨だけでなく「どのデータをどの深さまで取るか」をモデルが多段で決める**点が新しい。

---

## 2. データ源（recon 済み・全て鍵不要 / 2026-06-25 live）

- **USGS `fdsnws/event/1`（v2.4.0）** — `query?format=geojson&minmagnitude&starttime&endtime&orderby&limit`（一覧 = `FeatureCollection`）、`query?eventid=<id>&format=geojson`（詳細 = 単一 `Feature` ＋ `products`）。
  - top-level `properties` は **native JSON 数値**（NeoWs と違い文字列でない）。`geometry.coordinates = [lon, lat, depth_km]`（順序注意）。`time` は epoch **ms** UTC。
  - `products[].properties` は **全部文字列** → `parseFloat`。`moment-tensor`（nodal-plane-1/2-strike/dip/rake → ビーチボール・断層型）/ `shakemap`（`contents["download/intensity.jpg"].url` 即 `<img>`）/ `losspager`（`alertlevel`）。
  - `tsunami` は 0/1 int、`ids/sources/types` は `,foo,` カンマ包み。product 有無は `types` 文字列を見てから触る。
  - 404 は **plain-text 本文** → `res.ok` 先読みで分岐（01 の `fetchJson` は既にこれを満たす）。
- **Open-Meteo** — `geocoding-api…/v1/search`（名前→座標）/ `api…/v1/forecast`（`current`＋`hourly`）。`hourly` は48点の**巨大配列** → サーバで8点 sparkline＋min/max/trend に要約。`timezone=auto` 必須・座標は grid snap・洋上は 200/`elevation:0` で degrade 可。
- **Wikipedia** — `w/api.php?action=query&list=geosearch&gscoord=lat|lon&gsradius<=10000&format=json&origin=*`（近傍記事）→ 上位を `api/rest_v1/page/summary/<title>` で enrich（`encodeURIComponent` 必須・per-article 404 許容）。CORS `*`・ja/en 両対応。`gsradius` 上限 10km なので洋上は疎 → 件数0は empty-state（半径拡大はしない）。
- **OpenSky `states/all`（任意・degrade）** — 匿名はレート厳しく不安定。失敗で `{unavailable:true}` を返しモデルは飛ばす。1ソース死んでも盤面は生きる（01 の soft-degrade 規律）。

---

## 3. オーケストレーション（multi-step loop・案A = 推奨）

AI SDK v6.0.208 の実 API（installed source 確認）:
- multi-step は `maxSteps` ではなく **`stopWhen: StopCondition | StopCondition[]`**。`stepCountIs(n)` / `hasToolCall(name)` / `isLoopFinished()`。**既定は `stepCountIs(1)`**＝素の `streamText` はループしない。
- `tool({ description, inputSchema(zod), execute, toModelOutput })`。`execute` 戻り値は **`toModelOutput` 未指定だと `JSON.stringify` で丸ごとモデルに再投入**（= firewall 漏れ）。`toModelOutput` で `{type:"json", value:{...scalars}}` に絞る。
- 第2制御点 `prepareStep({steps, stepNumber, messages})` → step ごとに `messages/system/activeTools/toolChoice` を書き換え可（古い tool 結果の間引き・終盤に `done` 強制）。
- 中間 step のモデル散文も UI stream に流れる（json-render の transform は step 境界に盲）。案A は `consumeStream()` で loop テキストを捨て、進捗は `tool-call`/`start-step` イベント → per-step ステッパに。

```
入力 → ① multi-step tool loop（streamText + tools + stopWhen:[stepCountIs(8), hasToolCall("done")]）
        モデルが quakes → quakeDetail → 震源座標で weather/nearby を選んで何手も回す
        各 tool: execute がフル結果 → toModelOutput でスカラー要約だけモデルへ / 生配列は StateStore → $state
     → ② loop 収束後に別 streamText で compose（01 同型・spec 経路の firewall を維持）
     → per-step ステッパ → Compose-Live
```

**案B（終端 `renderSpec` tool に compose を畳む）は Phase 0 では採らない**。終端で spec を tool 出力に折り込むとモデルが生データを spec に直書きする漏れリスクが上がる。観察したいのは「ツール結果再投入 vs firewall」であって「spec 経路の firewall 崩し」ではない。案B は Phase 1 の比較項に温存。

---

## 4. 部分ファイアウォールの線引き（この実験の主役）

各 tool の `execute` 戻り値を「**モデル文脈に戻すスカラー**（次手選択に要る最小 = `Action.toModel(state)`）」と「**`$state` に退避する生配列**（部品だけが見る）」に分ける。Phase 0 はハードコードの1案（観察の出発点）。

| tool | モデルに戻す（`toModel` のスカラー = 次手の signal） | `$state` に退避（部品だけが見る生配列） |
|---|---|---|
| **quakes** | `count, maxMag, strongestEventId, strongestPlace, strongestDepthKm, strongestMag, tsunamiFlaggedCount, redAlertCount` | `quakes[]`（id/mag/place/depthKm/lat/lon/ageHours/alert/sig/hasShakemap…）, 集計 scalar |
| **quakeDetail** | `eventId, mag, lat, lon, depthKm, pagerAlert, maxMmi, faultType, hasShakemap` | `nodalPlanes[]`, `shakemapIntensityImgUrl`, products 由来詳細 |
| **weather** | `tempNow, unit, wind, windUnit, condition, tempMin, tempMax, trend, offshore` | `current`, `sparkline`(8点), 生 `hourly`(48点) |
| **nearby** | `count, nearestTitle, nearestKm, sample`(3タイトル) | `articles[]`(title/dist/description/thumbnail/url) |
| **aircraft**(任意) | `count, nearestCallsign, nearestKm` or `{unavailable:true}` | `flights[]` |

**絶対にモデルに戻さない**: features 配列・products blob・nodal-plane 数値群・画像URL・`hourly` 48点・articles 配列。

**設計原理**: 「モデルが**次に何を呼ぶか**を決めるのに要る最小」だけ。`quakes.strongestEventId` → drill 判断、`quakeDetail.lat/lon` → weather/nearby の chain 入力、`weather.offshore` → nearby を諦める判断。**これ以上は濃すぎ（肥大）、これ未満は薄すぎ（誤手）**。この閾値こそ観察対象。

**緊張を measure する仕掛け（devログ・Phase C）**: `onStepFinish` で `{step, toolCalls, toModelOutputBytes, sliceBytesToState, modelTextThisStep, nextToolPlanned, cumModelContextTokens}` を `scratchpad/loop-trace.jsonl` に。(a)`toModelOutputBytes` 膨張＝戻しすぎ (b)`modelTextThisStep` 非空＝中間散文漏れ (c)`nextToolPlanned` 誤り＝薄すぎ (d) トークン増加曲線＝N手肥大。

---

## 5. ディレクトリ（01 から copy / 写経 / 新規 / 改造）

別ポート **3102**（01=3101）。own `package.json`（name=`aftershock`）/ own `.env.local`。共通基盤は作らない（CLAUDE.md「3回目で抽出」＝これは2回目なので**写経**でよい）。

```
experiments/02-aftershock/
  package.json / tsconfig / next.config            # 01 から（port 3102・globe/maplibre は Phase B で QuakeMap が要れば）
  app/
    layout.tsx / page.tsx                           # Phase A は placeholder。Phase B で 01 シェル写経（AcquisitionSequence を per-step 化）
    api/generate/route.ts                           # Phase C: ★ THE REWRITE（単発2段 → multi-step tool loop）
  lib/
    monitor/                                         # 01 の lib/cockpit/ 相当（data+LLM）
      types.ts          # Action<P,R,S>+StateHint+ActionContext 写経 + toModel(state) 追加（firewall 線）
      model.ts          # provider seam 写経（無改造）
      fetchJson.ts      # 写経 + headers オプション（Wikipedia UA）
      state-store.ts    # ★ NEW: 1リクエスト内の slice/hint を溜め initialState/composeParts に
      tools.ts          # ★ NEW: Action → tool() 工場 + toModelOutput（部分ファイアウォール seam）+ done
      compose.ts        # 01 写経（最終 spec 構成は別 streamText）
      actions/
        index.ts        # ACTIONS = [quakes, quakeDetail, weather, nearby, aircraft]
        usgs.ts         # quakes(一覧) + quakeDetail(products パース)
        weather.ts      # Open-Meteo 震源気象
        nearby.ts       # Wikipedia geosearch + summary
        opensky.ts      # aircraft（任意・degrade）
    render/             # Phase B: 01 の render 層を写経 + 地球モニタ部品
  scripts/probe.mts     # Phase A 検証: chain（quakes→drill→weather/nearby）を実 API で
```

**境界ルール（01 踏襲）**: `lib/monitor/` = data/LLM（react を import しない）· `lib/render/` = drawing。route が import するのは `@json-render/core`(`pipeJsonRender`) + `lib/monitor/*` + `lib/render/{catalog,sanitize}` のみ。`@json-render/react` は server import 禁止。

---

## 6. BUILD & VERIFY ORDER（01 同様 LLM 抜きでデータ層を先に固める）

- **Phase A（このセッション）— data/compute・LLM ゼロ（最大の de-risk）**: `types/model/fetchJson/state-store/tools` ＋ `actions/{usgs,weather,nearby,opensky}` ＋ `index`。`scripts/probe.mts` で **chain を実 API 検証**（quakes → 最強 eventId で drill → 震源座標で weather/nearby）＋固定座標テスト（Tokyo=密 / 洋上=疎）。確認: list/detail の type 分岐・products の parseFloat・nodal→断層型・`tsunami`/`types` パース・lon↔lat swap・`timezone=auto`/snap/offshore/sparkline downsample・geosearch+summary chain と洋上 empty・各 action の `toModel(state)` が §4 表通りか。**LLM/ブラウザ/Next なし**。
- **Phase B — レンダラ写経 + ハンド spec（LLM なし）**: 01 の `render/{renderer,catalog,registry,sanitize}` を写経し地球モニタ部品（QuakeList/MagnitudeBars/Beachball/ShakeMapImage/WeatherTile/Sparkline/ArticleGrid/AlertBanner）に差し替え、Phase A の `state` dump をハンド spec で描画確認。
- **Phase C — multi-step loop を Azure で配線（最後・最小・最も観察可能）**: `tools/route/page`。段階検証 =（a）1手 sanity（中間散文・到着順）（b）firewall grep（生配列が文脈に無いこと）（c）chain 検証（d）`stepCountIs(8)` 打ち切り（e）per-step ステッパ → Compose-Live。

---

## 7. 正直な残存リスク（agentic 特有 + 観察したい破綻仮説）

- **無限/暴走ループ** → `stopWhen: stepCountIs(8)` で硬く打ち切り、`prepareStep` で終盤 `toolChoice:"done"`。打ち切り頻発自体が「題材が agentic に重すぎる」観察データ。
- **トークン肥大** → `cumModelContextTokens` 計測。肥大したら `prepareStep` で古い tool message を要約に置換（Phase 1）。
- **中間要約が薄すぎ（誤手）/ 濃すぎ（漏れ）** → `toModel` をハードコード1案で置き devログで境界を掴む。`toModelOutput` 必須を型で縛る。
- **中間散文漏れ** → 案A は `consumeStream()` で客に出さないが、散文を書くこと自体がトークンを食う。「中間は tool-call のみ」は **prompt 規律であって API 保証でない**（守られるかが観察対象）。
- **観察したい破綻仮説**: ①部分ファイアウォールは chain 2段（drill→weather/nearby）まで成立するが3段以上で要約が薄くなり誤手が増える？ ②agentic の自由度は初回だけ良くて死に時間（直列N手）が体感を殺す？ per-step ステッパで救えるか。 ③洋上震源（大地震の常態）で nearby 空のとき、`offshore`/`count` だけでモデルが正しく諦められるか＝薄い要約での自律判断の限界。 ④案A（compose 分離）は漏れないが案B（終端 renderSpec）に寄せた瞬間に漏れる＝「どこまで agentic にできるか」の実用ライン。
- **01 から持ち越す既知リスク**: StateProvider remount（`key={assistantId}` 必須・multi-step は「loop 後に全 slice を1発 flush してから spec 解決」で回避）/ `$format` はスカラーのみ / SVG・3D の hydration & layout-breakout（`min-width:0`+`position:absolute`+`ResizeObserver`+`ssr:false`）。

---

## 8. Phase C 観察結果 — 部分ファイアウォールの境界（2026-06-25 ライブ・Azure OpenAI・計測込み）

計器: `route.ts onStepFinish` が各手の `usage.inputTokens`（文脈肥大カーブ）と tool 選択・中間散文長を、`tools.ts` が `toModel` バイト vs 生 slice バイト（keptOut%）を dev ログに出す。

### 成立した側（単一エンティティ・深さ3）
「最大の地震の震源、今どんな天気で周りに何がある？」→ **4手**: `quakes → quakeDetail → [weather, nearby 並列] → done`。入力トークンカーブ `[1025,1154,1264,1464]`（緩やか）、各手 **`textLen=0`（中間散文ゼロ）**、firewall **keptOut 39–97%**（quakes は 6500B→224B=97%）。スカラー要約（`strongestEventId`/`lat,lon`/`offshore`/`count`）だけで次手選択は正確。**→ 部分ファイアウォールと agentic ループは、単一エンティティのドリルダウンでは両立する。**

### 破綻した側（複合・多エンティティ）= 境界
「最近の大きい地震トップ3を、それぞれの震源の天気と周りまで調べて比べて」→ **8手に膨張・モデルが thrash**（`quakes` を3回・同一イベントを再ドリル）、入力トークン `1038→2056`（2倍）、最終盤面は **1イベント分しか組めず要求（3件比較）を満たせなかった**。

**根因は firewall の線そのもの**: `quakes.toModel` は **単一の `strongestEventId` しか返さない** → モデルは**2位・3位のイベント ID を一度も受け取れない**（それらは `$state` 側＝ファイアウォールの向こう）。だから #2/#3 をドリルできず、`quakes` を撃ち直し→#1 を再ドリル→諦めて `done`。firewall 自体は無傷（散文ゼロ・生配列は文脈に出ず）だが、**多エンティティ調査には薄すぎた**。加えて store の per-tool-id 名前空間が、仮に複数ドリルできても slice を後勝ちで畳む（§設計の既知リスク）。

### 地図エントリ（この実験の成果）
- **「スカラー要約 firewall」にはスイートスポットがある**: 単一エンティティのドリルには十分、多エンティティ調査には薄すぎ。**薄すぎは「誤手」ではなく「達成不能＋thrash」として出た**（モデルは賢く振る舞ったが、線の向こうの情報に手が届かなかった）。
- **複合 agentic 調査を支えるには firewall を意図的に広げる**必要がある: (a) list 型結果の `toModel` に**短い addressable list（id+ラベル+主要スカラー）**を載せて #2/#3 を名指しできるようにする、(b) `$state` を **per-tool-call 名前空間**（`quakeDetail/<eventId>`）にして並列・反復ドリルを各スロットに保持する。両方とも「トークンコスト↑ ↔ 多エンティティ能力↑」のトレードオフで、**このトレードの位置こそ実験が突き止めたかったもの**。
- 死に時間/トークン肥大は**この規模では破綻要因ではない**（thrash の8手でも totalIn≈12.5k）。効くのは「線の太さ ↔ 調査の射程」。

### 線を広げた側（(a)(b) 適用後・2026-06-25 再走・同じ「トップ3比較」クエリ）

§8 の (a)(b) を実装して、破綻したのと**同一のクエリ**（「最近の大きい地震トップ3を、それぞれの震源の天気と周りまで調べて比べて」）を再走した。

- **(a) `quakes.toModel` に addressable list**: `topEvents: ModelRow[]`（上位5件の `{id,place,mag,depthKm}`）を追加。型は ②（`ModelSummary` を `Array<Record<string,ModelScalar>>` 許容に緩める）を採用＝「線を明示的に1段太くする」。①の文字列畳み込みは「addressability」と「文字列パース能力」が交絡して結果が読めなくなるため不採用。葉は依然スカラーのみ＝blob/生ネスト配列は禁止のまま。
- **(b) `$state` を per-tool-call 名前空間**: `Action.instanceKey?(params)` を追加（quakeDetail=eventId / weather・nearby=丸め座標）。`StateStore.put` が `id/<key>` でスロットを分け、`snapshot()` がネスト構築、describe の固定パス `/id/...` は store が `/id/<key>/...` に注入。これで複数ドリルが後勝ちで畳まれず並存。
- **anti-thrash 規律**: `AGENT_SYSTEM` に「複合は quakes 1回 → topEvents の id を各 quakeDetail」「同じ tool を同じ引数で二度呼ばない」を明記。compose プロンプトに「`tool/xxx` が複数 = 別エンティティ → Card を Stack で並べる」を追加。

**結果（計器込みライブ・Azure OpenAI）= 破綻が解消し、しかも安くなった**:

| | 細い線（before・§8 破綻側） | 太い線（after・(a)(b)） |
|---|---|---|
| 手数 | 8手・thrash | **4手**（`quakes` → `quakeDetail×3` → `weather×3,nearby×3` → `done`） |
| `quakes` 呼び出し | 3回（撃ち直し） | **1回** |
| 入力トークンカーブ | 1038→2056（2倍）・累積 ≈12.5k | **[1211,1520,1885,2482]・totalIn=7098** |
| 中間散文 | 0（firewall 無傷） | **0（各手 textLen=0）** |
| firewall keptOut | — | quakes 80%（684B/3416B）・quakeDetail 68–70%・weather 77%・nearby 38% |
| 組まれた盤面 | 1イベントのみ（要求未達） | **3イベントを横並び Card で比較**（M7.5 Yumare / M7.2 Yumare / M6.9 Kuji）。各 Card に PAGER 帯・ビーチボール・ShakeMap・天気 sparkline・近傍。断層型も正しく差が出た（Venezuela=横ずれ / Kuji=逆断層）。 |

**地図エントリ（この再走の成果）**:
- **線を広げたら本当に組めた**: `$state` に 3×quakeDetail＋3×weather＋3×nearby が別スロットで並存し、compose が全 instance-qualified パスにバインドして3面比較を自己組成。per-tool-call 名前空間（(b)）が無いと後勝ちで1枠に潰れるので、(a) と (b) は**両方**必要だった（(a) だけでは ID は名指せても slice が畳まれる）。
- **トレードは予想と逆だった**: 「トークン↑ ↔ 射程↑」を見込んでいたが、実測は**射程↑ かつ コスト↓**（7.1k < 12.5k）。理由＝細すぎる線が引き起こしていたのは「賢い諦め」ではなく **thrash（撃ち直し）であり、それ自体が高コスト**だった。addressable list を渡した瞬間にモデルは fan-out（1→3→6→done）を一直線に実行し、撃ち直しが消えた。**この規模では「firewall を適切に広げる」は性能・コスト両取り**。
- **firewall は広げても無傷**: topEvents を載せても quakes の keptOut は 80%（生 `quakes[]` 配列・products・hourly 等は文脈外のまま）。「addressable な短い scalar-record list」だけを通す ② の線引きは、生配列漏れを起こさずに多エンティティ能力を解錠した。
- 境界の地図が**両端で閉じた**: 細い線=単一ドリル○/多エンティティ×（thrash）、太い線=多エンティティ○（収束・低コスト）。残る観察軸は「線をどこまで太らせると今度は濃すぎ（肥大・漏れ）に転ぶか」＝より多エンティティ（トップ10比較等）・多ターンでのスケール。
- 次の検証候補: トップ N をさらに増やしたときの肥大カーブ／案B（終端 renderSpec）での spec 経路漏れ比較／exp03（別の型・題材で breadth）。

---

## 9. 案B 観察結果 — 終端 renderSpec（compose をループに畳む）（2026-06-25 ライブ・Azure OpenAI・計測込み）

§3 で Phase 1 に温存していた案B（compose を別 `streamText` でなく、ループのモデル自身が終端 tool `renderSpec` で spec を吐く）を、案A（`app/api/generate/route.ts`）の対照として `app/api/generate-terminal/route.ts` に実装し、同一の「トップ3比較」クエリで A/B した。当初の予想は「モデルは生配列のパスを firewall の向こうに持つので、リッチな配列部品をバインドできず劣化する」だったが、結果は**それを裏切る形でより面白かった**。

### セットアップ
- 案A の tool 工場を流用し `done` を `renderSpec` に差し替え（`stopWhen: hasToolCall("renderSpec")`）。system に gather 規律＋**カタログ文法（`catalog.prompt()`）**を載せ、describe() のパス地図は渡さない（モデルが見るのは ref＋スカラー＋文法だけ）。
- 終端 tool の入力は **緩く**（`z.object({spec: z.any()})`）受け、妥当性は後段で `catalog.zodSchema().safeParse` ＋ `catalog.validate` で自分で測る。理由: `catalog.zodSchema()` を tool 入力スキーマに使うと**スキーマがモデルの構造作りを肩代わり**して「文法だけで自己組成できるか」を測れない。※最初その strict 版で試すと、全要素が `visible` を省いただけで spec 全体が弾かれ `execute` が一度も走らず＝盤面が完全に空になった。**終端 tool に厳格スキーマを噛ませる設計は、この一律 `visible` 欠落で脆く全崩れする**のも一次データ。

### 観察（n=3・確率的にブレた）
gather フェーズは案A と同一に綺麗に回った（quakes×1 → quakeDetail×3 → weather×3,nearby×3 → renderSpec）。各手 textLen=0・生配列は文脈外＝**firewall（データ機密）は compose アーキに依らず保たれた**（モデルは生 nodalPlanes/hourly/articles を一度も見ない）。だが renderSpec が吐いた spec は毎回違う形で壊れた:
- **run A（templated）**: 24要素・$state 24本・全名前空間に展開し、**concrete な per-instance パスを正しく再構成**した（`/quakeDetail/us6000t7zp`、`/weather/10.44_-68.47`…）。しかし同時に **json-render に無い templating を発明**＝`${id}`/`${weatherKey}` を $state ポインタ文字列に直書きし、`state.compare.events`（3件の足場配列）を spec に inline。1枚の `eventCard` を3イベントに repeat させるつもりが、`${id}` は literal 文字列なので解決されず**比較セクション丸ごと dead**。実描画では概要＋ランキング（concrete bind）は出るが「イベント別の比較」見出しの下が空。
- **run B（hallucinated namespace）**: 概要中心・$state 8本のうち `/notes`（存在しない名前空間）を幻覚。
- 共通: 全要素 `visible` 省略で zodValid=false（22–31 issues）。
- **コスト**: totalIn ≈ 27.4k（案A 7.1k の約3.9倍）。カタログ文法を system に積むので、その重量が**全 gather 手に乗る**（案A は compose の1回だけ）。

### 地図エントリ（この対照の成果）
- **予想は外れた・もっと精密だった**: モデルは firewall の向こうのパスを「見つけられない」のではない（concrete な per-instance パスは ref から再構成できた）。**詰まるのは反復（iteration）の構文**。describe()＋案A の compose プロンプトが「この concrete なパス群にバインドせよ・発明するな」と**明示列挙**を与えるのに対し、案B は文法だけ。すると agentic なモデルは「N件をループで回す」抽象に手を伸ばし、json-render が（repeat/`$item` は持つのに）`${}` 補間という持たない構文を**でっち上げて**描画不能になる。
- **describe 層／2回呼び分けは load-bearing**: パス発見のためでなく、**「テンプレート反復でなく concrete 列挙を強制する」ため**。案A の分離は飾りでなく、多エンティティ盤面を concrete かつ描画可能に保つ仕掛け。しかも安い（文法が全手に乗らない）。
- **firewall（機密）と compose アーキは直交**: 生配列は `toModelOutput` が compose 方式に依らず締め出す。案B で崩れるのは「機密」でなく「spec バインドの正しさ／描画可能性」。§7④の「案B に寄せた瞬間に漏れる」は**外れ**＝漏れるのは生データでなく、spec が壊れるだけ（線の引き場所として案A優位の理由はコストと描画堅牢性であって機密ではない）。
- 注意: n=3 と小さく、案B の壊れ方は確率的（templated / 幻覚名前空間）。だが方向（案B は安定して working な多エンティティ盤面を出せない・案A は出せる）は3回とも一致。
