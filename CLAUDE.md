# genui-greenhouse

Generative UI を「**何に・どう使うと効くか**」を、動くものを作りながら掴む個人実験リポジトリ（苗床）。
**目的・方針・道具立て・ロードマップは `README.md` が正。着手前に必読。**

## 目的（取り違えない）

- 主眼は **ユースケースと使い心地の探索**。「GenUI はどんなタスクに効いて、どう組むと気持ちよく、どこで破綻するか」を体感で掴む。
- **ライブラリ / プロバイダーの比較は目的ではない**。道具選びと、後の乗り換え地図として背景に置くだけ。

## このリポジトリで守ること

- **縦スライス優先・共通基盤を先に作らない**。1実験をエンドツーエンドで単独完結。重複は2回まで許す。**3回書いてる**と気づいてから `packages/` に抽出。「各層を差し替え可能にする統一インターフェース」は検証する仮説であって、最初に建てる足場ではない。`packages/` は当面空でよい。
- **オーケストレーションは段階的に**。まず単発（入力 → LLM がアクション選択 → サーバが実データ取得＆計算 → spec → 描画）。動いてから 多ターン → 操作フィードバック → ストリーミング と足す。一気に作らない。
- **計算は spec に持たせずサーバで値にして返す**（テンプレートに算術＝集計・割合・比較を入れると破綻する。json-render の `$math` も使わない）。表示整形（`$format`：通貨・％・日付）は spec 側でよい。データには出所・粒度を背負わせる。
- **1実験1ディレクトリで隔離**（`experiments/<name>/`）。各実験は own `package.json` / `.env.local` / 別ポートで独立起動。
- **LLM はプロバイダー非依存**。Vercel **AI SDK Core** 越しに叩き、プロバイダーは env で差し替え。1社にハードコードしない。json-render の標準経路は `streamText` + `catalog.prompt()`（モデルが JSONL patch で spec を構成 → 逐次描画）。構造化制約をかけたいときだけ `catalog.zodSchema()` / `jsonSchema()`。※ `generateObject` / `streamObject` は AI SDK v6 で非推奨（→ `streamText` / `generateText`）。非推奨の AI SDK 3.0 RSC（`render` API）とも別物。
- 秘密情報（API キー等）は `.env.local` のみ。コード・コミット・ログに含めない。

## スタック / ツール

- TypeScript 端から端まで（Next.js）。レンダラは json-render。LLM は AI SDK Core で抽象化。
- pnpm workspace（`experiments/*` と `packages/*`）。`pnpm --filter <name> dev` で1実験だけ起動。
- Turborepo は実験が増えてから。最初は不要。

## ステータス

- 2026-06-22: 方針を「ライブラリ比較」→「ユースケース探索＋作りながら学ぶ」に据え直し（README / CLAUDE.md 改訂）。スタックは TS / Next.js / json-render + AI SDK Core 抽象で確定。題材・使い方の型・デフォルトプロバイダーは未確定（探索中）。コードはまだ無い。
- 2026-06-23: 最初の実験を確定 = **探索ダッシュボード × 宇宙コックピット**。デフォルト LLM = Azure OpenAI（先行デモと同じ、`@ai-sdk/azure` で抽象の中。public 時は env 差し替え）。「何を作るか」の言語化を [`docs/space-cockpit.md`](docs/space-cockpit.md) に記録。コードはまだ無い。
- 2026-06-23: 一次ソース recon 完了、**Phase 0 設計を確定**。spec は LLM が構成（`streamText` + `catalog.prompt()`）／データはサーバ先取得で `initialState` 注入・LLM には生データを通さず `$state` パス＋要約のみ／計算はサーバ・表示整形のみ `$format`。json-render 実態の訂正＝駆動は `streamText`（`generateObject` ではない）・最新 **0.19.0**・peer 床 React 19 / Next 16 / zod 4。NASA(APOD/NeoWs)・ISS の実レスポンス検証済み（→ space-cockpit.md「API 確認結果」）。実装はこのセッション以降で進めてよい。
- 2026-06-25: **exp01 space-cockpit 完了・マージ済（PR #1）**。探索ダッシュボード × 宇宙の縦スライスを通し、単発オーケストレーション＋使い心地（待ちのシネマ化・Verdict-Tempo 等）を確立。
- 2026-06-25: **exp02 aftershock 完了（PR #2・`exp/02-aftershock`）**。真の agentic ループ（multi-step tool loop）× データファイアウォールの**境界地図**を `docs/aftershock.md` §8–§12 に記録。貫く軸＝**「スカラーは通す・生配列は通さない」**（ループ内・spec 経路・濃さの上限・ターン境界の全てで同型に効く）／動かすのは常に「線の幅 ↔ 射程・コスト・レイテンシ」。主な発見: 線を適切に広げると多エンティティ調査は性能・コスト両取り（§8）／compose をループに畳む案B は spec バインドが壊れ describe 層は load-bearing（§9）／多ターンは firewall をターン境界でも保つ（§10）／「濃すぎ」の上限はトークンでなく遅延＋情報過多（§11）／越境スカラーで再フェッチ税を消せる（§12）。Phase 1 マルチターン・Phase 2「別の型/題材でもう1本」を充足。
