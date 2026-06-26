import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * pokefinder カタログ = LLM に見せる「使える部品」の語彙。
 * ★ exp03 の核 = **入力部品が two-way**（value/checked を `{ $bindState: "/path" }` で state に結ぶ）。
 * 出力部品（MonGrid 等）は 01/02 と同じく計算済みの「値」を props で受ける（spec に算術なし・$math 不使用）。
 */
export const catalog = defineCatalog(schema, {
  components: {
    // ---------- 汎用（01/02 から写経） ----------
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).default("vertical"),
        gap: z.enum(["sm", "md", "lg"]).default("md"),
        wrap: z.boolean().default(false),
      }),
      description: "子要素を縦/横に並べるレイアウト。direction=horizontal で横並び。タイプのチェックボックス群は horizontal + wrap=true が見やすい。",
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        tone: z.enum(["default", "accent"]).default("default"),
      }),
      description: "枠付きパネル。フォームのセクション（タイプ / 世代 / 種族値）ごとに使うと整理される。",
    },
    Heading: {
      props: z.object({ text: z.string(), level: z.enum(["h1", "h2", "h3"]).default("h2") }),
      description: "セクション見出し。",
    },
    Text: {
      props: z.object({ text: z.string(), muted: z.boolean().default(false) }),
      description: "本文テキスト。muted=true で控えめ。説明文や空状態・注意書きに。$template で state を文字列に差し込める（例 \"{$template:'条件: ${/findMons/criteriaLabel}'}\"）／$state で値をそのまま（例 注意文を \"{$state:'/findMons/note'}\"）。",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: z.enum(["accent", "neutral"]).default("neutral"),
      }),
      description: "小さなステータスピル。件数やラベルに。",
    },
    Kpi: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable(),
      }),
      description: "単一の重要指標（値＋ラベル）。結果の件数（/findMons/count）の見出しに。値は計算済み。",
    },

    // ---------- 入力（exp03 新規・two-way バインド） ----------
    TypeCheckbox: {
      props: z.object({
        label: z.string(),
        color: z.string().nullable(),
        checked: z.boolean(),
      }),
      description:
        "1タイプのトグル（チェックボックス）。checked は必ず two-way バインド: " +
        '"checked": { "$bindState": "/shelf/type/<englishName>" }（<englishName> は pokeTypes の name、例 fire/flying）。' +
        "label に日本語名、color にタイプ色。複数 ON のときの結合は /shelf/typeMode の Select（and=すべて持つ / or=どれか持つ）で決まる。問いに合うタイプは初期 state で true にする。",
    },
    Select: {
      props: z.object({
        label: z.string(),
        options: z.array(z.object({ value: z.union([z.number(), z.string()]).nullable(), label: z.string() })),
        value: z.union([z.number(), z.string()]).nullable(),
      }),
      description:
        "単一選択ドロップダウン。value は two-way バインド。用途は2つ: " +
        '(a) タイプ条件 AND/OR: "value":{"$bindState":"/shelf/typeMode"}、options=[{value:"and",label:"すべてのタイプを持つ (AND)"},{value:"or",label:"どれかのタイプを持つ (OR)"}]。' +
        '(b) 世代範囲の下端/上端: "value":{"$bindState":"/shelf/genFrom"} と "/shelf/genTo"、options=[{value:null,label:"指定なし"},{value:1,label:"第1世代…"},…]（value=数値 id、null=端を開く）。',
    },
    Slider: {
      props: z.object({
        label: z.string(),
        min: z.number().default(0),
        max: z.number().default(200),
        step: z.number().default(5),
        value: z.number(),
        unit: z.string().nullable(),
      }),
      description:
        "種族値の下限スライダー。value は two-way: " +
        '"value": { "$bindState": "/shelf/minStats/<stat>" }（stat = speed|attack|defense|hp|spAtk|spDef）。0=絞り込みなし。種族値は概ね 0〜200。問いで「素早さ高め」等が出たら該当軸を初期 state で 100 前後に。',
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["primary", "default"]).default("primary"),
      }),
      description:
        "「探す」ボタン。現在のフォーム選択（タイプ/世代/種族値）でサーバ検索を実行する。" +
        '必ず on で find を呼ぶ: "on": { "click": { "action": "find" } }。tone=primary で主導線。フォームの最後に1つ置く。',
    },

    // ---------- 出力（結果ボード） ----------
    MonGrid: {
      props: z.object({
        mons: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            sprite: z.string().nullable(),
            types: z.array(z.string()),
            hp: z.number(),
            attack: z.number(),
            defense: z.number(),
            spAtk: z.number(),
            spDef: z.number(),
            speed: z.number(),
            total: z.number(),
          }),
        ),
      }),
      description:
        "結果のスプライトカード・グリッド。mons に /findMons/mons をそのままバインド（生のまま・計算済）。" +
        "各カードはスプライト・タイプバッジ・種族値バー・合計を出す。結果表示の主役。0件なら出さず Text で空状態を。",
    },
  },
  actions: {},
});
