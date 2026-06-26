# genui-greenhouse

> Generative UI を「**何に・どう使うと効くのか**」を、実際に動くものを作りながら掴むための実験リポジトリ（苗床 / greenhouse）。

主眼は **ユースケースと使い心地の探索**。「GenUI はどんなタスクに効いて、どう組むと気持ちよく、どこで破綻するか」を、小さく動くものを積み重ねて体感で理解する。ライブラリ / 仕様の比較は目的ではなく、そのための**道具選び（背景知識）**として扱う。LLM プロバイダーも特定の1社に縛らない（→「LLM プロバイダー方針」）。

> ⚠️ この領域は変化が非常に速い。下記の背景情報は **2026年6月時点** のスナップショット。バージョン・対応状況はすぐ陳腐化するので、実装前に一次ソースを確認すること。

---

## このリポジトリのゴール

- **GenUI が効くユースケースの地図を作る** — どんな問い・タスクで「UI が動的に組み変わる」価値が出るか / 出ないか
- **使い心地（UX）と作り味を掴む** — どう orchestration すると気持ちよく、どこで破綻するか
- **作りながら学ぶ** — 机上の比較ではなく、1個ずつ動かして判断材料を貯める

---

## 実験ログ（現状）

| # | 実験 | 型 × 題材 | 学び（要約） | 状態 |
|---|---|---|---|---|
| 01 | [space-cockpit](experiments/01-space-cockpit/) | 探索ダッシュボード × 宇宙 | 単発オーケストレーション（入力→アクション選択→サーバ取得・計算→spec→描画）を縦スライスで通す。待ちのシネマ化・Verdict-Tempo 等の使い心地。 | PR #1 マージ済 |
| 02 | [aftershock](experiments/02-aftershock/) | エージェント結果可視化 × 地球モニタ | 真の agentic ループ × データファイアウォールの**境界地図**（[docs §8–§12](docs/aftershock.md)）。貫く軸＝**「スカラーは通す・生配列は通さない」**、動かすのは常に「線の幅 ↔ 射程／コスト／レイテンシ」。 | PR #2 |
| 03 | [pokefinder](experiments/03-pokefinder/) | **入力UI生成（役割反転）** × ポケモン | GenUI が**双方向の入力フォーム**を組む（出力描画 → 入力/state）。[docs §8–§15](docs/pokefinder.md)。LLM の `$bindState` 組成は高品質（fit/intent 4.45/5・契約遵守は完璧）、境界は **client の state/handler ライフサイクル**（Compose-Live × handler 凍結）・**データ形**（フォーム重複）・**サーバが表現できない意図**（OR/範囲/情緒語を黙って近似＝サイレント縮約 → 中立＋明示で“透明な劣化”へ）。controlled store で remount-flash を解消。§14＝**指差しで組み直す**（出力カード → LLM が「似た相棒」フォームを再 compose）。§14b＝**線を太くして忠実化**（findMons に type OR・世代範囲を足し OR→AND サイレント縮約を源から解消）。**ただし途中で実バグ**：候補をアルファベット順に60件で切ってからランクしていて「最強の◯◯」が誤答（reshiram/rayquaza が落ちる）→ 全候補をランクする修正。§15＝**がっつり監査**（8サーフェスを実 PokéAPI と数値突き合わせ）で**違和感の正体＝フォーム汚染**を特定（type/&lt;t&gt; がメガ/キョダイ/eternamax を全部含み異形が結果を占有）→ 既定 base 種のみ＋「別形態も含める」トグル・世代フィルタ粒度差バグ（giratina 消滅）・sortBy 未配線も修正。教訓＝**「開示」は「正解」の代わりにならない／計算が健全でも“出てきたものが妥当か”を見ないと破綻は出ない（人が触って発覚）／破綻はデータの粒度という設計判断**。発見→修正→再測＋多サンプル評定＋ground-truth 監査（ワークフロー）。 | PR #3 |

---

## このリポジトリの扱い方

- **完全に個人の実験場**。雑に作って壊して学ぶ。捨てる前提の実験 OK。完成度より「学びが残るか」を優先する。
- public 化しても良い。その場合の配慮は「LLM プロバイダー方針」を参照。
- **縦スライス優先・共通基盤を先に作らない**（→「実験の進め方」）。
- **1実験1ディレクトリで隔離**（→「ディレクトリ構成」）。互いに干渉させない。

---

## 当面の道具立て（暫定）

「作りながら学ぶ」フェーズの足場。比較で勝ったからではなく、**最速で動くものに到達できるから**選んでいる。乗り換えたくなったら experiments を増やせばいい。

