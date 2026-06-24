# 実験01: 宇宙コックピット（space-cockpit）

探索ダッシュボード × 宇宙データ on json-render。設計の言語化は [`../../docs/space-cockpit.md`](../../docs/space-cockpit.md)、リポジトリ方針は [`../../CLAUDE.md`](../../CLAUDE.md)。

## 起動

```bash
pnpm install            # リポジトリルートで（workspace 一括）
pnpm --filter space-cockpit dev   # → http://localhost:3101
cp experiments/01-space-cockpit/.env.local.example experiments/01-space-cockpit/.env.local  # 値を入れる
```

## いまの状態（Phase 0）

- **M0 ✅ 疎通**: 手書き spec を json-render で描画。
- **M1 ✅ 生成ループ（2026-06-23 ライブ確認・Azure OpenAI）**:
  入力 → ① ルーター（`lib/cockpit/router.ts` = `generateText`+`Output.object`、スキーマは `lib/cockpit/actions/index.ts` の `ACTIONS` から derive）
  → ② サーバが fetch＆計算（`lib/cockpit/actions/{apod,neows,iss}.ts`）→ `initialState`
  → ③ `streamText`+`catalog.prompt({mode:"inline"})` で spec 構成（`app/api/generate/route.ts`、生データは LLM に渡さず `$state` パス＋要約のみ）
  → クライアント（`app/page.tsx`）が `useChat`+`useJsonRenderMessage` で逐次描画（`lib/render/renderer.tsx`）。
  - `/demo` は LLM 抜きで描画レイヤを確認する手書き spec ページ。
  - 検証: `scripts/probe.mts`（データ層・実API）, `scripts/probe-router.mts`（ルーター・実Azure）。`pnpm --filter space-cockpit exec tsx scripts/<name>`。
  - 設計全文: [`../../docs/space-cockpit-m1-design.md`](../../docs/space-cockpit-m1-design.md)。

## Phase B 磨き（✅ 2026-06-23 ライブ確認・Azure OpenAI）

1. **`List` 部品を追加 ✅** — 文字列配列（`/iss/crew`）を出す唯一の部品。`catalog.ts`＋`registry.tsx`＋`globals.css`(.sc-list)。`iss.ts describe` が crew あり時に `List` を suggest＋note。ライブで LLM が採用、9名のクルーが箇条書き描画（旧「·}」破綻を解消）。
2. **KPI の表示整形 ✅** — `@json-render/directives` の表示系ディレクティブ（`$format` ほか／`$math` は方針通り除外）を `renderer.tsx` の `JSONUIProvider directives=` に配線。`compose.ts` が「Kpi/Text に出す数値だけ `$format` で整形、Map/Table/Scatter 入力は生のまま」と指示。ライブで `27,577 km/h`・`18.1 月距離` と整形（旧 `18.0772…` を解消）。
   - 整形は spec 側 `$format` のみ。計算はサーバ（`compute`）に固定（CLAUDE.md 方針）。
3. 視覚の底上げ（APOD ヒーロー演出など）は後回し（ユーザー方針）。

## Phase 1（✅ 2026-06-23 ライブ確認・Azure OpenAI）

CLAUDE.md の段階順（多ターン→操作フィードバック→ストリーミング）を縦スライスで。

1. **ストリーミング演出 ✅** — route を stream-first に再構成し、各段で `data-stage`（routing/fetching/composing）を流す。client は「ルート→取得→構成」の3段インジケータ（`app/page.tsx` の `Progress`）。
2. **操作フィードバック（クリック再取得）✅** — json-render の action 機構を配線。`ActionButton` の `on:{click:{action:"ask",params:{query}}}` → `JSONUIProvider handlers.ask` → `useChat.sendMessage` で別の問いを投げ直し、画面が組み直る。ISS の「位置を更新」で as-of が進む（実 refetch）。
   - **要点（ハマり所）**: `StateProvider` は store を `useRef` で**初回だけ**作り `initialState` の更新を無視する。→ 応答ごとに `CockpitRenderer` を **`key={assistantMessage.id}` で remount**しないと、その場での再質問が初回の state に対して描画される（M1 が動いて見えたのはテストの度にページリロードしてたから）。`JSONUIProvider` は `handlers` prop のみ参照（registry.actions は不参照）。
