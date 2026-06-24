import { z } from "zod";
import type { Action, StateHint } from "../types";
import { fetchJson } from "../fetchJson";

const MODES = ["earthlike", "recent", "giants", "all"] as const;
type Mode = (typeof MODES)[number];

// router の merged params は全て string|null。route 側で null は strip されるので
// 値が来なければ default("earthlike")、想定外の文字列が来ても catch で earthlike に落とす（enum 検証は action 側＝CLAUDE.md 方針）。
const params = z.object({
  mode: z.enum(MODES).default("earthlike").catch("earthlike"),
});
type Params = z.infer<typeof params>;

// NASA Exoplanet Archive TAP（ADQL）。pscomppars = 確認済み惑星の合成パラメータ（1惑星1行）。
// 散布図クエリだけ mode で変え、ヒストグラム（発見年）は mode 非依存で共有（Kepler の大量発見の山が主役）。
// 注意（recon 済み）: 距離は sy_dist（st_dist は無効列→400）。エラーは VOTABLE XML + HTTP 400 で返るが
// fetchJson が res.ok を見てから json() するのでクリーンに ActionDataError になる。float は server で丸める。
const TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const COLS = "pl_name,pl_bmasse,pl_rade,disc_year,sy_dist";

const SCATTER_ADQL: Record<Mode, string> = {
  earthlike: `select top 80 ${COLS} from pscomppars where pl_rade between 0.5 and 2 and pl_bmasse is not null order by abs(pl_rade-1) asc`,
  recent: `select top 80 ${COLS} from pscomppars where pl_rade is not null and pl_bmasse is not null and disc_year is not null order by disc_year desc`,
  giants: `select top 80 ${COLS} from pscomppars where pl_rade > 6 and pl_bmasse is not null order by pl_bmasse desc`,
  all: `select top 120 ${COLS} from pscomppars where pl_rade is not null and pl_bmasse is not null and sy_dist is not null order by sy_dist asc`,
};
const HIST_ADQL =
  "select disc_year,count(*) as n from pscomppars where pl_rade is not null and pl_bmasse is not null group by disc_year order by disc_year";

const tapUrl = (adql: string) => `${TAP}?query=${encodeURIComponent(adql)}&format=json`;

interface ScatterRow {
  pl_name: string;
  pl_bmasse: number | null; // 地球質量
  pl_rade: number | null; // 地球半径
  disc_year: number | null;
  sy_dist: number | null; // 距離（パーセク）
}
interface HistRow {
  disc_year: number | null;
  n: number;
}
interface ExoRaw {
  scatter: ScatterRow[];
  hist: HistRow[];
}

type Family = "rocky" | "superEarth" | "neptune" | "giant";
function family(r: number): Family {
  if (r < 1.25) return "rocky";
  if (r < 2) return "superEarth";
  if (r < 6) return "neptune";
  return "giant";
}

export interface ExoState extends Record<string, unknown> {
  scatterPoints: Array<{ name: string; r: number; m: number; dist: number | null; family: Family }>;
  histogram: Array<{ year: number; n: number }>;
  summary: {
    totalPlanets: number;
    mostEarthLike: { name: string; r: number; m: number; dist: number | null } | null;
    peakYear: number | null;
    peakCount: number;
    mode: Mode;
  };
}