- **BE / FE とも TypeScript（Next.js）** — コンポーネントカタログ（Zod）を「LLM 出力の制約」と「描画」で共有できる単一言語構成。GenUI の肝はこのカタログが単一の真実になること。
- **レンダラは json-render** — streaming / state / actions という "自前だと地獄" な部分を束ねてくれる on-ramp。
- **LLM はプロバイダー非依存**（Vercel **AI SDK Core** 越し）。json-render の標準経路は `streamText` + `catalog.prompt()`（構造化制約が要るなら `catalog.zodSchema/jsonSchema`）。プロバイダーは env で差し替え。→「LLM プロバイダー方針」。
- **spec / JSON-renderer 系を中心に** — 出力が構造化 JSON なのでプロバイダー非依存と相性が良い。

> ⚠️ ここで言う AI SDK は **AI SDK Core（`streamText` / `generateText` 等）**。背景表で「非推奨」と書いた **AI SDK 3.0 の RSC（`render` API）とは別物**。混同しないこと（※ `generateObject` / `streamObject` は AI SDK v6 で非推奨化されたので、json-render の標準経路 `streamText` を使う）。

---

## LLM プロバイダー方針

public 化も見据えた整理:

- **1社にハードコードしない。AI SDK Core で抽象化**し、プロバイダーは env var + 各自の API キーで差し替える。**AI SDK を使えば多プロバイダー対応のコストはほぼゼロ**（モデルの import を1行変えるだけ）。逆に各社 SDK を手書きで叩くと多対応は地獄 → やらない。
- **public のデフォルトは「無料枠で試せる」プロバイダーが親切**。clone してキーを入れるだけで動く体験になる。Gemini は無料枠が手厚い時期が長く、デフォルト候補（無料枠の条件・上限は時期で変わるので要確認）。
- **構造化出力 / tool calling の質はモデルで差が出る**。これは欠点ではなく**このリポジトリの観察対象そのもの**（「どのモデルが制約付き UI 生成に強いか」を experiments で見る）。
- デフォルトは最初の実験を作る時に1つ決める。差し替え可能にしてあるので後悔しない選択。

---

## 背景：GenUI の道具メニュー

> ここから4セクションは「どんな道具があるか」の背景知識。**比較自体が目的ではない**。最初の道具選びと、別アプローチに乗り換えたくなった時の地図として使う。

### Generative UI とは

> UIの一部を、開発者が完全に事前定義するのではなく、**AIエージェントがランタイムに生成・選択・制御する**パターン。

「AIがコーディングを支援する」から「AIが直接インターフェースを生成する」への移行として位置づけられます。

### アプローチの分類（制御度のスペクトラム）

CopilotKit が提唱する分類が事実上の共通言語になっています（※ AG-UI 開発元によるフレーミングであり、業界中立の標準分類ではない点に留意）。

| 制御度 | アプローチ | 仕組み | 代表 |
|---|---|---|---|
| 強 | **Controlled（tool-call型）** | 事前構築したコンポーネントをエージェントが選んで呼ぶ | AG-UI `useFrontendTool`, assistant-ui（従来型） |
| ↕ | **Declarative（spec / JSON-renderer型）** | エージェントが構造化JSONのUI記述を返し、クライアントが自前コンポーネントで描画 | **A2UI / Vercel json-render / assistant-ui（新primitive）** |
| ↕ | **Open-ended** | 完成したUIサーフェスをホスト | MCP Apps |
| 弱 | **Open（HTML直接生成型）** | サンドボックスiframe内で生HTML/SVGを生成 | CopilotKit `useComponent` |

もう一軸として **RSCストリーミング型**（Vercel AI SDK 3.0）があるが、現在は後退（下表参照）。

### 主要ライブラリ・仕様の比較（2026年6月時点）

| 名前 | 種別 | 思想 / 位置づけ | 対応フレームワーク | ライセンス | 状態 |
|---|---|---|---|---|---|
| **A2UI**（Google主導） | spec / プロトコル | UI記述の**標準**。クロスエージェント相互運用が目的 | React / Flutter / Lit / Angular の公式レンダラ + `@a2ui/web_core` | Apache 2.0 | v0.8(2025-12) → v0.9(2026-04) → v0.9.1安定 / v1.0 RC |
| **Vercel json-render**（Vercel Labs） | ツール / フレームワーク | Zodでカタログ定義 → 制約付きJSON生成 → ストリーミング描画。特定アプリのコンポーネント集合に密結合 | React / Vue / Svelte / Solid / React Native / ink | Apache 2.0 | 2026-01公開、13k+ stars |
| **assistant-ui** | ライブラリ | tool-call型と **JSON-spec型の両対応**（allowlistで安全境界） | React | OSS | JSON-spec primitive を 2026-05 追加 |
| **AG-UI**（CopilotKit製） | トランスポート | UI仕様ではなく**伝送レイヤ**。任意のUI仕様を運ぶイベントプロトコル（約16イベント型） | フレームワーク横断 | OSS | 14k+ stars、活発 |
| **Vercel AI SDK 3.0（RSC）** | RSCストリーミング | tool call を React Server Components にマッピング | **Next.js依存** | — | ⚠️ experimental・非推奨化。v5で `@ai-sdk/rsc` に分離、`render` API削除。AI SDK UI への移行推奨 |

