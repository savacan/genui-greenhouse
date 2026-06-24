import { generateText, Output, type LanguageModel } from "ai";
import { routerSchema, actionMenu, type Routed } from "./actions";

/**
 * Step 1: 自然言語の問い → アクション（1件以上）+ 各引数（制約付き・決定的）。
 * スキーマ・メニューは ACTIONS から derive（router 側に二重定義なし）。
 *  - 複合質問（写真と小惑星を一緒に等）のときだけ複数アクションを返す。通常は1件。
 *  - history（直近の問い）を渡し、「じゃあ昨日のは？」等のフォローアップを解けるようにする = 多ターン。
 */
export async function routeQuery(
  model: LanguageModel,
  query: string,
  today: string,
  signal: AbortSignal,
  history: string[] = [],
): Promise<Routed> {
  const historyBlock = history.length
    ? `\nこれまでの問い（古い→新しい。フォローアップの文脈に使う）:\n${history.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}\n`
    : "";
  const result = await generateText({
    model,
    abortSignal: signal,
    system:
      `あなたは宇宙データ探索ダッシュボードのルーター。ユーザーの問いに合うアクションを選び、各引数を埋める。\n` +
      `通常は actions に1件。問いが明確に複数トピックに跨る場合のみ複数（例「今日の写真と今週の小惑星」→ apod と neows）。最大3件。同じアクションは1回まで。\n` +
      `今日は ${today}。日付はすべて YYYY-MM-DD。neows の既定の期間は「今日を終端とする直近3日」、apodGallery の既定は「今日を終端とする直近7日」（startDate/endDate を埋める）。\n` +
      `apod=天体写真1日、apodGallery=天体写真の複数日/今週まとめ、epic=地球そのものを宇宙から見た全球写真（今の地球/その日の地球）、imageSearch=任意の語で NASA 画像アーカイブを検索。題材（天体か地球か検索か）と単複で選ぶ。\n` +
      `「太陽嵐は来てる?／宇宙天気／地磁気」系は spaceWeather と cme の両方を返す（太陽風・Kp は spaceWeather、地球向き CME の到達予測は cme）。「オーロラ見える?／オーロラ予報」は aurora と spaceWeather（できれば cme も）。「太陽フレア」を明示する問いは flares も足す。これらは複合で同時に取る。\n` +
      `「過去の大嵐をリプレイ／一番すごかった太陽嵐／嵐を体験」系は stormReplay 単体を返す（過去の実イベント再生・他アクションは混ぜない）。\n` +
      historyBlock +
      `\n利用可能なアクション:\n${actionMenu}`,
    prompt: query,
    experimental_output: Output.object({ schema: routerSchema }),
  });
  return result.experimental_output as Routed;
}
