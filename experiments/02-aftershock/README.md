# 実験02: aftershock（agentic ループ × データファイアウォール）

真の agentic ループ（multi-step tool loop でモデル自身が何手も回す・tool 結果が文脈に再投入される）と、データファイアウォール（生データを LLM に通さない）の緊張点を線引きする学習装置。設計の言語化＋ Phase 0 確定設計は [`../../docs/aftershock.md`](../../docs/aftershock.md)、リポジトリ方針は [`../../CLAUDE.md`](../../CLAUDE.md)。

題材 = 地球モニタ（**USGS 地震 → 震源座標で Open-Meteo 気象 ＆ Wikipedia 近傍記事**）。動かす変数はオーケストレーションのみ（01 の単発2段 → モデル駆動の多段）。ライブラリ=json-render / プロバイダー=Azure は 01 固定で写経。

## 起動

```bash
pnpm install                         # リポジトリルートで（workspace 一括）
pnpm --filter aftershock probe       # Phase A: LLM 抜きでデータ層を実 API 検証（鍵不要）
pnpm --filter aftershock dev         # → http://localhost:3102（Phase B/C 以降）
```

## いまの状態（Phase A）

- **データ層 ✅（2026-06-25・実 API 検証）** — `lib/monitor/actions/{usgs,weather,nearby,opensky}.ts` ＋ `state-store.ts` ＋ `tools.ts`（Action → AI SDK tool 工場・`toModelOutput` で部分ファイアウォール）。
  - 検証: `scripts/probe.mts` が **chain（quakes → 最強 eventId で quakeDetail → 震源座標で weather/nearby）** を実 API で叩き、各 action の `state` / `StateHint` / `toModel(state)`（モデルに戻すスカラー）を目視確認。固定座標テスト（Tokyo=密 / 洋上=疎）も。
- **Phase B（未）** — 01 の render 層を写経し地球モニタ部品に差し替え、ハンド spec で描画確認。
- **Phase C（未）** — `app/api/generate/route.ts` を単発2段 → multi-step tool loop に書き換え、Azure で配線。

## スタック

Next 16 / React 19 / zod 4 / `@json-render/*` 0.19 / AI SDK `ai` v6（既定プロバイダ Azure OpenAI、env で差し替え）。データ源は全て鍵不要（USGS / Open-Meteo / Wikipedia / OpenSky 任意）。
