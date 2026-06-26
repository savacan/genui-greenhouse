# 実験03: pokefinder（GenUI が双方向の入力UIを組む）

genui-greenhouse の3本目。**「LLM がその場で“動く入力フォーム”（チェックボックス/セレクト/スライダーを two-way バインド）を組み、ユーザーの操作 → サーバ計算 → 結果ボード、という双方向ループを GenUI で回せるか」**を線引きする学習装置。

> Phase 0 の確定設計 + 一次ソース recon（2026-06-25/26）。着手前に [`../CLAUDE.md`](../CLAUDE.md)（方針・規律）と 01/02 の実装（写経元）を読むこと。

---

## 0. この実験が動かす唯一の変数（取り違えない）

苗床の目的は「GenUI が効く/効かない**境界の地図**」。exp01/02 は**どちらも read-only な出力ダッシュボード**だった（`actions:{}` 空・唯一の対話は `on:{click:{action:"ask"}}` で全サーバ往復＝完全に「LLM が出力UIを描く」）。マトリクスの最大の空白は archetype×題材ではなく **GenUI の“役割”**＝**出力描画 vs 入力/双方向**。exp03 はそこへの最初の一歩。

| | 01 / 02 | 03 pokefinder |
|---|---|---|
| GenUI の役割 | 出力UIを描く（read-only） | **入力UIを組む**（two-way・state を持つ） |
| 動かす変数 | — | **「LLM が双方向の入力フォームを組めるか」だけ**。ライブラリ=json-render / プロバイダー=Azure OpenAI / 単発 compose は 01 から写経で固定。 |
| 題材 | 宇宙 / 地球モニタ | ポケモン（タイプ×世代×種族値で相棒探し） |

**核の問い（観察装置として残すもの）**:
> LLM は `$bindState` で **value を state に双方向結合した入力部品**（Checkbox/Select/Slider）を正しく組めるか。組んだフォームは**使い心地として成立する**か（過不足・誤バインド・FEEL）。トグル → 送信 → 再構成のループはどこで気持ちよく/破綻するか。

**スコープ規律（単一変数を守る）**: 第1段は「**LLM が two-way 入力フォームを組む**」だけに絞る。`$cond` によるクライアント側集合フィルタ（＝計算をクライアントに持ち込む）は**次実験へ繰り延べ**（CLAUDE.md「計算はサーバ」と衝突しないため）。絞り込み計算は**サーバ**でやる。

---

## 1. 体験（問い → LLM がフォームを組む → 操作 → 結果）

```
入力「炎か飛行タイプで、第1〜3世代、素早さ高めの相棒さがして」
  → ① 単発 compose（01 同型）: LLM が「ファインダーフォーム」spec を組む
       - タイプのチェックボックス群（$bindState /shelf/type/<name>）
       - 世代のセレクト（$bindState /shelf/generation）
       - 種族値しきい値スライダー（$bindState /shelf/minSpeed 等）
       - 「探す」ActionButton
       - spec.state に初期選択（問いから埋める）
  → ② ユーザーがフォームを操作 = クライアント内 state がライブに変わる（サーバ往復なし）
  → ③「探す」→ 現在の state をサーバへ → サーバが積集合＋種族値フィルタを計算 → 結果ボード再構成（スプライトカード）
```

「探す」の送信は **`ask` 経路の再利用**（01）で実装する：page が `JSONUIProvider onStateChange` で現在の shelf state を ref に保持 → ActionButton の ask ハンドラがそれを読んで `/api/generate` に投げる。**action params に state を解決させる必要はない**（MVP は onStateChange + ref で閉じる）。

---

## 2. データ源（recon 済・2026-06-25/26 live・鍵不要 / CORS `*` / 実質無制限）

**PokéAPI**（`https://pokeapi.co/api/v2/`）:
- `type/<name>`（例 `type/fire`）→ そのタイプの全ポケモン（fire=109・water=192・**cap なし**）。`pokemon[].pokemon.{name,url}`。
- `generation/<id>`（例 `generation/1`）→ その世代の `pokemon_species[]`（gen1=151）。
- `pokemon/<name|id>` → `stats[]`（hp/attack/defense/special-attack/special-defense/speed の `base_stat`）・`sprites.front_default`（PNG URL・即 `<img>`）・`types[]`。
- フォーム語彙: `type?limit=50`（18種＋stellar/unknown）・`generation`（9）。
- 鍵不要・CORS `*`・レート実質無制限（fair-use なので type リスト等は in-memory キャッシュ推奨）。

