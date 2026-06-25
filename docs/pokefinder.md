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
