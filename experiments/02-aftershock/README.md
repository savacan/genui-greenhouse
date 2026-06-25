# 実験02: aftershock（agentic ループ × データファイアウォール）

真の agentic ループ（multi-step tool loop でモデル自身が何手も回す・tool 結果が文脈に再投入される）と、データファイアウォール（生データを LLM に通さない）の緊張点を線引きする学習装置。設計の言語化＋ Phase 0 確定設計は [`../../docs/aftershock.md`](../../docs/aftershock.md)、リポジトリ方針は [`../../CLAUDE.md`](../../CLAUDE.md)。

題材 = 地球モニタ（**USGS 地震 → 震源座標で Open-Meteo 気象 ＆ Wikipedia 近傍記事**）。動かす変数はオーケストレーションのみ（01 の単発2段 → モデル駆動の多段）。ライブラリ=json-render / プロバイダー=Azure は 01 固定で写経。

## 起動

```bash
pnpm install                         # リポジトリルートで（workspace 一括）
pnpm --filter aftershock probe       # Phase A: LLM 抜きでデータ層を実 API 検証（鍵不要）
pnpm --filter aftershock dev         # → http://localhost:3102（Phase B/C 以降）
```

## いまの状態（Phase A–C ✅・2026-06-25 ライブ検証・Azure OpenAI）

- **Phase A データ層 ✅** — `lib/monitor/actions/{usgs,weather,nearby,opensky}.ts` ＋ `state-store.ts` ＋ `tools.ts`（Action → AI SDK tool 工場・`toModelOutput` で部分ファイアウォール）。
  - 検証: `scripts/probe.mts` が **chain（quakes → 最強 eventId で quakeDetail → 震源座標で weather/nearby）** を実 API で叩き、各 action の `state` / `StateHint` / `toModel(state)`（モデルに戻すスカラー）を確認。固定座標テスト（Tokyo=密 / 洋上=疎）も。
- **Phase B 描画層 ✅** — 01 の render 層を写経し地球モニタ部品（QuakeList/MagnitudeBars/Beachball/ShakeMapImage/WeatherTile/Sparkline/ArticleGrid/AlertBanner）に差し替え。`/demo` で手書き spec を実ブラウザ描画確認（実 USGS ShakeMap 画像ロード・$state バインド・sanitize で不正要素除去）。
- **Phase C 生成ループ ✅** — `app/api/generate/route.ts` を **multi-step tool loop**（`streamText` + `tools` + `stopWhen:[stepCountIs(8), hasToolCall("done")]`）に。モデルが quakes→quakeDetail→weather/nearby→done を自分でたどり、`toModelOutput` がスカラー要約だけ文脈に戻す（生 slice は `$state`）。loop 収束後に別 `streamText` で compose。`app/page.tsx` は per-step ステッパ（思考連鎖を ◌→✓ 可視化）＋ Compose-Live ＋ Verdict-Tempo。
  - ライブ検証: 「最大の地震の震源、今どんな天気で周りに何がある？」→ 4手（quakes/quakeDetail/[weather,nearby]/done）・各手 `textLen=0`（中間散文ゼロ）・生配列は文脈に出ず `$state` のみ＝**部分ファイアウォール成立**。盤面に発震機構ビーチボール＋実 ShakeMap＋気象＋周辺が自己組成。
- **境界の特定と修正 ✅**（[`../../docs/aftershock.md`](../../docs/aftershock.md) §8）— 複合クエリ（「トップ3比較」）は当初 thrash で1件しか組めなかった（firewall が単一 `strongestEventId` しか戻さず #2/#3 を名指せない）。(a) `quakes.toModel` に addressable list `topEvents`、(b) `$state` を per-tool-call 名前空間（`Action.instanceKey`）にして再走 → **4手で収束・3イベントを横並び比較・トークンはむしろ減少**（12.5k→7.1k）。線を適切に広げると多エンティティ調査は性能・コスト両取りだった。
- **案A vs 案B 対照 ✅**（§9・`app/api/generate-terminal/route.ts`）— compose をループに畳む案B（終端 `renderSpec`）を実装し A/B。firewall（機密）は両者保つ。だが案B はモデルが反復構文を発明（`${id}` 補間・`state` への足場 inline）して比較セクションが描画不能＋トークン約3.9倍。**describe()／2回呼び分けは「concrete 列挙を強制する」ために load-bearing**（パス発見のためではない）。当初予想「案Bは生データを spec に漏らす」は外れ＝漏れるのでなく spec が壊れる。
- **多ターン会話 ✅**（§10）— route を履歴対応（`buildTurnPrompt`・載せるのは**ユーザー問いの流れだけ**＝データはターンまたぎでも持ち越さない）。turn1「いちばん大きい地震を詳しく」→ turn2「**その震源**の周りは？」で参照解決○・remount○・**ターンまたぎでも文脈が肥大しない**（入力トークン base 1281→1367）。代償＝$state 非持ち越しゆえ参照フォローアップでも再フェッチ（再フェッチ税）。
- **「濃すぎ」側＝トップN拡大の限界 ✅**（§11・`ADDRESSABLE_TOP_N`）— 射程は線幅に正比例（cap=5→トップ8は静かに5件 truncate／cap=10→トップ10を208要素で coherent 組成）。**「濃すぎ」はトークン肥大ではない**（10件でも totalIn≈10.8k＝firewall が文脈を膨らませない）。本当の上限は **wall-clock 遅延（10件で2.9分）と盤面の情報過多**。線幅は「待ち時間と1画面の情報量」で決める（既定5がスイートスポット）。

## スタック

Next 16 / React 19 / zod 4 / `@json-render/*` 0.19 / AI SDK `ai` v6（既定プロバイダ Azure OpenAI、env で差し替え）。データ源は全て鍵不要（USGS / Open-Meteo / Wikipedia / OpenSky 任意）。