**※ 当初題材だったカクテル（TheCocktailDB）は廃案**: 無料 test key が **`filter.php?i=<材料>` を1件に cap**（プレミアム gate・実測 Gin/Vodka…すべて1件）＝「手持ち材料→作れるカクテル」の核が keyless で不成立。category/glass/alcoholic フィルタや search は動くが、PokéAPI の方が「セットから絞る」体験を無料で完全再現でき視覚的なので乗り換え。

---

## 3. サーバ計算（CLAUDE.md「計算は spec でなくサーバで値に」）

1回の API では取れない「条件に合うポケモン集合」を**サーバで計算**:
- 選択タイプ各々の `type/<t>` を並列取得 → **id/name の積集合**（AND）。
- `generation/<g>` の species と積集合。
- 積集合の各ポケモンを `pokemon/<name>` で取得 → **種族値しきい値でフィルタ**＋並べ替え（指定軸 desc）。
- 返すのは**値**（name/sprite url/types/各 base_stat/合計種族値・該当件数）。spec 側に算術を入れない（表示整形 `$format` のみ）。
- 積集合は小さくなるので最終 lookup の N+1 は実害なし（必要なら type リストだけ軽くキャッシュ）。

**初期フォーム用**にも、type 一覧（18・色付き）・generation 一覧（9）はサーバが語彙として用意（LLM に作らせない＝出所を背負わせる）。

---

## 4. json-render 双方向 API（recon 済・**ソースで確定**・0.19.0）

exp01/02 は state/actions 未使用。exp03 の核なのでインストール済みソースで確認済み（[[verify-library-from-source]]）:

- **`spec.state`**（`@json-render/core` store-utils d.ts: `interface Spec { root; elements; state? }`）= LLM が初期 state を spec に埋める。`JSONUIProvider initialState` とマージ。
- **読み vs 双方向**: `{ $state: "/p" }`=読み取り専用 / **`{ $bindState: "/p" }`=双方向**（input の value をこれで結ぶ） / `$bindItem`（repeat 内 two-way） / `$template`（文字列補間）。
- **`useBoundProp(propValue, bindingPath): [value, setValue]`**（`@json-render/react`）= 入力部品の two-way フック。`setValue` が `StateStore.set(path, v)` を呼ぶ。
- 部品が受け取るのは `{ props（解決済み値）, bindings（propName→state path）, emit, on, loading }`。`resolveBindings` が `$bindState` を `bindings` に抽出。
- **`JSONUIProvider`** が StateStore を管理。`initialState` / `onStateChange(changes)` / `handlers` / `directives`。`onStateChange` で現在 state を page 側 ref に拾える（=「探す」送信用）。
- `standardDirectives` から `$math` は除外（01/02 同様・計算はサーバ）。`$format` は使う。

**確定した最小の動く例**（これが書ければ buildable＝確認済み）:
```ts
// catalog
Checkbox: { props: z.object({ label: z.string(), value: z.boolean() }),
  description: "two-way。value は { $bindState: '/path' } を渡す" }

// registry
Checkbox: ({ props, bindings }) => {
  const [checked, setChecked] = useBoundProp<boolean>(props.value, bindings?.value);
  return <label><input type="checkbox" checked={checked ?? false}
    onChange={(e) => setChecked(e.target.checked)} /> {props.label}</label>;
}

// LLM が出す spec
{ "root":"root", "state": { "shelf": { "type": { "fire": true } } },
  "elements": {
    "root": { "type":"Stack", "children":["cbFire","echo"] },
    "cbFire": { "type":"Checkbox", "props": { "label":"ほのお",
       "value": { "$bindState": "/shelf/type/fire" } } },
    "echo": { "type":"Text", "props": { "text": { "$template":"fire=${/shelf/type/fire}" } } } } }
```
詳細な確認ログ: scratchpad の `exp03-concrete-example.md`（ソース file:行 付き）。

---

## 5. ディレクトリ / 写経（01/02 から）

