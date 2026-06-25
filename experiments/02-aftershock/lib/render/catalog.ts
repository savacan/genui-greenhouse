import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * 地球モニタ用コンポーネントカタログ = LLM に見せる「使える部品」の語彙（Zod で props 定義）。
 * カタログが「LLM 出力の制約」と「描画」の単一の真実（GenUI の肝）。
 * 計算済みの「値」を props で受ける（spec 側に算術なし・$math 不使用）。表示整形だけ $format。
 */
export const catalog = defineCatalog(schema, {
  components: {
    // ---------- 汎用（01 から写経） ----------
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).default("vertical"),
        gap: z.enum(["sm", "md", "lg"]).default("md"),
        wrap: z.boolean().default(false),
      }),
      description: "子要素を縦/横に並べるレイアウト。direction=horizontal で横並び。",
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        tone: z.enum(["default", "danger"]).default("default"),
      }),
      description: "枠付きパネル。タイトル任意。tone=danger で警告色（被害の大きい地震など）。",
    },
    Heading: {
      props: z.object({ text: z.string(), level: z.enum(["h1", "h2", "h3"]).default("h2") }),
      description: "セクション見出し。",
    },
    Text: {
      props: z.object({ text: z.string(), muted: z.boolean().default(false) }),
      description: "本文テキスト。muted=true で控えめ。データが空のときの説明文にも使う。",
    },
    List: {
      props: z.object({
        items: z.array(z.string()),
        ordered: z.boolean().default(false),
        title: z.string().nullable(),
      }),
      description: "文字列の箇条書き。文字列配列の $state をそのままバインド。",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: z.enum(["danger", "warn", "ok", "neutral"]).default("neutral"),
      }),
      description: "小さなステータスピル。津波フラグや断層型など。危険なら tone=danger。",
    },
    Kpi: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable(),
        hint: z.string().nullable(),
      }),
      description:
        "単一の重要指標（大きな値＋ラベル＋任意の単位/補足）。値は計算済み。小数や桁区切りが要る数値は $format で整形して渡す（生 float を直接出さない）。",
    },
    BigStat: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable(),
        context: z.string().nullable(),
        decimals: z.number().default(0),
        tone: z.enum(["default", "danger"]).default("default"),
      }),
      description:
        "巨大なヒーロー数値（カウントアップ内蔵）。1画面で最も伝えたい1つの数に使う（最大マグニチュード等）。小数は decimals で桁指定。生 float を直接渡してよい。tone=danger で赤く強調。",
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["primary", "default"]).default("default"),
      }),
      description:
        '押すと別の問いを投げ直して画面を組み直すボタン。必ず on で ask アクションに問い文を渡す: "on": {"click": {"action": "ask", "params": {"query": "その震源の天気は？"}}}。label は短く、tone=primary で主導線。',
    },

    // ---------- 地球モニタ（02 新規） ----------
    QuakeList: {
      props: z.object({
        rows: z.array(
          z.object({
            id: z.string(),
            mag: z.number(),
            place: z.string(),
            depthKm: z.number(),
            ageHours: z.number(),
            alert: z.string().nullable(),
            tsunami: z.boolean(),
          }),
        ),
        caption: z.string().nullable(),
      }),
      description:
        "地震のランキングリスト（マグニチュード・場所・深さ・経過時間・PAGER 色・津波フラグ）。rows は計算済みで /quakes/quakes をそのままバインド（生のまま）。一覧の主役。",
    },
    MagnitudeBars: {
      props: z.object({
        rows: z.array(z.object({ place: z.string(), mag: z.number(), alert: z.string().nullable() })),
      }),
      description:
        "地震のマグニチュード横棒グラフ（M で長さ・PAGER 色で着色）。rows は /quakes/quakes をそのままバインド（place,mag,alert を使う・生のまま）。規模の比較を体感的に見せる。",
    },
    Beachball: {
      props: z.object({
        planes: z.array(z.object({ strike: z.number(), dip: z.number(), rake: z.number() })),
        faultType: z.string().nullable(),
      }),
      description:
        "発震機構のビーチボール図（節面 strike/dip/rake から描く震源球）。planes は /quakeDetail/nodalPlanes をそのままバインド（生のまま）。faultType に /quakeDetail/faultType を添える。地震の「どう揺れたか」の主役。moment tensor が無いときは出さない。",
    },
    ShakeMapImage: {
      props: z.object({
        src: z.string(),
        title: z.string().nullable(),
        caption: z.string().nullable(),
      }),
      description:
        "USGS ShakeMap の揺れ強度画像。src に /quakeDetail/shakemapIntensityImgUrl をそのままバインド（生 url・$format 禁止）。被害の広がりを一目で見せる。画像が無いときは出さない。",
    },
    AlertBanner: {
      props: z.object({
        level: z.string(),
        title: z.string(),
        text: z.string().nullable(),
      }),
      description:
        "PAGER 警報レベルの帯（green/yellow/orange/red で色が変わる）。level に /quakeDetail/pagerAlert をバインド。red/orange は強い警戒色。被害推定の深刻度を伝える主役。",
    },
    WeatherTile: {
      props: z.object({
        current: z.object({
          time: z.string(),
          temp: z.number(),
          wind: z.number(),
          condition: z.string(),
        }),
        label: z.string().nullable(),
      }),
      description:
        "震源（または任意地点）の現在天気タイル（気温・風・天気ラベル+emoji）。current に /weather/current をそのままバインド（生のまま）。label に地名を添える。",
    },
    Sparkline: {
      props: z.object({
        points: z.array(z.object({ t: z.string(), temp: z.number() })),
        label: z.string().nullable(),
      }),
      description:
        "気温の推移スパークライン（48h を間引いた折れ線）。points に /weather/sparkline をそのままバインド（生のまま・$format 禁止）。",
    },
    ArticleGrid: {
      props: z.object({
        articles: z.array(
          z.object({
            title: z.string(),
            dist: z.number(),
            description: z.string().nullable(),
            thumbnail: z.string().nullable(),
            url: z.string().nullable(),
          }),
        ),
      }),
      description:
        "震源近傍の Wikipedia 記事グリッド（サムネ・説明・距離）。articles に /nearby/articles をそのままバインド（生のまま）。記事が0件のときは出さず Text で空状態を出す。",
    },
  },
  actions: {},
});
