# genui-greenhouse

> Generative UI（生成UI）の各種ライブラリ・仕様・プロトコルを、隔離した環境で気軽に育てて比較するための実験リポジトリ（= 苗床 / greenhouse）。

特定のスタックに縛られず、「何が・どう違って・何に向くか」を手を動かして確かめることを目的にしています。LLM プロバイダーは未定で、**プロバイダー非依存**の視点を重視します。

---

## このリポジトリのゴール

- Generative UI まわりの主要なアプローチ／ライブラリを **横断的に試す**
- それぞれの思想・成熟度・フレームワーク依存・サーバ要否を **実地で比較する**
- 「複数の実装を共通の見方で差し替えられるか」を探る

> ⚠️ この領域は変化が非常に速いです。下記の情報は **2026年6月時点** のスナップショットであり、バージョンや対応状況はすぐ陳腐化します。各項目は実装前に必ず一次ソースを確認してください。

---

## Generative UI とは

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

---

## 主要ライブラリ・仕様の比較（2026年6月時点）

| 名前 | 種別 | 思想 / 位置づけ | 対応フレームワーク | ライセンス | 状態 |
|---|---|---|---|---|---|
| **A2UI**（Google主導） | spec / プロトコル | UI記述の**標準**。クロスエージェント相互運用が目的 | React / Flutter / Lit / Angular の公式レンダラ + `@a2ui/web_core` | Apache 2.0 | v0.8(2025-12) → v0.9(2026-04) → v0.9.1安定 / v1.0 RC |
| **Vercel json-render**（Vercel Labs） | ツール / フレームワーク | Zodでカタログ定義 → 制約付きJSON生成 → ストリーミング描画。特定アプリのコンポーネント集合に密結合 | React / Vue / Svelte / Solid / React Native / ink | Apache 2.0 | 2026-01公開、13k+ stars |
| **assistant-ui** | ライブラリ | tool-call型と **JSON-spec型の両対応**（allowlistで安全境界） | React | OSS | JSON-spec primitive を 2026-05 追加 |
| **AG-UI**（CopilotKit製） | トランスポート | UI仕様ではなく**伝送レイヤ**。任意のUI仕様を運ぶイベントプロトコル（約16イベント型） | フレームワーク横断 | OSS | 14k+ stars、活発 |
| **Vercel AI SDK 3.0（RSC）** | RSCストリーミング | tool call を React Server Components にマッピング | **Next.js依存** | — | ⚠️ experimental・非推奨化。v5で `@ai-sdk/rsc` に分離、`render` API削除。AI SDK UI への移行推奨 |

- **A2UI と json-render は同じパイプライン**（AI → JSON → コンポーネントカタログ → UI）だが、**A2UI = プロトコル / json-render = ツール** という位置づけの違い。
- spec / JSON-renderer 系は **LLM出力が構造化JSON** のため、特定プロバイダーに依存しにくい。

### まだ未検証（要追加調査）

次の注目株は今回の厳密検証では確証に至らず、本リポジトリでは未分類。箱に含める前に別途調査する：

- **Thesys C1** / **Tambo** / **crayon** / **LlamaIndex**

---

## いま起きていること：レイヤ分離

Oracle・CopilotKit・Google が3つのオープン仕様を **競合ではなく補完レイヤ** として整列させ始めている：

```
Agent Spec (Oracle)  … 何が動くか（エージェント定義）
      ↓
AG-UI (CopilotKit)   … インタラクションの伝送（パイプ）
      ↓
A2UI (Google)        … ユーザーが触れるUIの描画（中身）
```

各層を独立に差し替え可能、という設計思想。**実験箱の構成に直接効く論点**。
（※ ベンダー共同のポジショニングであり、本番相互運用の成熟度が第三者監査された訳ではない）

---

## このリポジトリの方針（暫定）

リサーチを踏まえた現時点の仮説：

- **トランスポート層（AG-UI）と UI記述層（JSON spec）を分離** する構成にすると、A2UI / json-render / assistant-ui の spec系を「**コンポーネントカタログ + JSONツリー描画**」という共通インターフェースで差し替えやすい。
- **spec / JSON-renderer 系はプロバイダー非依存** なので、プロバイダー未定の現状と相性が良い。実験の中心に据える候補。
- **RSC型（AI SDK 3.0）は中心に据えない**。Next.js依存 + 非推奨化のため、歴史的経緯として触れる程度。
- 各実験は **1ライブラリ1ディレクトリで隔離** し、互いに干渉させない（ディレクトリ構成は今後追加）。

---

## ロードマップ（バックログ）

- [ ] `experiments/` の骨格づくり（1ライブラリ1ディレクトリ）
- [ ] 最初の実験対象を1つ選んで最小動作サンプル（A2UI か json-render が有力候補）
- [ ] 未検証ライブラリ（Thesys C1 / Tambo / crayon / LlamaIndex）の追加調査
- [ ] 「カタログ + JSONツリー」共通インターフェースの抽象化可能性を検証
- [ ] LLMプロバイダーの選定（structured output / tool calling の安定性比較）

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