別ポート **3103**（01=3101 / 02=3102）。own `package.json`（name=`pokefinder`）/ own `.env.local`（Azure creds を 01/02 からローカルコピー・gitignore）。
- `lib/finder/`（data+LLM）: types/model/fetchJson は写経。actions = `pokeTypes`(語彙) / `findMons`(積集合＋種族値フィルタ＝サーバ計算) / `monDetail`(任意)。compose.ts 写経。
- `lib/render/`（描画）: 01/02 の renderer/sanitize/registry を写経 ＋ **新規の入力部品**（Checkbox/Select/Slider を `useBoundProp` で two-way）＋ 出力部品（MonCard/StatBars/TypeBadge/SpriteImg）。
- `app/api/generate/route.ts`: 01 同型の単発 compose（LLM がフォーム spec を組む）。`app/page.tsx`: 01 シェル写経 ＋ `onStateChange` で shelf state を ref 保持 → ActionButton ask 送信。

---

## 6. BUILD & VERIFY ORDER（LLM 抜きでデータ層と双方向を先に固める）

- **Phase A — データ層 + probe（LLM ゼロ）**: `lib/finder/actions/*` ＋ `scripts/probe.mts` で **積集合チェーン**（type×N 並列 → 積集合 → generation 積集合 → pokemon 種族値フィルタ）を実 API 検証。
- **Phase B — レンダラ写経 + 双方向部品 + ハンド spec（LLM なし）**: **§4 の最小 two-way 例をまず実ブラウザで動かす**（Checkbox トグル → state → Text 反映）。これが exp03 の心臓。次に Slider/Select、結果カード。`/demo` でハンド spec 描画。
- **Phase C — 単発 compose を Azure で配線**: LLM がフォーム spec を組む → トグル（クライアント local）→ ActionButton「探す」→ onStateChange ref → `/api/generate` 再送 → サーバ計算 → 結果ボード再構成。

---

## 7. 観察したいこと（成果物）

- LLM は `$bindState` の **path を正しく一貫して**振れるか（フォーム部品と spec.state の対応）。Beachball の `${}` でっち上げ（exp02 §9）のような「無い構文の発明」が入力UIでも起きるか。
- 組まれたフォームは**使い心地として成立**するか（必要なコントロールだけ・ラベル・初期値が問いから埋まるか・過不足）。
- トグル（local・即時）→「探す」（サーバ往復）→ 再構成、の**双方向ループの FEEL**（即時反映の気持ちよさ vs 再構成の待ち・remount で入力状態が飛ぶ問題はどう出るか）。
- 単一変数を守れるか（クライアント計算に逃げない・絞り込みはサーバ）。
- 破綻ログそのものが一級の成果物（exp02 と同じ姿勢）。

---

## 8. Phase A 実施ログ（データ層・LLM ゼロ・2026-06-26 検証済み）

`lib/finder/`（types/fetchJson/model 写経 ＋ actions `pokeTypes`/`findMons`）と `scripts/probe.mts` を実装。probe で **6 ケース全 OK**（実 PokéAPI）。積集合チェーン（タイプ AND → 世代積集合 → 種族値フィルタ＆並べ替え）が端から端まで動き、サーバが**値まで計算**し、`StateHint` はスカラーのみ（compose 用ファイアウォール健在）。

| # | 問い | 結果 |
|---|---|---|
| ① | pokeTypes 語彙 | 18 タイプ + 9 世代（JP ラベル・色）|
| ② | fire 単一（広い）| matched=109・cap 60 発火・total 降順 |
| ③ | fire ∩ flying | matched=8（ho-oh / charizard / moltres …）|
| ④ | water ∩ gen1 | matched=32（gyarados / lapras / blastoise …）|
| ⑤ | fire / speed≥100 / sort=speed | filteredOut=44・speed 降順 |
| ⑥ | normal ∩ ghost | matched=2（zoroark/zorua Hisui が実在）|

**設計判断**: 集合演算（AND 積集合・世代積集合）は「どの pokemon を取りに行くか」を決める **fetch のオーケストレーション**に置き、種族値の合計・しきい値フィルタ・並べ替え・行整形は **compute（pure）**に置いた。fetch/compute の 01 分離規約は内部慣習であって、I/O が論理に依存する積集合では fetch 側に計画を持たせるのが正直な形（どちらもサーバ＝spec には値だけ）。