- **A2UI と json-render は同じパイプライン**（AI → JSON → コンポーネントカタログ → UI）だが、**A2UI = プロトコル / json-render = ツール** という位置づけの違い。
- spec / JSON-renderer 系は **LLM出力が構造化JSON** のため、特定プロバイダーに依存しにくい。

#### まだ未検証（要追加調査）

次の注目株は今回の厳密検証では確証に至らず、本リポジトリでは未分類。箱に含める前に別途調査する：

- **Thesys C1** / **Tambo** / **crayon** / **LlamaIndex**

### いま起きていること：レイヤ分離

Oracle・CopilotKit・Google が3つのオープン仕様を **競合ではなく補完レイヤ** として整列させ始めている：

```
Agent Spec (Oracle)  … 何が動くか（エージェント定義）
      ↓
AG-UI (CopilotKit)   … インタラクションの伝送（パイプ）
      ↓
A2UI (Google)        … ユーザーが触れるUIの描画（中身）
```

各層を独立に差し替え可能、という設計思想。**いずれ実験箱の構成に効く論点**だが、いま据える足場ではない（→「実験の進め方」）。
（※ ベンダー共同のポジショニングであり、本番相互運用の成熟度が第三者監査された訳ではない）

---

## 実験の進め方（縦スライス優先）

> 「各層（トランスポート / UI記述 / レンダラ）をいろんなライブラリで作って差し替え・組み合わせる」のは魅力的だが、**その統一フレームワークを最初に建てるのはしんどい上に早すぎる**。形がまだ見えていない抽象を背負うと動きが鈍るし、この領域は変化が速く、今組んだ抽象はすぐ陳腐化する。

- **縦スライス優先**: まず1つを、自前で閉じたままエンドツーエンドで動かす。重複は気にしない。
- **共通化は後から**: 同じ配線を **2〜3回書いた** と気づいた時点で `packages/` に抽出する。先に共通基盤を設計しない。
- **「レイヤ分離・差し替え可能」は仮説**: 建てる足場ではなく、検証する対象。横並びの実装が増えた結果、共通インターフェースが自然に浮かべば抽出する。浮かばないなら「分離は割に合わない」も立派な実験結果。
- **オーケストレーションも段階的に**: まず単発で動かし、多ターン → 操作フィードバック → ストリーミングと足していく（→「ロードマップ」）。一気に作らない。
- したがって `packages/` は当面空でよい。

---

## ディレクトリ構成

```
genui-greenhouse/
├── pnpm-workspace.yaml
├── package.json          # ルート: 共通 devDeps（prettier 等）と横断スクリプトのみ
├── experiments/          # 1実験1ディレクトリ。各自エンドツーエンドで完結・独立起動
│   ├── 01-<usecase>/      # 例: 探索ダッシュボード on json-render
│   └── 02-<usecase>/
└── packages/             # ← 最初は空。共通が3回書かれてから抽出する
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "experiments/*"
  - "packages/*"
```

- 各実験は own `package.json` / `.env.local` / 別ポートを持ち、独立して起動する。
- `pnpm --filter <name> dev` で1実験だけ立てられる。依存は workspace でホイストされ二重インストールにならない。
- 命名は型 / 題材で。Phase 2 で「同じお題を別ライブラリ」をやる時は `<お題>-<library>` 等で揃えると差分が見やすい。
- **Turborepo** はビルド / lint の並列・キャッシュが欲しくなってから足す。最初は不要。

---

## ユースケースの探索軸 / テストベッド候補

「何に効くか」を探るのが目的なので、**データセットだけでなく "使い方の型" も探索対象**。型 × 題材の組み合わせで実験を選ぶ。

### 使い方の型（archetype）

| 型 | GenUI がやること | 例 |
|---|---|---|
| 探索ダッシュボード | 問いに応じて部品とデータを選び専用ビューを組む | 「Xを比較」「ランキング見せて」 |
| ガイド付きフォーム / ウィザード | 文脈に応じて入力 UI を生成・分岐 | 設定生成、申込みフロー |
| 適応的な解説 / 学習 | 理解度・質問に応じて図解や練習を出し分け | チュートリアル、クイズ |
| エージェント結果の可視化 | 中間 / 最終結果をリッチ UI で返す | 検索・分析エージェントの返答 |

### 題材（中立テストベッド）候補

