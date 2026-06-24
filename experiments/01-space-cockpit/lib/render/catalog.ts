import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * コンポーネントカタログ = LLM に見せる「使える部品」の語彙（Zod で props を定義）。
 * このカタログが「LLM 出力の制約」と「描画」の単一の真実になる（GenUI の肝）。
 *
 * 設計ルール（CLAUDE.md）:
 * - 計算済みの「値」を props で受ける。spec 側に算術は持たせない（$math は使わない）。
 * - 表示整形だけは後で $format（@json-render/directives）に寄せてよい。
 */
export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).default("vertical"),
        gap: z.enum(["sm", "md", "lg"]).default("md"),
        wrap: z.boolean().default(false),
      }),
      description:
        "子要素を縦/横に並べるレイアウト。direction=horizontal で横並び。",
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        tone: z.enum(["default", "danger"]).default("default"),
      }),
      description: "枠付きパネル。タイトル任意。tone=danger で警告色。",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h1", "h2", "h3"]).default("h2"),
      }),
      description: "セクション見出し。",
    },
    Text: {
      props: z.object({
        text: z.string(),
        muted: z.boolean().default(false),
      }),
      description: "本文テキスト。muted=true で控えめ表示。",
    },
    List: {
      props: z.object({
        items: z.array(z.string()),
        ordered: z.boolean().default(false),
        title: z.string().nullable(),
      }),
      description:
        "文字列の箇条書き。クルー名など文字列配列を出す唯一の部品。items は文字列配列の $state（例 /iss/crew）をそのままバインド。ordered=true で番号付き。",
    },
    Countdown: {
      props: z.object({
        target: z.string(),
        label: z.string().nullable(),
        precision: z.string().nullable(),
        zeroLabel: z.string().nullable(),
      }),
      description:
        "次のイベントまでのライブ T-カウントダウン（毎秒更新）。target に ISO 時刻（例 /launches/next/net）をバインド。precision に /launches/next/precision を渡すと粗い精度のとき秒を隠す。打ち上げの主役。zeroLabel はゼロ到達時の表示（既定 'LIFTOFF 🚀'）。打ち上げ以外（CME 到達など）では zeroLabel='到達' のように適切な語を渡す（打ち上げでないのに LIFTOFF を出さない）。",
    },
    LaunchTimeline: {
      props: z.object({
        items: z.array(
          z.object({
            name: z.string(),
            provider: z.string(),
            net: z.string(),
            location: z.string(),
            status: z.string(),
          }),
        ),
      }),
      description:
        "今後の打ち上げの縦タイムライン（時刻＋名前＋事業者/射場＋ステータス色分けピル）。items に /launches/upcoming をそのままバインド。",
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["primary", "default"]).default("default"),
      }),
      description:
        '押すと別の問いを投げ直して画面を組み直すボタン（再取得・関連質問の導線）。必ず on で ask アクションに問い文を渡す: "on": {"click": {"action": "ask", "params": {"query": "ISSは今どこ？"}}}。label は短く、tone=primary で主導線を強調。',
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: z.enum(["danger", "warn", "ok", "neutral"]).default("neutral"),
      }),
      description: "小さなステータスピル。危険なら tone=danger。",
    },
    Kpi: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().nullable(),
        hint: z.string().nullable(),
      }),
      description:
        "単一の重要指標。大きな値＋ラベル＋任意の単位/補足。値は計算済み。小数や桁区切りが要る数値は $format ディレクティブで整形して渡す（生の float を直接出さない）。",
    },
    HeroImage: {
      props: z.object({
        src: z.string(),
        title: z.string().nullable(),
        caption: z.string().nullable(),
        credit: z.string().nullable(),
      }),
      description: "大きなヒーロー画像。APOD の1枚に使う。",
    },
    Gallery: {
      props: z.object({
        images: z.array(z.object({ src: z.string(), caption: z.string().nullable() })),
        columns: z.enum(["2", "3"]).default("3"),
      }),
      description:
        "画像のグリッド（APOD 週まとめなど複数枚）。images は {src,caption} 配列の $state（例 /apodGallery/images）をそのままバインド。",
    },
    AsteroidTable: {
      props: z.object({
        rows: z.array(
          z.object({
            name: z.string(),
            hazardous: z.boolean(),
            diameterM: z.number(),
            missLunar: z.number(),
            missKm: z.number(),
            velocityKmh: z.number(),
            date: z.string(),
          }),
        ),
        caption: z.string().nullable(),
      }),
      description:
        "接近小惑星のランキング表。rows は計算済みで /neows/rows をそのままバインドする（最接近順）。",
    },
    AsteroidScatter: {
      props: z.object({
        points: z.array(
          z.object({ x: z.number(), y: z.number(), hazardous: z.boolean(), name: z.string() }),
        ),
      }),
      description:
        "距離×サイズの散布図（分析向き）。points は /neows/scatter をバインド（x=最接近距離[月距離], y=直径[m], 色=hazardous）。",
    },
    OrbitProximity: {
      props: z.object({
        points: z.array(
          z.object({ x: z.number(), y: z.number(), hazardous: z.boolean(), name: z.string() }),
        ),
      }),
      description:
        "小惑星の『どれだけ近くを通ったか』を体感させる同心円図。地球中心・月の距離(1 LD)を基準に内側ほど近い。points は /neows/scatter をそのままバインド。『ヤバい/近い/危険』系の問いの主役に最適（散布図より体感的）。",
    },
    ScatterPlot: {
      props: z.object({
        points: z.array(
          z.object({
            name: z.string(),
            r: z.number(),
            m: z.number(),
            dist: z.number().nullable(),
            family: z.string(),
          }),
        ),
      }),
      description:
        "系外惑星の質量×半径 log-log 散布図。地球(1,1)/木星(317.8,11.2)を基準マーカーで内蔵し、family（rocky/superEarth/neptune/giant）で色分け。points は /exoplanet/scatterPoints をそのままバインド。系外惑星の問いの主役。AsteroidScatter（小惑星の距離×サイズ）とは別物。",
    },
    Histogram: {
      props: z.object({
        bars: z.array(z.object({ year: z.number(), n: z.number() })),
      }),
      description:
        "発見年ごとの件数の縦棒グラフ（最多の年を自動で強調色）。bars は /exoplanet/histogram をそのままバインド。系外惑星の「発見の歴史」を見せる。",
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
        "巨大なヒーロー数値（数値はカウントアップ）。1画面で最も伝えたい1つの数に使う（最接近距離・宇宙の人数など）。小数は decimals で桁指定（例 月距離は decimals=1）。生 float を直接渡してよい（整形は内蔵）。tone=danger で赤く強調。",
    },
    IssMap: {
      props: z.object({
        lat: z.number(),
        lon: z.number(),
        label: z.string().nullable(),
      }),
      description: "ISS のフラットな世界地図（マーカー1つ）。lat/lon を /iss/lat,/iss/lon にバインド。Globe3D の軽量な代替。",
    },
    Globe3D: {
      props: z.object({
        lat: z.number(),
        lon: z.number(),
        label: z.string().nullable(),
      }),
      description:
        "ISS を乗せた3D地球（本物のテクスチャ・自転・脈打つマーカー）。lat/lon を /iss/lat,/iss/lon にバインド。ISS の現在地表示の主役（フラットな IssMap より迫力。位置の問いでは基本こちら）。",
    },
    SolarWindGauges: {
      props: z.object({
        speed: z.number(),
        density: z.number(),
        temperature: z.number(),
        bz: z.number().nullable(),
        series: z.array(z.object({ t: z.string(), speed: z.number() })),
      }),
      description:
        "太陽風の計器群（速度の推移スパークライン＋速度/密度/温度/Bz タイル）。針が動く=ライブ感の核。/spaceWeather の windSpeedKmS/density/temperatureK/bzNt と series=/spaceWeather/windSeries をそのままバインド（series は生のまま・$format しない）。宇宙天気の主役。",
    },
    KpDial: {
      props: z.object({ kp: z.number(), gScale: z.string() }),
      description:
        "惑星 Kp 指数(0-9)の半円ダイヤル＋ G スケールバッジ。kp=/spaceWeather/kpNow, gScale=/spaceWeather/gScale。地磁気の荒れ具合の主指標。",
    },
    KpForecastStrip: {
      props: z.object({ bars: z.array(z.object({ t: z.string(), kp: z.number(), observed: z.string() })) }),
      description:
        "3日 Kp 予報の縦棒帯（Kp 段階で色分け・実測は濃く予報は淡く・Kp5境界線）。bars=/spaceWeather/kpForecast をそのままバインド。嵐が育つ見通し。",
    },
    SunEarthLane: {
      props: z.object({
        progress: z.number(),
        speedKmS: z.number().nullable(),
        status: z.string().nullable(),
      }),
      description:
        "太陽→地球レーン。地球向き CME の塊を progress(0-1)でプロットし地球へ寄っていく。progress=/cme/laneProgress, speedKmS=/cme/speedKmS, status=/cme/status。cme.present=true のときだけ出す（到達 Countdown と組で主役）。",
    },
    AuroraOvalGlobe: {
      props: z.object({
        band: z.array(z.object({ lon: z.number(), lat: z.number(), prob: z.number() })),
        hemisphere: z.string(),
        observerLat: z.number().nullable(),
        observerLon: z.number().nullable(),
      }),
      description:
        "オーロラ楕円の極方位ビュー（発光帯＋観測地の緯度リング＆ドット）。band=/aurora/ovalBand, hemisphere=/aurora/hemisphere, observerLat=/aurora/observerLat, observerLon=/aurora/observerLon をそのままバインド（band は生のまま・$format しない）。オーロラの問いの主役。隣に /aurora/verdict の文を必ず添える。",
    },
    FlareEventRail: {
      props: z.object({
        items: z.array(z.object({ class: z.string(), time: z.string(), region: z.string() })),
      }),
      description:
        "直近の太陽フレアの時系列レール（X/M/C クラスで色分け）。items=/flares/recent をそのままバインド。太陽がどれだけ活発かの履歴。",
    },
  },
  actions: {},
});