**2つの実装知見（境界地図に追記する素材）**:
1. **フォーム重複 ↔ 世代フィルタの副作用 de-dup**: `type/<t>` は mega/gmax/地方フォームを全部含むため、total 降順の上位が `groudon-primal` / `charizard-mega-x/-mega-y/-gmax` のような**バトルフォームで埋まり base 種が重複**する（②③）。対して `generation/<id>` は `pokemon_species`（base 名のみ）なので、**世代を絞ると重複が自動的に消える**（④の water∩gen1 は mega 無しの素直な 32 件）。→ Phase C のレバー: 世代を既定で促す or サーバで base-only フィルタを足す or フォームも込みで見せる。
2. **cap × 並べ替えの順序問題**: 候補が `MAX_DETAIL`(=60) を超えると、種族値フィルタ＆並べ替えが**アルファベット cap した 60 件の中**で走る（⑤ truncated=true）。＝ matched>60 のとき「真の最速」を取りこぼし得る（hint に明示済み）。緩和＝2つ目のタイプか世代で cap 以下に縮める。これは exp02 の「線の幅 ↔ 射程／レイテンシ」と同型のつまみ（低 cap=速いが取りこぼす／高 cap=正確だが遅い）。Phase C で「探す」の FEEL に対して実値で詰める。

未検証: 真の0件パス（⑥は Hisui フォームで2件出た）— `describe` の count===0 分岐は単純なので Phase C のブラウザで確認する。

---

## 9. Phase B 実施ログ（双方向フォーム・ブラウザ検証済み・2026-06-26）

`lib/render/`（renderer/sanitize/catalog/registry 写経 ＋ **入力部品 TypeCheckbox/Select/Slider を `useBoundProp` で two-way**）＋ 出力 `MonGrid` ＋ `app/demo`（LLM 抜きのハンド spec）を実装。型チェック clean・dev(:3103) で Playwright 検証。**双方向ループが端から端まで動作**（[スクショは実機確認済み]）。

検証できた全経路（demo で実操作）:
1. `spec.state → initialState` で初期選択を seed（問い想定の fire/flying チェック済・slider=100・select=全世代）。
2. チェックボックス toggle = `useBoundProp` setValue が store を即書換（**サーバ往復なし**）。
3. spec 内 consumer（`Text` の `$template`）が store 変化で再解決（`fire=true … water=true` に即更新）。
4. 外部 `onStateChange`（デルタ `{path,value}[]`）→ page が現在 state を再構成。
5. Select の two-way（number↔string マッピングは component が吸収）。
6. **「探す」= find ハンドラ**が再構成 state から findMons 引数 `{types:["fire","flying","water"], generationId:1, minStats:{speed:100}}` を組成 ＝ **Phase C のサーバ送信形そのもの**。
7. 出力 `MonGrid` が `/findMons/mons`（静的サンプル）を sprite/タイプバッジ/種族値バーで描画。

**ソースで確定した実装の要点（[[verify-library-from-source]]）**:
- **store は `initialState` から seed され、`spec.state` からは seed されない**（react `StateProvider`: `createStateStore(initialState)`）。→ Phase C は **LLM の `spec.state` を抽出して `initialState` に渡す**（02 の `data-initialState` 部分と同型）。
- `useBoundProp<T>(props.x, bindings?.x): [T|undefined, (v)=>void]`。入力部品は `{props（解決済み値）, bindings（propName→path）}` を受け、`bindings.x` に `$bindState` のパスが入る。
- `$template` は core の binding 式（directive ではない）。トークンは `${/json/pointer}`（regex `/\$\{([^}]+)\}/g`）。未定義パスは空文字に解決（`water=` のように）。
- `JSONUIProvider onStateChange?: (changes: {path,value}[]) => void`。**デルタしか来ない**ので、page は初期 state を基準にデルタを畳んで「現在 state」を保つ（demo の `liveRef` + `applyChange`）。
- `StateProvider` は `initialState` の **参照が変わると re-flatten** する実装あり → Phase C で応答ごとに spec が来ると入力 state が初期化され得る（remount で選択が飛ぶ FEEL）。§7 の観察点。

**「探す」送信の設計確定**: action params に state を解決させず、`find` ハンドラ＋`onStateChange` 再構成 ref で閉じる（design §1 の通り・実機で確認）。Phase C は page の `find` を「ref の現在 shelf → `/api/generate` 再送 → サーバ findMons → 結果ボード再構成」に差し替えるだけ。

---

## 10. Phase C 実施ログ（単発 compose で LLM にフォームを組ませる・実 LLM 検証済み・2026-06-26）