// ~日次キャッシュ（1クエリ ~2.2s）。散布は mode 別、発見年ヒストは共有。
const TTL = 24 * 60 * 60 * 1000;
const scatterCache = new Map<Mode, { at: number; data: ScatterRow[] }>();
let histCache: { at: number; data: HistRow[] } | null = null;

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export const exoplanet: Action<Params, ExoRaw, ExoState> = {
  id: "exoplanet",
  when:
    "確認済みの太陽系外惑星（exoplanet）— 地球に似た惑星、質量×半径の分布、発見年の歴史。" +
    "params: mode（earthlike=地球サイズ帯 / recent=最近の発見 / giants=巨大ガス惑星 / all=太陽系近傍をまんべんなく。既定 earthlike）。",
  params,

  async fetch(p, ctx) {
    const now = Date.now();

    const sc = scatterCache.get(p.mode);
    const scatterP =
      sc && now - sc.at < TTL
        ? Promise.resolve(sc.data)
        : fetchJson<ScatterRow[]>(tapUrl(SCATTER_ADQL[p.mode]), ctx.signal).then((data) => {
            scatterCache.set(p.mode, { at: now, data });
            return data;
          });

    const histP =
      histCache && now - histCache.at < TTL
        ? Promise.resolve(histCache.data)
        : fetchJson<HistRow[]>(tapUrl(HIST_ADQL), ctx.signal).then((data) => {
            histCache = { at: now, data };
            return data;
          });

    const [scatter, hist] = await Promise.all([scatterP, histP]);
    return { scatter, hist };
  },

  compute(raw, p) {
    const scatterPoints = (raw.scatter ?? [])
      .filter((row) => row.pl_rade != null && row.pl_bmasse != null)
      .map((row) => {
        const r = round(row.pl_rade as number, 2);
        const m = round(row.pl_bmasse as number, 2);
        return {
          name: row.pl_name,
          r,
          m,
          dist: row.sy_dist != null ? round(row.sy_dist, 1) : null,
          family: family(r),
        };
      });

    // 発見年ヒストグラム（null 年バケットは捨てる）。
    const histogram = (raw.hist ?? [])
      .filter((h) => h.disc_year != null)
      .map((h) => ({ year: h.disc_year as number, n: h.n }))
      .sort((a, b) => a.year - b.year);

    const totalPlanets = (raw.hist ?? []).reduce((s, h) => s + (h.n ?? 0), 0);
    const peak = histogram.reduce<{ year: number; n: number } | null>(
      (best, h) => (!best || h.n > best.n ? h : best),
      null,
    );

    // 「最も地球似」= log 空間で (1,1) に最も近い点（半径と質量の両方を考慮）。
    const mostEarthLike = scatterPoints.reduce<ExoState["summary"]["mostEarthLike"]>((best, pt) => {
      const d = Math.hypot(Math.log10(pt.r), Math.log10(pt.m));
      const bd = best ? Math.hypot(Math.log10(best.r), Math.log10(best.m)) : Infinity;
      return d < bd ? { name: pt.name, r: pt.r, m: pt.m, dist: pt.dist } : best;
    }, null);

    return {
      scatterPoints,
      histogram,
      summary: {
        totalPlanets,
        mostEarthLike,
        peakYear: peak?.year ?? null,
        peakCount: peak?.n ?? 0,
        mode: p.mode,
      },
    };
  },

  describe(s): StateHint {
    const MODE_LABEL: Record<Mode, string> = {
      earthlike: "地球サイズ帯",
      recent: "最近の発見",
      giants: "巨大ガス惑星",
      all: "太陽系近傍",
    };
    const n = s.scatterPoints.length;
    if (n === 0) {
      return {
        summary: "系外惑星データを取得できませんでした。",
        paths: [],
        suggest: ["Text", "Heading", "ActionButton"],
        notes: ["Text で空状態を出す。"],
        followups: ["地球に似た系外惑星は？", "ISSは今どこ？"],
      };
    }
    const mel = s.summary.mostEarthLike;
    const paths: StateHint["paths"] = [
      {
        path: "/exoplanet/scatterPoints",
        type: "array<{name,r(地球半径),m(地球質量),dist(pc),family}>",
        note: "ScatterPlot.points にそのままバインド（主役。log-log の質量×半径分布、family で色分け、地球/木星は部品内蔵）",
        sample: `len=${n}, mode=${MODE_LABEL[s.summary.mode]}`,
      },
      {
        path: "/exoplanet/histogram",
        type: "array<{year,n}>",
        note: "Histogram.bars にそのままバインド（発見年ごとの件数。Kepler の山が立つ）",
        sample: `${s.histogram.length}年分`,
      },
      {
        path: "/exoplanet/summary/totalPlanets",
        type: "number",
        note: `質量と半径が判明している確認済み惑星の総数（${s.summary.totalPlanets}）→ BigStat の主役数値（decimals=0, unit='個' か null）`,
      },
    ];
    if (mel) {
      paths.push(
        { path: "/exoplanet/summary/mostEarthLike/name", type: "string", note: "最も地球に近い惑星の名前 → Card.title や Heading" },
        { path: "/exoplanet/summary/mostEarthLike/r", type: "number", note: "その半径（地球=1）→ Kpi/Text。$format で小数1桁に" },
        { path: "/exoplanet/summary/mostEarthLike/m", type: "number", note: "その質量（地球=1）→ Kpi/Text。$format で小数1桁に" },
        { path: "/exoplanet/summary/mostEarthLike/dist", type: "number|null", note: "地球からの距離（パーセク）→ Kpi/Text" },
      );
    }
    paths.push(
      { path: "/exoplanet/summary/peakYear", type: "number|null", note: `発見が最多だった年（${s.summary.peakYear}）→ Text/Kpi` },
      { path: "/exoplanet/summary/peakCount", type: "number", note: `その年の発見数（${s.summary.peakCount}）→ Text/Kpi` },
    );

    return {
      summary:
        `系外惑星（${MODE_LABEL[s.summary.mode]}）: 散布 ${n} 個、確認済み総数 ${s.summary.totalPlanets}。` +
        (mel ? ` 最も地球似=${mel.name}（半径${mel.r}・質量${mel.m}）。` : "") +
        (s.summary.peakYear ? ` 発見ピーク ${s.summary.peakYear} 年（${s.summary.peakCount}件）。` : ""),
      paths,
      suggest: ["Heading", "ScatterPlot", "BigStat", "Card", "Kpi", "Histogram", "Text", "ActionButton"],
      notes: [
        "主役は ScatterPlot（質量×半径の log-log 分布）。地球と木星の基準点は部品に内蔵なので scatterPoints をバインドするだけでよい。",
        "確認済み総数 totalPlanets は BigStat で大きく。最も地球似の惑星は Card か Kpi で添える。",
        "発見年 Histogram を下に置くと「Kepler が2014/2016に大量発見した」歴史が一目で伝わる。",
      ],
      followups: ["木星みたいな巨大ガス惑星を見せて", "最近見つかった系外惑星は？", "今週ヤバい小惑星ある？"],
    };
  },
};