ライブラリ / プロバイダー比較を歪めない題材の条件: **キー不要・無料・見た目が出る・データ異種混在**。

| お題 | データ源（無料 / キー） | GenUI で映える点 |
|---|---|---|
| 宇宙コックピット | NASA APOD / Mars / NeoWs / ISS（ほぼキー不要） | 画像・軌道・接近タイムライン。ビジュアル最強 |
| リアルタイム地球モニタ | USGS地震 / OpenSky航空 / Open-Meteo（キー不要） | ライブ地図 + 分布 + タイムライン |
| カルチャー探索 | TMDB映画 / Jikanアニメ（無料） | ポスター・ランキング・比較・相関 |
| カクテル / 料理ラボ | TheCocktailDB / TheMealDB（キー不要） | レシピカード + 材料 + 代替提案。摩擦ほぼゼロ |

> ✅ **最初の実験は確定**: 型 = **探索ダッシュボード** × 題材 = **宇宙コックピット**（言語化は [`docs/space-cockpit.md`](docs/space-cockpit.md)）。残りの型・題材は今後の実験で探索する。

---

## ロードマップ（バックログ）

探索フェーズなので確定計画ではなく「**考える順番**」。

### Phase 0 — 最小で動く1本

- [x] 使い方の型 × 題材を1つ選ぶ → **探索ダッシュボード × 宇宙コックピット**（→ [`docs/space-cockpit.md`](docs/space-cockpit.md)）
- [x] デフォルト LLM プロバイダー → **Azure OpenAI（先行デモと同じ / `@ai-sdk/azure`）**。public 時は各自が env で差し替え
- [x] pnpm workspace + `experiments/` 骨格
- [x] **単発オーケストレーション**を1本通す: ユーザー入力 → LLM がアクション選択 → サーバが実データ取得＆**計算** → spec → 描画（→ exp01）

### Phase 1 — オーケストレーションを段階的に

- [x] マルチターン（直前の文脈を踏まえて UI を更新）（→ exp02 §10/§12）
- [x] 操作のフィードバックループ（ActionButton → ask で問いを投げ直し → 画面が組み直る。exp01/02）
- [x] ストリーミング描画（spec を逐次 = Compose-Live）
- [ ] 2nd pass（取得データに所見を書く等の追い足し）
- [x] **真の agentic ループ**（multi-step tool loop・tool 結果が文脈に再投入される）＋データファイアウォールの境界（→ exp02）

### Phase 2 — 横に広げて学ぶ

- [x] 別の型 / 題材でもう1本（GenUI が**効く / 効かない境界**を体感）（→ exp02 = エージェント結果可視化 × 地球モニタ）
- [ ] 別ライブラリ（A2UI / assistant-ui）で同じお題 → 作り味を比較
- [ ] 別プロバイダーで構造化出力の質を観察
- [ ] 「カタログ + JSONツリー」共通インターフェースの抽象化可能性を**検証**（足場を先に建てない。3回重複してから抽出）

---

## 設計原則（実装で効くやつ）

以前 GenUI デモを作った時の教訓のうち、題材が変わっても効くもの:

- **計算は spec に持たせず、サーバで値にして返す**。テンプレート側に算術（比較・集計・割合）を入れると破綻する。比較や集計はサーバで済ませ、UI には完成した値だけ渡す。
- **データに出所・粒度を背負わせる**。「この数字が何の母数で・いつ時点か」を値と一緒に返すと、UI が嘘をつかない。
- **責務分離**: LLM は「どのアクション / 部品を選ぶか」を決め、データ取得と計算はサーバが持つ。

---

## 参考リンク

- [The Developer's Guide to Generative UI in 2026 — CopilotKit](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)
- [A2UI v0.9 — Google Developers Blog](https://developers.googleblog.com/a2ui-v0-9-generative-ui/)
- [CopilotKit/generative-ui — GitHub](https://github.com/CopilotKit/generative-ui)
- [vercel-labs/json-render — GitHub](https://github.com/vercel-labs/json-render) / [InfoQ 解説](https://www.infoq.com/news/2026/03/vercel-json-render/)
- [assistant-ui: Generative UI — Docs](https://www.assistant-ui.com/docs/tools/generative-ui)
- [AG-UI Protocol — Docs](https://docs.ag-ui.com/introduction)
- [Announcing Agent Spec for A2UI / CopilotKit / AG-UI — Oracle](https://blogs.oracle.com/ai-and-datascience/announcing-agent-spec-for-a2ui-copilotkit-ag-ui)
- [AI SDK RSC → UI 移行ガイド — Vercel](https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui)

> 出典の多くはベンダー自身の発表。定義・アーキテクチャ等の記述的事実は独立裏付けがあるが、優位性主張・採用規模・成熟度には自己宣伝バイアスが残りうる。