`lib/finder/compose.ts`（2モード: `buildFormPrompt` 語彙添え / `buildResultsPrompt` hint のみ）＋ `app/api/generate/route.ts`（`intent` で form/find 分岐・01 単発 compose 写経）＋ `app/page.tsx` 本体（useChat・2モード・onStateChange ref で「探す」を閉じる）＋ renderer に `ask` ハンドラ追加。:3103 で Azure OpenAI 実呼び出し・Playwright で全ループ検証。

### 核の問いへの答え: LLM は two-way 入力フォームを正しく組めた（◎）
問い「炎か飛行で素早さ高め」に対し LLM は:
- **`$bindState` のパスを一貫して正しく**振った（`/shelf/type/fire`・`/shelf/type/flying`（TypeCheckbox.checked）・`/shelf/generationId`（Select.value）・`/shelf/minStats/speed`（Slider.value））。
- **`spec.state` に初期選択を正しく埋めた**（fire/flying=true・speed=100）→ フォーム初期表示に反映。
- **関係するタイプだけ出す判断**（18 個全部でなく「ほのお」「ひこう」の2つ＋「優先表示しています」の注記）。
- find ActionButton に `"on":{"click":{"action":"find"}}` を正しく付与。
- exp02 §9 の「無い構文の発明（`${}`）」は**起きなかった**＝出力UI（read-only）より入力UI（two-way）の方がむしろカタログ文法に素直だった。**動かす変数（GenUI の役割＝入力フォーム生成）は機能する**。

### いちばんの落とし穴は LLM でなくクライアント配線（GenUI×state の本質的 gotcha）
「探す」が**無反応**（fetch ゼロ・エラーなし）。spec は完璧（`on/click/action:"find"` 出力済み）。根因＝**json-render の `ActionProvider` が `const [handlers]=useState(initialHandlers)` で handlers を初回マウント時に凍結**（以後の prop 変化を無視）。FinderRenderer は **Compose-Live で `streaming=true` の最中にマウント**するので、`streaming=true` 版の `onFind`（即 early-return）が凍結され、ストリーム完了後も差し替わらない（同 message id で remount しないため）。
→ 修正 = **ハンドラを安定参照（`useCallback([])`）にし、可変値（streaming/sendMessage）は ref 越しに読む**（凍結された handler でも現在値を見る）。「出力を描く」だけの 01/02 では handler が `ask` 1個で初期から確定していたので踏まなかった罠＝**GenUI に state とイベントを持たせると新たに出る配線リスク**。

### データ形の知見がライブ UX に出た（Phase A #1 の実証）
fire∩flying/speed≥100 の結果 4 件のうち 3 件が `charizard-mega-y`/`charizard`/`charizard-gmax` ＝**base 種の重複（フォーム違い）が UX を埋める**。世代を gen1 にトグルして再検索すると **charizard 1 件のみ**（mega/gmax 消滅）＝`generation/<id>` の species（base 名のみ）で**フォーム重複が自動 de-dup**（Phase A 知見#1 がライブで実証）。→ 「世代を促す」UI 既定や base-only サーバフィルタが UX レバー。

### 双方向ループの FEEL（§7 観察点）
- トグル（local・即時・サーバ往復なし）→「探す」（サーバ往復・LLM が結果ボード compose）→「別の条件でさがす」（元の問いで form を組み直し）の往復が成立。
- **ライブのトグルがサーバに届く**ことを確認（Select を gen1 に変える → 送信 params に `generationId:1` が乗り、結果が変わった）。
- フォームは応答ごとに `key={message.id}` で remount＝1フォーム内のトグルは保持されるが、results→再 ask で**新しいフォームは毎回ゼロから compose**（前フォームの選択は持ち越さない）。今回の「results が form を置換する」流れでは remount-flash は実害なし。**「form を残したまま live 再検索」**の設計にすると `StateProvider` の initialState 再 flatten（§9）に当たる＝次の課題。
- 単一変数は守れた（絞り込み計算は全部サーバ findMons・クライアント計算/$math なし）。

**結論**: GenUI が「動く双方向の入力フォーム」を組むのは LLM 側は十分成立する。境界はむしろ **client 側の state/handler ライフサイクル**（Compose-Live × provider の handler 凍結）と **データ形（フォーム重複）**にある。次の検証候補: 組成品質の多サンプル評定（$bindState パス一貫性・フォーム過不足・初期値の的中率をクエリ多数で）／form 永続 live 再検索（remount-flash の正面突破）。

