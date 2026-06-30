import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * artfinder カタログ = LLM に見せる「使える部品」の語彙。
 * ★ exp04 の核 = **入力部品が two-way**（value/checked/from/to/selected を `{ $bindState: "/path" }` で state に結ぶ）。
 *   pokefinder からの新規 = ColorSwatch（色相・視覚モダリティ）・TextInput（自由テキスト）・RangeSelect（年代の2値）。
 * 出力部品（ArtGrid）は計算済みの「値」を props で受ける（spec に算術なし・$math 不使用）。
 */
export const catalog = defineCatalog(schema, {
  components: {
    // ---------- 汎用（01/02/03 から写経） ----------
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).default("vertical"),
        gap: z.enum(["sm", "md", "lg"]).default("md"),
        wrap: z.boolean().default(false),
      }),
      description: "子要素を縦/横に並べるレイアウト。direction=horizontal で横並び。ファセットのチェックボックス群や色スウォッチは horizontal + wrap=true が見やすい。",
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        tone: z.enum(["default", "accent"]).default("default"),
      }),
      description: "枠付きパネル。フォームのセクション（種別 / 部門 / 年代 / 色 / 検索語）ごとに使うと整理される。",
    },
    Heading: {
      props: z.object({ text: z.string(), level: z.enum(["h1", "h2", "h3"]).default("h2") }),
      description: "セクション見出し。",
    },
    Text: {
      props: z.object({ text: z.string(), muted: z.boolean().default(false) }),
      description:
        "本文テキスト。muted=true で控えめ。説明文・空状態・注意書き・**表現できない条件の明示**に。$template で state を差し込める（例 \"{$template:'条件: ${/findArt/criteriaLabel}'}\"）／$state で値そのまま（例 \"{$state:'/findArt/note'}\"）。",
    },
    Badge: {
      props: z.object({ text: z.string(), tone: z.enum(["accent", "neutral"]).default("neutral") }),
      description: "小さなステータスピル。件数やラベルに。",
    },
    Kpi: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable(),
      }),
      description: "単一の重要指標（値＋ラベル）。結果の件数（/findArt/count, /findArt/matchedCount）の見出しに。値は計算済み。",
    },

    // ---------- 入力（two-way バインド・exp04 の核） ----------
    FacetCheckbox: {
      props: z.object({
        label: z.string(),
        checked: z.boolean(),
      }),
      description:
        "1ファセット値のトグル（チェックボックス）。checked は必ず two-way バインド: " +
        '種別なら "checked": { "$bindState": "/shelf/type/<slug>" }、部門なら "/shelf/department/<slug>"（<slug> は artVocab の slug）。' +
        "label に日本語名。同じファセットで複数 ON = そのどれか（OR）。異なるファセット同士は AND（種別かつ部門）。問いに合う値は初期 state で true に。",
    },
    ColorSwatch: {
      props: z.object({
        label: z.string(),
        hue: z.number(), // この swatch が表す色相（artVocab.hues の h）
        swatch: z.string(), // 表示色（CSS color）
        value: z.union([z.number(), z.null()]), // 現在選択中の色相（共有・two-way）
      }),
      description:
        "色相スウォッチ（色で絞る・単一選択）。artVocab.hues の各色について1つ並べる。hue=その色相, swatch=表示色, " +
        'value は全 swatch 共通で "value": { "$bindState": "/shelf/hue" } に結ぶ（選択中の色相が入る・未選択は null）。' +
        "クリックでその色相が選ばれ、もう一度で解除。色に言及する問い（「青っぽい」等）や色での絞り込みを出したいときに並べる。",
    },
    TextInput: {
      props: z.object({
        label: z.string(),
        placeholder: z.string().nullable(),
        value: z.string().nullable(),
      }),
      description:
        "自由テキスト入力（英語）。value は two-way。用途で結ぶパスを変える（複数置いてよい）: " +
        '作者名・作品名 → "value": { "$bindState": "/shelf/q" }（「モネ」→Monet）／' +
        '主題・画題＝何が描かれているか → "/shelf/subject"（「水辺」→water・「抽象」→abstract・「肖像」→portrait）／' +
        '産地・地域 → "/shelf/region"（大陸 Europe/Asia… か国名 France/Japan…）。問いに該当語があれば初期 state に英語で入れる。',
    },
    RangeSelect: {
      props: z.object({
        label: z.string(),
        from: z.union([z.number(), z.null()]),
        to: z.union([z.number(), z.null()]),
        min: z.number().default(-3000),
        max: z.number().default(2025),
      }),
      description:
        "制作年の範囲（2つの数値入力）。from/to はそれぞれ two-way: " +
        '"from": { "$bindState": "/shelf/yearFrom" }, "to": { "$bindState": "/shelf/yearTo" }（西暦・紀元前は負数）。' +
        "「N年以降」は from のみ・「〜M年」は to のみ・「N〜M年」は両方・null=端を開く。問いの年代を初期 state に。",
    },
    Toggle: {
      props: z.object({
        label: z.string(),
        checked: z.boolean().default(false),
      }),
      description:
        "ON/OFF トグル。checked は必ず two-way: \"checked\": { \"$bindState\": \"/shelf/<path>\" }。" +
        "用途: 展示中のみ → /shelf/onView、パブリックドメインのみ → /shelf/publicDomain（どちらも既定 false）。",
    },
    Select: {
      props: z.object({
        label: z.string(),
        options: z.array(z.object({ value: z.union([z.number(), z.string()]).nullable(), label: z.string() })),
        value: z.union([z.number(), z.string()]).nullable(),
      }),
      description:
        "単一選択ドロップダウン。value は two-way。用途は2つ: " +
        '(1) 並べ替え → "value": { "$bindState": "/shelf/sortBy" }、options=[{value:"relevance",label:"関連度"},{value:"newest",label:"新しい順"},{value:"oldest",label:"古い順"}]。' +
        '(2) 組み合わせ方（軸またぎの「または」のときだけ）→ "/shelf/combineMode"、options=[{value:"and",label:"すべての条件"},{value:"or",label:"いずれかの条件"}]。',
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["primary", "default"]).default("primary"),
      }),
      description:
        "「探す」ボタン。現在のフォーム選択でサーバ検索を実行する。" +
        '必ず on で find を呼ぶ: "on": { "click": { "action": "find" } }。tone=primary で主導線。フォームの最後に1つ置く。',
    },

    // ---------- 出力（結果ボード） ----------
    ArtGrid: {
      props: z.object({
        artworks: z.array(
          z.object({
            id: z.number(),
            title: z.string(),
            artist: z.string(),
            dateText: z.string(),
            medium: z.string(),
            type: z.string(),
            department: z.string(),
            origin: z.string().default(""),
            subjects: z.array(z.string()).default([]),
            onView: z.boolean(),
            image: z.string().nullable(),
            swatch: z.string().nullable(),
            hue: z.union([z.number(), z.null()]),
          }),
        ),
      }),
      description:
        "結果の作品画像カード・グリッド。artworks に /findArt/artworks をそのままバインド（生のまま・計算済）。" +
        "各カードは作品画像（IIIF）・題名・作者・年・種別を出す。結果表示の主役。0件なら空状態を出す。",
    },
  },
  actions: {},
});