3. **多ターン / 複数アクション ✅** — router を `actions:[{action,params}]`（複数）に。複合質問（写真＋小惑星）は並列 fetch して1画面に合成、1ソース失敗は error カードに degrade（他は描画継続）。router に直近の問い（history）を渡し「じゃあ先週のは？」等のフォローアップも解決。
4. **APOD ヒーロー ✅（wow #1）** — `HeroImage` をポスター調（画像上にタイトル/クレジットをグラデで重ねる）。「6月19日の宇宙写真」で日付パース→実画像描画。

## Phase 2（横展開・進行中）

新アクションを2つ追加し、「アクション追加 = 1ファイル + ACTIONS 配列に1行」の拡張性を両経路で実証（2026-06-23 ライブ確認）:

- **apodGallery ✅（新コンポーネントあり経路）** — APOD 日付レンジ → 画像ギャラリー（「今週の宇宙写真まとめて」）。新 `Gallery` 部品が要る例。video エントリは thumbnail が無ければ除外。
- **astros ✅（新コンポーネントなし経路）** — open-notify「今宇宙に何人」→ Kpi + 宇宙船別 List。既存部品だけで描けた（Kpi/List/Card を再利用、render 層は無変更）= 拡張性クレームの核の実証。

## Wow 強化（体感ビズ → 3D・進行中）

「Visualize/Wow が弱い」への対応。舞台×武器×生命感の3軸（[`../../docs/space-cockpit.md`](../../docs/space-cockpit.md) でなくこの README が最新）。

- **体感データビズ ✅**（ライブ確認）— `OrbitProximity`（小惑星ニアミス同心円図・月距離基準・内側ほど近い・赤=危険）＋ `BigStat`（巨大カウントアップ数値）。neows/astros の describe が主役に誘導。「ヤバい小惑星」→ BigStat＋Orbit＋表(補助) を LLM が自分で構成。
- **3D 地球グローブ ✅**（2026-06-24 ライブ構成も確認）— `Globe3D`（globe.gl/three、本物の Blue Marble テクスチャ＋自転＋大気＋脈打つ ISS マーカー）。`dynamic(ssr:false)` で隔離。テクスチャは `public/textures/`。「ISSは今どこ？」で LLM が Globe3D を選ぶ（フラット IssMap は代替）。
- **生命感（liveness）✅** — `Globe3DInner` が wheretheiss.at を5秒ごとに直接ポーリングしてマーカーを自走＋「LIVE」バッジ。表示専用＝ LLM には渡らずファイアウォール維持。
- **入場アニメ + スターフィールド ✅** — カード/数値/図が mount で rise+fade（応答ごと remount で毎回再生）。`body::before/::after` で2層パララックスの星空背景。prefers-reduced-motion 尊重。
- **画になる新データ源 ✅**（並列 recon → 実装、すべてライブ確認）:
  - `epic` — DSCOVR/EPIC の**全球の地球写真**（HeroImage）＋1日の自転タイムラプス（Gallery）＋枚数（BigStat）。2〜4日遅れ → 指定日に画像が無ければ最新へフォールバック。
  - `imageSearch` — images-api.nasa.gov を任意語で検索 → Gallery（renditions 不揃いに防御選択・24枚上限）。「オーロラの画像」→ 実画像24枚＋総ヒット BigStat。
  - `launches` — Launch Library 2 の次の打ち上げ → `Countdown`（ライブ T-・秒は精度が粗いと隠す）＋`LaunchTimeline`（ステータス色分け）。**~15 req/hr 制限** → サーバ側10分キャッシュ＋429時 stale 返し、クライアントは直叩きしない。未来 net だけに絞ってカウントダウンが下がるように。