---

## 11. 組成品質の多サンプル評定（実モデル収集 → ワークフロー多レンズ判定・2026-06-26）

`scripts/eval-collect.mts` で**実 `/api/generate(intent=form)` を 12 の多様なクエリで叩き、実モデルが組んだフォーム spec を収集**（機械指標を算出）→ ワークフロー（12サンプル × 2レンズ〈fit=コントロール適合 / intent=意図エンコード〉= 24 判定エージェント + 統合）で品質地図に集約。クエリは単一/複合タイプ・世代・複数 stat・**API 非表現語**（「とにかく速い」=型なし・「かわいい」「伝説級」=概念なし・「第5世代以降」=範囲）を意図的に混ぜた。

**スコア**: fitAvg **4.45/5** ・ intentAvg **4.45/5**。**機械的契約は全12完璧**（カタログ外部品 0・不正 $bindState パス 0・find ボタン全有）。`type` の AND チェックボックス・`generationId` Select・`minStats` 下限 Slider への翻訳は的確で、曖昧語（タフ/打たれ強い/壁/高い/速い）はでっち上げず近接 stat 軸の下限へ proxy 化する restraint が一貫。**マップ不能語に偽コントロール（「かわいい度」スライダー等）を作ることは皆無**（exp02 §9 の「無い構文の発明」は入力UIでも起きないを多サンプルで裏付け）。

**最大の発見（単発の実機検証では見落としていた）= OR→AND のサイレント意図反転**:
- 「炎**か**飛行」は OR（どちらか）の意図だが、フォームは初期 state で fire/flying を**両方 true** に pre-check する。サーバの type 絞り込みは **AND 積集合のみ**なので、これは「炎**かつ**飛行」（複合タイプ＝リザードン/ファイヤー等ごく少数・Phase A probe ③ で matched=8）に潰れ、ユーザーの期待する和集合と**論理が反転**する。fabrication ではない（偽 OR ウィジェットは作らない）が、**表現不能な OR を黙って AND に畳んで意図を歪める**。fit/intent 両減点・load-bearing。

**失敗モードの分類**（共通因＝「API が表現できない論理/範囲を、ユーザーに知らせず誤エンコードするサイレント縮約」）:
| severity | モード | 該当 |
|---|---|---|
| high | 表現不能な論理/範囲の**サイレント縮約**（OR→AND・範囲→単一値） | 炎か飛行 / 第5世代以降 |
| med | 情緒語を defensible な proxy に落としたが**ハード AND で pre-check 確定**し、除外を頼んでない対象を黙って弾く | かわいい（fairy=true 確定） |
| low | クエリが含意しない軸の**常設ファセット**（世代 Select・テーマ別 type 群）による軽度 bloat（中立 default でクエリは汚さない） | 速い / 壁 / 伝説級 / かわいい |
| low | 曖昧な閾値語を初期値に焼き込む際の**閾値推定の上振れ・一律化**（attack 120・三軸一律 90 等） | 攻撃高い / タフ / 速い |

**良い対比**: 「伝説級」（電気∩地面 + 伝説級）は**黙って無視し既存軸だけ graceful に組む**（intent 満点）→ 同じ非表現語でも「かわいい」の fairy 確定（誤誘導）と好対照。境界は「**非表現語を fabricate しないか**」ではなく「**黙って近似するか / 明示・中立化するか**」にある。

**改善提言（doc 化のみ・未実装）**: ① 非表現語を検出したら既定をハード確定せず中立（全 false / null）に倒し提示コントロールでユーザーに委ねる、または Text/Badge で「『以降』『か(OR)』『伝説級』は絞り込めません」と**明示**する経路を1本通す。② OR クエリは両 pre-check をやめ片側のみ or 両 unchecked + 明示。③ 範囲語は generationId 単一焼き込みでなく null+注記。④ 情緒語 proxy は pre-check でなく unchecked 候補提示。⑤ 機構面（契約遵守）は完璧なので、今後の投資はコントロール生成の正しさでなく**「表現不能語の graceful な扱い」**に集中させる。

