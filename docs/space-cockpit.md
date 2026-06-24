# 実験01: 宇宙コックピット（Space Cockpit）

genui-greenhouse の最初の実験。「**Generative UI は何に効くか**」を、宇宙データの探索ダッシュボードで掴む。

> このドキュメントは **「何を作るか」の言語化＋ Phase 0 の確定設計**（2026-06-23 に一次ソースで検証し設計確定。実装はこの後のセッションで進める）。
> 着手するセッションはまず `../../CLAUDE.md`（リポジトリ全体の方針・規律）と `../../README.md`（道具立て・ロードマップ）を読むこと。

---

## これは何か

- **型**: 探索ダッシュボード（先行デモ踏襲）。
  自然言語の問い → LLM がアクションと部品を選ぶ → サーバが実データ取得＆計算 → spec → 専用ビュー描画。
- **題材**: 宇宙（NASA ほか無料 API）。
  同じ「宇宙」でも、問いによって **画像 / チャート / 地図 / カード** と UI の形が激変するのが見せ場。
- **狙い**: 「問いで UI が組み変わる」を最小コードで体感し、GenUI が**効く / 効かない**感触を貯める。完成品ではなく学習装置。

---

## 体験（問い → 組まれる UI）

| ユーザーの問い | LLM が組む画面 | データ源 |
|---|---|---|
| 「今日の宇宙の写真は?」 | ヒーロー画像 + 解説文 | NASA APOD |
| 「今週の宇宙写真まとめて」 | 画像ギャラリー / タイムライン | APOD（日付範囲） |
| 「今地球に近づいてる小惑星は?」 | **ランキング表 + 危険フラグ + 「距離×サイズ」散布図** | NASA NeoWs |
| 「ISS は今どこ?」 | **ライブ地図 + 高度 / 速度 KPI** | wheretheiss.at（キー不要） |
| 「今宇宙に何人いる?」 | 人物カード（名前 + 乗っている宇宙船） | open-notify |
| 「火星の最新写真」 | ローバー画像ギャラリー（カメラ別フィルタ） | Mars Rover Photos |
| 「地球に似た系外惑星」 | 比較表 + 質量×半径散布図 + 発見年ヒストグラム | NASA Exoplanet Archive |

ポイント: 部品（画像ヒーロー / 散布図 / ライブ地図 / カード / ヒストグラム）が**問いごとに入れ替わる**こと。これが見せ場であり、探索ダッシュボード型の本質。

---

## wow が立つ瞬間（3つ）

1. **APOD のヒーロー画像** — 本物の NASA「今日の一枚」がドーンと出る。解説文も濃い。
2. **ISS ライブ地図** — "今まさに"動いている。再質問すると位置がズレている = リアルタイム感。
3. **小惑星の「ぶつかるの?」** — 危険フラグ + 最接近距離を「月までの距離の何倍」に換算して出すと体感的に刺さる。

---

## Phase 0（最小スライス）

欲張らず、**部品が最大に散る3アクションだけ**で1本通す:

- **APOD**（画像ヒーロー）
- **NeoWs 小惑星**（ランキング + 散布図 = 分析寄り）
- **ISS ライブ**（地図 + KPI）

この3つで「画像・チャート・地図」が出揃い、"LLM が問いで UI を組み替える"が最小コードで体感できる。Mars / 系外惑星 / SpaceX は Phase 2。

---

## オーケストレーション方針

- **単発・2段**（入力 → ① LLM がアクション＋引数を選ぶ → サーバが実データ取得＆計算 → ② LLM が `streamText` + `catalog.prompt()` で spec を構成 → 描画）。**spec は LLM が組む**（部品を問い・データに合わせて並べ替えるのが見せ場 = wow）。
- **データはサーバ先取得で `initialState` に注入**。LLM② には生データを渡さず、使える `$state` パス＋小さな要約だけ見せて `$state` バインドで組ませる（生データ・巨大配列を LLM に通さない＝責務分離・トークン・正確性）。
- **計算はサーバ**（最接近距離の月距離換算〔NeoWs が算出済み〕/ ランキング / 分布ビン / KPI 値）。**spec 側の算術（`$math`）は使わない**。**表示整形（`$format`：数値・％・日付）は spec でよい**。
- **データに出所・時点を背負わせる**（「いつ時点の ISS 位置か」「どの期間の小惑星か」など）。UI が嘘をつかないため。
- 多ターン / 操作フィードバック（クリック→再取得）/ 凝ったストリーミング描画は **Phase 1**（README ロードマップ参照）。一気に作らない。※ `streamText` 経由なので素朴な逐次描画は実質ついてくる。

---

## スタック / プロバイダー

- **TS / Next.js / json-render / AI SDK Core**。json-render の駆動は `streamText` + `catalog.prompt()`。
- **バージョン**: `@json-render/core`+`@json-render/react` **0.19.0**（最新・2026-05）。peer 床 = **React 19 / Next 16 / zod 4**。表示整形に `@json-render/directives`（`$format`）。AI SDK は `ai` **v6**。
- **LLM デフォルト = Azure OpenAI**（先行デモと同じ）。AI SDK Core の `@ai-sdk/azure` 経由なので抽象の中に収まる。
- ⚠️ **public 化を見据え、env 差し替えだけは最初から効くようにする**。Azure は各自のリソースが必要で他人のものは使えないため、public ユーザーが自分のキー（Gemini 等）を差し込める構成にしておく。

---

## API 確認結果（2026-06-23 recon・実レスポンスをライブ検証）

- **NASA API キー**: `DEMO_KEY` は 10 req/時・50 req/日で詰まる → 開発用に無料キー（api.nasa.gov・1,000 req/時）を `.env.local` に。**残 TODO**: 取得。
- **APOD**: 単日は flat JSON、期間指定（`start_date`/`end_date`）は配列。`media_type` が `image`/`video` → **video は `hdurl` 無し**・`url` は YouTube/Vimeo・`thumbnail_url` は `&thumbs=true` 時のみ。`copyright` 欠如＝パブリックドメイン。**描画は `media_type` で分岐必須**。
- **NeoWs**: `near_earth_objects` が日付キーのマップ。`is_potentially_hazardous_asteroid`(bool)、`estimated_diameter`(km/m/… を min-max で算出済み)、`close_approach_data[].miss_distance.lunar`（**月距離は NASA が算出済み**＝換算不要）、`relative_velocity`。**数値は JSON 文字列なのでサーバで `parseFloat`**。
- **ISS = wheretheiss.at** `/v1/satellites/25544`（HTTPS・キー不要、altitude=km / velocity=km/h / timestamp=unix秒）。people in space = open-notify `astros.json`（**HTTP のみ・不安定・Tiangong 込み** → `craft==="ISS"` で絞り、try/catch で degrade）。**残 TODO**: 実行環境で `http://` 送信が通るか。
- **火星の天気 API（InSight）は終了済み** → 火星は写真のみ（Phase 2）。
- **系外惑星（TAP/ADQL クエリ）・SpaceX/打ち上げは Phase 2**。最初は触らない。
- 月距離換算の参照定数 384,400 km は UI コピー用。換算自体は NeoWs の `lunar` を直接使う。

---

## Phase 2（横に広げる時の候補）

- Mars Rover Photos / NASA Exoplanet Archive / SpaceX・打ち上げ（Launch Library）。
- 別ライブラリ（A2UI / assistant-ui）で**同じお題**を実装 → 作り味の比較。
- 別プロバイダーに差し替えて**構造化出力の質**を観察（GenUI 制約付き生成の得手不得手）。