- **系外惑星（exoplanet）✅**（2026-06-24 ライブ確認・Azure OpenAI）— NASA Exoplanet Archive TAP(ADQL)。新 `ScatterPlot`（質量×半径の log-log・地球/木星を基準マーカー内蔵・family 色分け）＋ `Histogram`（発見年ごとの件数・最多年=Kepler を強調）。mode（earthlike/recent/giants/all、既定 earthlike）で散布クエリを切替、発見年ヒストは共有。compute で family 分類（rocky<1.25/superEarth<2/neptune<6/giant）・最も地球似（log空間で(1,1)最近傍）・発見ピーク年をサーバ算出。「地球に似た系外惑星は？」→ LLM が ScatterPlot 主役＋確認済み総数 BigStat＋最も地球似 Card＋発見年 Histogram を自分で構成。recon の落とし穴（`sy_dist`〔`st_dist`は無効列で400〕／エラーは VOTABLE XML+400 だが fetchJson が res.ok 先読みでクリーンに degrade／~2.2s → mode別 ~日次キャッシュ）も実装で踏襲。検証は `scripts/probe-exoplanet.mts`（実 ADQL・全 mode・param parse の default/catch）。
- **Storm Inbound — 太陽嵐の管制室 ✅（大型 wow・2026-06-24 ライブ確認・Azure OpenAI）** — 「今、太陽嵐は来てる？」で**太陽の機嫌に合わせてレイアウトそのものが反転**（静穏=単一ゲージ／嵐=戦況室）＝「UI が自己組成する」generative の核を最も純粋に検証。多レンズ発散→敵対検証→統合ワークフロー（`space-cockpit-bigwow-plan`、18案→headline）で選定し、M1-M3 を実装＋全体に敵対レビュー（`storm-inbound-review`、確証12件 fix）。
  - 新アクション5: `spaceWeather`（NOAA SWPC 太陽風/Kp/3日予報/G-R-S を並列・verdict をサーバ値化）/ `cme`（NASA DONKI・**地球到達は `estimatedShockArrivalTime` で判定〔`isEarthGB`=glancing blow で誤判定するので使わない〕**・ENLIL 到達 ETA をバインド〔距離÷速度の概算にしない＝誠実〕）/ `aurora`（OVATION 920KB グリッドを**サーバで南端緯度＋観測地 verdict＋間引き band に縮約**・生は LLM に渡さない）/ `flares`（DONKI FLR）/ `stormReplay`（2024-05 G5 の固定スナップショット＝静穏日でも戦況室を必ず見せるデモ保証・「リプレイ」を構造的に明示）。
  - 新部品6: `SolarWindGauges`（速度スパークライン＋計器）/ `KpDial`（半円ダイヤル）/ `KpForecastStrip`（3日 Kp）/ `SunEarthLane`（太陽→地球を CME が進むモデル位置）/ `AuroraOvalGlobe`（極方位 SVG・オーロラ楕円 vs 観測地の緯度リング）/ `FlareEventRail`。
  - **位置情報の個人判定**: client geolocation → `prepareSendMessagesRequest` で毎リクエスト body に observer 注入 → `route` が `ctx.observer`（`ActionContext` 拡張）→ aurora が「あなたの緯度に届くか」をサーバ判定。座標は LLM に渡らず verdict 文字列だけ（ファイアウォール）。
  - 検証 `scripts/probe-stormweather.mts`（spaceWeather/cme/aurora 実 API・全 mode）。