> 苗床の地図への結論: **two-way 入力フォーム生成は LLM 側の機構的競合力は高い（契約遵守 4.45/5・パス一貫・proxy 判断は誠実）。品質の天井を抑えるのは「サーバが表現できない意図（OR・範囲・情緒）を黙って近似する最後の一手」**＝ GenUI の入力役割に固有の、出力役割（01/02）には無かった新しい破綻面。

> 検証の落とし穴メモ: ワークフロー初回は `args` で渡した配列が `Array.isArray(args)` を通らず `samples=[]` になり、統合エージェントが**空データで品質地図を捏造**した（per-query の値が実データと“それっぽく”一致したため危うく見逃すところだった）。判定エージェントが0個（journal で確認）= 捏造のサインで検知。重要データは **args 配信に頼らずワークフロースクリプトに const 埋め込み**して再実行＝grounded な結果を得た。

---

## 12. form 永続 live 再検索（§9 remount-flash を正面突破・実機検証済み・2026-06-26）

§7/§9 で残課題だった「results が form を置換する → 再検索のたびにフォームが remount され選択が飛ぶ」を、**controlled StateStore による単一永続ボード**で正面から解いた。

**設計の転換**:
- これまで（Phase C）: 問い→form ボード / 探す→**別の results ボードに置換**（LLM が結果を再 compose・key=msg.id で remount）。
- 本変種: LLM が **form ＋ 結果リージョンを1枚の spec に** compose（MonGrid を `{$state:/findMons/mons}`・Kpi を `/findMons/count`・Text を `$template ${/findMons/criteriaLabel}` にバインド）。`createStateStore({})` で作った **1つの store を mount したまま** `JSONUIProvider store=` で controlled モードに渡す。「探す」は **LLM を介さず** `/api/find`（計算のみ JSON を返す新エンドポイント）→ `store.set("/findMons", 値)` で書き戻し → 同一 spec の MonGrid が live 更新。**ボードは remount されない**ので form 選択も結果も飛ばない。

**ソースで確定した要点（controlled store）**: `StateStore = {get, set, update, getSnapshot, subscribe}`（`createStateStore(initial)`・core/react どちらからも import 可）。`JSONUIProvider store=` を渡すと **`initialState` と `onStateChange` は無視される**（d.ts 明記）。よって:
- **spec.state（LLM の初期選択）は controlled store に自動 seed されない** → form が組み上がった時点で `store.set("/shelf", spec.state.shelf)` を1回だけ手動 seed（メッセージ id ごとに1回・探すでは reseed しない＝選択保持）。
- 入力部品は `useBoundProp` 経由でこの store に read/write、page は `store.getSnapshot()` で現在 shelf を読む（onStateChange/ref 再構成は不要になった）。

**実機検証（Playwright）**: 「炎か飛行で素早さ高め」→ form＋空の結果欄（ほのお/ひこう checked・該当0）→「探す」→ 該当4・MonGrid に charizard 系4枚が **in-place** 表示 → **世代を gen1 にトグル**→「探す」→ 該当**1**・条件 `fire∩flying ∩ 第1世代`・charizard 1枚に更新、かつ **ほのお/ひこう/gen1/slider100 の選択が全て保持**（flash/reset なし）。§9 の remount-flash は**構造的に消えた**。

**トレードオフ（地図に効く判断）**:
- 得たもの: 再検索が**サーバ計算のみ**（LLM compose 不要）＝速い・滑らか・選択保持。「トグル→探す→その場で結果更新」の双方向ループの FEEL が完成。
- 失ったもの: 結果が **LLM 再 compose のボードでなく固定 MonGrid への live データ流し込み**になった（LLM はダッシュボード全体を1回組むが、結果の見た目を結果内容ごとに作り変えることはしない）。Phase C の「LLM が結果ボードを毎回 compose」は §10 ＋ git 履歴に残す。
- すなわち **「LLM 再 compose の表現力」 ↔ 「状態保持＋低レイテンシの双方向 FEEL」はトレードオフ**。GenUI に入力（state）を持たせると、出力役割（01/02）には無かったこの軸が立ち上がる。controlled store はその「状態保持」側の正攻法。

> §12 の結論: 双方向 live 再検索の気持ちよさは **controlled store でボードを mount したまま data だけ差し替える**ことで素直に出る（remount-flash は uncontrolled の initialState 再 seed が原因で、controlled に切れば消える）。代償は「結果の見た目が compose 時に固定される」こと。どちらを取るかは題材次第＝苗床の新しい設計レバー。
