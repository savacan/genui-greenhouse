import type { StateHint } from "./types";

/** 1アクション分の hint（multi-step で複数手回れば複数渡る）。 */
export interface ComposePart {
  id: string;
  hint: StateHint;
}

/**
 * 最終 spec 構成（compose 段）のユーザープロンプト = データ→プロンプトのファイアウォール。
 * 01 から写経。生データ・配列は一切渡さず、$state パス・型・意味・件数だけを渡す。
 * multi-step loop で集めた全 hint を1画面に組ませる。
 */
export function buildComposePrompt(query: string, parts: ComposePart[]): string {
  const sections = parts.map(({ id, hint }) => {
    const paths = hint.paths
      .map((p) => `    ${p.path} : ${p.type} — ${p.note}${p.sample ? ` (${p.sample})` : ""}`)
      .join("\n");
    const notes = hint.notes?.length
      ? `\n  注意:\n${hint.notes.map((n) => "    - " + n).join("\n")}`
      : "";
    const suggest = hint.suggest?.length ? `\n  合いそうな部品: ${hint.suggest.join(", ")}` : "";
    return `【${id}】${hint.summary}\n  バインド可能な $state パス:\n${paths || "    (なし)"}${suggest}${notes}`;
  });

  const followups = [...new Set(parts.flatMap((p) => p.hint.followups ?? []))];
  const multi = parts.length > 1;

  return [
    `ユーザーの問い: "${query}"`,
    multi
      ? `エージェントが複数の手でデータを集めた。下の全セクションのデータを1画面に組む（見出しで区切る）。`
      : `データは取得・計算済みで state に入っている。`,
    `次の $state パスにだけ {"$state":"/path"} でバインドして UI を組むこと（パスを発明しない・生値を埋め込まない）:`,
    sections.join("\n\n"),
    followups.length
      ? [
          `フォローアップ導線: 末尾に ActionButton を2〜3個（Stack direction=horizontal にまとめる）。押すと別の問いを投げ直して画面が組み直る。`,
          `各 ActionButton には必ず on を付ける: "on": {"click": {"action": "ask", "params": {"query": "<問い>"}}}。label は短く。`,
          `使える問い: ${followups.map((q) => `"${q}"`).join(" / ")}`,
        ].join("\n")
      : "",
    [
      `表示整形（計算ではない）: 人に見せる数値が小数や大きい桁のときは $format で整形する。`,
      `  例: {"$format":"number","value":{"$state":"/path"},"options":{"maximumFractionDigits":1}}`,
      `  これは Kpi.value や Text に直接出す数値にだけ使う。`,
      `  生の配列/url/オブジェクトを受ける部品（QuakeList / MagnitudeBars / Beachball(planes) / ShakeMapImage(src) / Sparkline(points) / ArticleGrid(articles) / WeatherTile(current)）に渡す値は生のまま（$state だけ）。整形すると壊れる。`,
    ].join("\n"),
    `ルール: カタログにある部品だけを使う。計算はしない（値は最終形。表示整形は $format のみ）。問いに直接答える、明快で過不足のない構成にする。`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