- **演出系 — 待ちのシネマ化 + Verdict-Tempo ✅（2026-06-24 ライブ確認・Azure OpenAI）** — 残り wow（シネマ演出）を設計ワークフロー（`space-cockpit-cinematic-plan`、6レンズ発散→敵対検証→統合）＋実機 spike で詰めた。**重要な発見**: ワークフロー headline の前提「streaming 中の spec を捨てて一括描画」は誤りで、**Compose-Live（計器が patch 順に1枚ずつ着地）は既存コードで動作済み**だった（進行中 assistant は id 安定 → remount せず差分描画。json-render の子は element-id を key にするので既存ノードは非 remount・新規ノードだけ mount で `sc-rise` が発火）。curl の stream timestamp（patch は ~8秒かけて trickle・root 先行）と Playwright の DOM サンプリング（ノードが 19.6→27.4s で段階的に増加）で実証。真の体感課題は**最初の patch までの ~19秒（routing+fetch+推論）がドット3つだけ**＝死に時間。そこを攻めた:
  - **待ちのシネマ（`AcquisitionSequence`）** — 死に時間を「管制室が答えを取りに行く」過程に。`Stage` に `sources?:[{id,status}]` を足し、サーバが各 fetch+compute の settle ごとに fetching stage を逐次 emit → client が**ルーターの選んだ計器＋各ソースの ◌取得中→✓取得 をライブ可視化**（自己組成のオブザーバビリティ UI を死に時間へ移設）。phase 行＋3相レール＋スキャンビーム。太陽嵐トピックは待ちから警戒色（`sc-acq--alert`）。
  - **Verdict-Tempo（`sc-mood-storm`）** — サーバ verdict（spaceWeather=storm / stormReplay=storm / cme 接近・到達）を `deriveMood` で畳み（最大値選択のみ・spec 計算なし）、**storm の応答だけ**突入を尖らせる（一度きりの jolt＋赤ウォッシュ→永続赤フレーム 0.3）。quiet/unsettled は現状質感（3段階出さない）＝ Storm Inbound の空間反転を時間軸へ拡張。`showingBoard` gate で待ち中は前応答の verdict を引きずらない。
  - 共に firewall 無傷（patch は spec 形・値は `$state` 参照／verdict は initialState 経由でクライアント到達）・spec 内計算ゼロ（CSS と enum 比較のみ）・縦スライス内。reduced-motion 打ち消し済み。エラーゼロ。

その他:
- `fetchJson` に 5xx リトライ（NASA APOD の散発 503 対策。abort 即中断・4xx 即失敗）。
- **Mars Rover Photos は断念**: `api.nasa.gov/mars-photos/...`（Heroku）が "No such app" で死亡（recon 判明）。
- 同一アクションの複数回（今週と先週を同時）は未対応（route で id dedupe）。
- **レイアウト突破バグ修正（2026-06-24）**: Globe3D の globe.gl canvas が幅 1200px 固定で Stack/Card を押し広げ、980px シェルを突破して横スクロール＋複合ボードで画面独占していた。原因は flex item の既定 `min-width:auto`（中身より縮まない）＋ globe.gl が `clientWidth` を window 幅で誤読するフィードバックループ。修正＝① `.sc-stack/.sc-card/.sc-card__body` 系に `min-width:0`（広い子＝canvas/表/チャートが親を突き破らない一般対策）② canvas を `position:absolute`（フローから外し祖先を膨らませない）③ `ResizeObserver` で canvas を `.sc-globe` 実寸に追従 ④ 高さ 460px 固定 → `clamp(260px,44vh,440px)`（複合で独占しない）。実測: globe 1202×460→902×335・横スクロール 1370→0。

### 並列 recon ワークフロー
新データ源は `space-data-recon` ワークフロー（4 API を並列に curl して live 判定＋実形状＋Action sketch＋wow×信頼性ランク）で先に裏取りしてから実装。Mars の二の舞を防ぐ型。スクリプトはセッションの `workflows/scripts/`。

## スタック

Next 16 / React 19 / zod 4 / `@json-render/*` 0.19 / AI SDK `ai` v6（既定プロバイダ Azure OpenAI、env で差し替え）/ recharts（散布図）/ maplibre-gl（フラット地図）/ globe.gl + three（3D 地球）。

アクション（`lib/cockpit/actions/`、ACTIONS 配列が単一の真実・全14）: apod / apodGallery / neows / iss / astros / epic / imageSearch / launches / exoplanet / spaceWeather / cme / aurora / flares / stormReplay。
