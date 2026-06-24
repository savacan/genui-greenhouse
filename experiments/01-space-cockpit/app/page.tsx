"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SPEC_DATA_PART_TYPE, type Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { CockpitRenderer } from "@/lib/render/renderer";
import type { Stage } from "@/lib/cockpit/types";

// 観測地の座標（geolocation）を毎リクエストの body に注入する。LLM には通らず、サーバが
// aurora の「あなたに届くか」判定にだけ使う（ファイアウォール維持）。モジュール変数を
// prepareSendMessagesRequest が読む（transport は単一・このページ専用）。
let observerForRequest: { lat: number; lon: number } | null = null;
const transport = new DefaultChatTransport({
  api: "/api/generate",
  prepareSendMessagesRequest: ({ messages }) => ({
    body: { messages, observer: observerForRequest },
  }),
});

// 「何を聞けば何が返るか」をカテゴリで見せる（フラットなチップ列より範囲が伝わる）。
const GROUPS: Array<{ label: string; items: string[] }> = [
  { label: "リアルタイム", items: ["ISS は今どこ？", "宇宙に今何人いる？"] },
  { label: "見て楽しむ", items: ["今の地球を宇宙から見せて", "オーロラの画像を探して"] },
  { label: "数で驚く", items: ["今週ヤバい小惑星ある？", "地球に似た系外惑星は？"] },
  { label: "探索する", items: ["次のロケット打ち上げは？", "今日の写真と今週の小惑星をまとめて"] },
];

const ACTION_LABEL: Record<string, string> = {
  apod: "APOD",
  apodGallery: "APODまとめ",
  neows: "小惑星",
  iss: "ISS",
  astros: "宇宙の人数",
  epic: "地球",
  imageSearch: "画像検索",
  launches: "打ち上げ",
  exoplanet: "系外惑星",
  spaceWeather: "宇宙天気",
  cme: "太陽嵐",
  aurora: "オーロラ",
  flares: "太陽フレア",
  stormReplay: "リプレイ",
};
const STEPS: Array<{ phase: Stage["phase"]; label: string }> = [
  { phase: "routing", label: "ルート" },
  { phase: "fetching", label: "取得" },
  { phase: "composing", label: "構成" },
];

// 太陽嵐クラスタのアクション = 待ち時間の段階で「これは宇宙天気の問い」と分かる → acq を警戒色に。
const STORM_TOPIC = new Set(["cme", "spaceWeather", "aurora", "flares", "stormReplay"]);

const PHASE_TITLE: Record<string, string> = {
  routing: "航路を計算中",
  fetching: "観測データを取得",
  composing: "計器を組み上げ",
  error: "エラー",
};
const PHASE_SUB: Record<string, string> = {
  routing: "問いに合う計器を選定しています…",
  fetching: "選ばれた計器がデータを取得中…",
  composing: "取得した値で画面を構成しています…",
  error: "",
};

type AnyPart = { type: string; data?: unknown };

interface Overview {
  iss: Record<string, unknown> | null;
  astros: { total?: number } | null;
  launches: { next?: unknown } | null;
  apod: { isVideo?: boolean; imageUrl?: string | null } | null;
}

const $ = (path: string) => ({ $state: path });

/** 着地ボード「今、宇宙では」= 手書きレイアウト × ライブデータ（LLM なし）。出せるタイルだけ組む。 */
function buildBoard(ov: Overview): { spec: Spec; state: Record<string, unknown> } | null {
  const elements: Record<string, unknown> = {};
  const children: string[] = [];

  elements.boardHead = { type: "Heading", props: { text: "◍ 今、宇宙では", level: "h1" } };
  elements.boardSub = {
    type: "Text",
    props: { text: "リアルタイムの宇宙のいま。下の問いを投げると、この画面がその答えに組み変わる。", muted: true },
  };
  children.push("boardHead", "boardSub");

  if (ov.iss) {
    elements.globeCard = { type: "Card", props: { title: "🛰 ISS は今ここ", tone: "default" }, children: ["boardGlobe", "boardGlobeBtn"] };
    elements.boardGlobe = { type: "Globe3D", props: { lat: $("/iss/lat"), lon: $("/iss/lon"), label: "ISS" } };
    elements.boardGlobeBtn = { type: "ActionButton", props: { label: "ISS を詳しく", tone: "default" }, on: { click: { action: "ask", params: { query: "ISSは今どこ？" } } } };
    children.push("globeCard");
  }

  const statTiles: string[] = [];
  if (ov.astros && typeof ov.astros.total === "number") {
    elements.peopleCard = { type: "Card", props: { title: "👨‍🚀 今、宇宙にいる人", tone: "default" }, children: ["peopleBig", "peopleList"] };
    elements.peopleBig = { type: "BigStat", props: { label: "宇宙に滞在中", value: $("/astros/total"), unit: "人", context: null, decimals: 0, tone: "default" } };
    elements.peopleList = { type: "List", props: { items: $("/astros/craftSummary"), ordered: false, title: null } };
    statTiles.push("peopleCard");
  }
  if (ov.launches && ov.launches.next) {
    elements.launchCard = { type: "Card", props: { title: "🚀 次の打ち上げ", tone: "default" }, children: ["launchCd", "launchWho", "launchBtn"] };
    elements.launchCd = { type: "Countdown", props: { target: $("/launches/next/net"), label: $("/launches/next/name"), precision: $("/launches/next/precision"), zeroLabel: null } };
    elements.launchWho = { type: "Text", props: { text: $("/launches/next/provider"), muted: true } };
    elements.launchBtn = { type: "ActionButton", props: { label: "打ち上げ予定を見る", tone: "default" }, on: { click: { action: "ask", params: { query: "次のロケット打ち上げは？" } } } };
    statTiles.push("launchCard");
  }
  if (statTiles.length) {
    elements.statsRow = { type: "Stack", props: { direction: "horizontal", gap: "md", wrap: true }, children: statTiles };
    children.push("statsRow");
  }

  if (ov.apod && !ov.apod.isVideo && ov.apod.imageUrl) {
    elements.apodCard = { type: "Card", props: { title: "🖼 今日の宇宙写真", tone: "default" }, children: ["boardApod"] };
    elements.boardApod = { type: "HeroImage", props: { src: $("/apod/imageUrl"), title: $("/apod/title"), caption: null, credit: $("/apod/credit") } };
    children.push("apodCard");
  }

  if (children.length <= 2) return null; // ヘッダだけ = ライブデータが何も取れなかった
  elements.boardRoot = { type: "Stack", props: { direction: "vertical", gap: "lg", wrap: false }, children };
  return { spec: { root: "boardRoot", elements } as unknown as Spec, state: ov as unknown as Record<string, unknown> };
}

function lastStage(parts: AnyPart[]): Stage | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "data-stage") return parts[i].data as Stage;
  }
  return undefined;
}

/**
 * 待ち時間（routing → fetching → 最初の patch まで ≒19秒）のシネマ演出。死に時間を
 * 「管制室が答えを取りに行く」過程に変える＝ルーターが選んだ計器・各ソースの取得状況
 * （◌取得中→✓取得）を可視化（自己組成のオブザーバビリティUI）。最初の spec patch が
 * 来た瞬間に Compose-Live のビルドへ引き継がれる。
 */
function AcquisitionSequence({ stage }: { stage?: Stage }) {
  const phase = stage?.phase ?? "routing";
  const curIdx = STEPS.findIndex((s) => s.phase === phase);
  // 計器リスト: per-source（status 付き）優先、無ければ label を ", " 分割。
  const ids = stage?.sources?.map((s) => s.id) ?? (stage?.label ? stage.label.split(", ") : []);
  const statusOf = (id: string): "pending" | "done" | "error" =>
    stage?.sources?.find((s) => s.id === id)?.status ?? (phase === "composing" ? "done" : "pending");
  const alert = ids.some((id) => STORM_TOPIC.has(id));

  return (
    <div className={`sc-acq${alert ? " sc-acq--alert" : ""}`}>
      <div className="sc-acq__beam" />
      <div className="sc-acq__head">
        <span className="sc-acq__spin" />
        <div>
          <div className="sc-acq__title">{PHASE_TITLE[phase] ?? "…"}</div>
          <div className="sc-acq__sub">{PHASE_SUB[phase] ?? ""}</div>
        </div>
      </div>

      {ids.length > 0 && (
        <ul className="sc-acq__sources">
          {ids.map((id) => {
            const st = statusOf(id);
            return (
              <li key={id} className={`sc-acq__src is-${st}`}>
                <span className="sc-acq__icon">{st === "done" ? "✓" : st === "error" ? "⚠" : ""}</span>
                <span className="sc-acq__name">{ACTION_LABEL[id] ?? id}</span>
                <span className="sc-acq__stat">
                  {st === "done" ? "取得" : st === "error" ? "失敗" : "取得中…"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sc-acq__rail">
        {STEPS.map((s, i) => (
          <span
            key={s.phase}
            className={`sc-acq__step is-${i < curIdx ? "done" : i === curIdx ? "active" : "todo"}`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** カテゴリ別の例示メニュー（着地時の「何を聞けばいい？」を実例で答える）。 */
function PromptMenu({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <section className="sc-menu">
      <div className="sc-menu__hint">何を聞けばいい？ — 例から選ぶか、上のバーに自由に入力（画面がその答えに組み変わる）</div>
      <div className="sc-menu__grid">
        {GROUPS.map((g) => (
          <div key={g.label} className="sc-menu__group">
            <div className="sc-menu__label">{g.label}</div>
            {g.items.map((q) => (
              <button key={q} type="button" className="sc-chip" disabled={disabled} onClick={() => onPick(q)}>
                {q}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="sc-board-skel">
      <div className="sc-skel sc-skel--globe" />
      <div className="sc-skel-row">
        <div className="sc-skel sc-skel--tile" />
        <div className="sc-skel sc-skel--tile" />
      </div>
    </div>
  );
}

/**
 * Verdict-Tempo: サーバが値にした verdict から「画面の機嫌」を畳む（最大値選択のみ＝spec 計算ではない）。
 * storm だけ尖らせ、quiet/unsettled は現状の質感のまま（3段階出すと知覚しづらく安っぽい）。
 * 嵐の判定: 宇宙天気が storm / リプレイが storm / 地球向き CME が接近・到達中（= 戦況室）。
 */
function deriveMood(state: Record<string, unknown>): "calm" | "storm" {
  const slice = (k: string) => state[k] as Record<string, unknown> | undefined;
  const sw = slice("spaceWeather");
  const sr = slice("stormReplay");
  const cme = slice("cme");
  if (sw?.verdict === "storm") return "storm";
  if (sr?.verdict === "storm") return "storm";
  if (cme && (cme.status === "approaching" || cme.status === "arrived")) return "storm";
  return "calm";
}

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({ transport });
  const streaming = status === "submitted" || status === "streaming";
  const isLanding = messages.length === 0;

  // 着地ボード用ライブスナップショット（LLM なし・即取得）。
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d: Overview) => { if (!cancelled) setOverview(d); })
      .catch(() => { /* 取れなくてもメニューは出す */ })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const board = useMemo(() => (overview ? buildBoard(overview) : null), [overview]);

  // 観測地の座標を取得（オーロラの個人判定用）。座標はサーバへ送るが LLM には渡らない。
  const [geo, setGeo] = useState<"idle" | "ok" | "denied">("idle");
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        observerForRequest = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setGeo("ok");
      },
      () => setGeo("denied"),
      { timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  // 進行中の assistant メッセージから進捗を読む。
  const lastMsg = messages.at(-1);
  const liveParts = (lastMsg?.role === "assistant" ? lastMsg.parts : []) as AnyPart[];
  const stage = lastStage(liveParts);
  const stageError = stage?.phase === "error" ? stage.label : undefined;

  // spec パートを持つ最新の assistant メッセージ（空応答でも前の画面を消さない）
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.parts.some((p) => p.type === SPEC_DATA_PART_TYPE));
  const { spec, hasSpec } = useJsonRenderMessage(lastAssistant?.parts ?? []);
  const initialState =
    (lastAssistant?.parts.find((p) => p.type === "data-initialState") as
      | { data?: Record<string, unknown> }
      | undefined)?.data ?? {};

  // 今投げた問いの応答（最後のメッセージが assistant）。まだ spec part を持たない間 = 待ち時間 →
  // 前の画面に代えて待ちのシネマ演出を出す。最初の patch が来た時点で hasSpec 経路（Compose-Live）へ。
  const inProgress = lastMsg?.role === "assistant" ? lastMsg : undefined;
  const inProgressHasSpec = !!inProgress?.parts.some(
    (p) => (p as AnyPart).type === SPEC_DATA_PART_TYPE,
  );

  // いま実際に「ボード」を見せているか（待ちのシネマ中ではない）。Verdict-Tempo は表示中の
  // ボードの initialState から畳む → 待ち中は前の応答の verdict を引きずらない。
  const showingBoard = !(streaming && inProgress && !inProgressHasSpec) && hasSpec && !!spec;
  const mood = showingBoard ? deriveMood(initialState) : "calm";

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setInput("");
    void sendMessage({ text: t });
  };

  // 生成 UI / 着地ボードの ActionButton から呼ばれる「別の問いを投げ直す」。安定参照で持つ。
  const onAsk = useCallback(
    (query: string) => {
      const t = query.trim();
      if (t) void sendMessage({ text: t });
    },
    [sendMessage],
  );

  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <span className="sc-logo">◍ SPACE&nbsp;COCKPIT</span>
        <span className="sc-sub">実験01 · 自然言語の問いで UI が組み変わる</span>
        {geo === "ok" ? (
          <span className="sc-geo is-ok" title="オーロラ等の個人判定に使用（座標はサーバのみ・LLMには渡しません）">📍 現在地 ON</span>
        ) : geo === "denied" ? (
          <span className="sc-geo" title="位置情報なし。オーロラは全球判定になります">📍 現在地 OFF</span>
        ) : null}
      </header>

      <form className="sc-ask" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="今週ヤバい小惑星ある？ / 今日のAPOD / ISSは今どこ？"
        />
        <button disabled={streaming}>{streaming ? "…" : "Ask"}</button>
      </form>

      {(error || stageError) && (
        <div className="sc-fallback">エラー: {stageError ?? error?.message}</div>
      )}

      {isLanding ? (
        <>
          <div className="sc-stage">
            {board ? (
              <CockpitRenderer key="board" spec={board.spec} initialState={board.state} loading={false} onAsk={onAsk} />
            ) : overviewLoading ? (
              <BoardSkeleton />
            ) : null}
          </div>
          <PromptMenu onPick={submit} disabled={streaming} />
        </>
      ) : (
        <div className={`sc-stage${mood === "storm" ? " sc-mood-storm" : ""}`}>
          {streaming && inProgress && !inProgressHasSpec ? (
            // 新しい問いが進行中・まだ spec が始まっていない = 待ち時間 → シネマ演出
            <AcquisitionSequence stage={stage} />
          ) : hasSpec && spec ? (
            // Compose-Live: streaming 中は同一 id なので remount せず、計器が patch 順に育つ。
            // 完了後はそのまま定常表示（key は応答ごとに変わり initialState/handlers を作り直す）。
            <CockpitRenderer
              key={lastAssistant?.id}
              spec={spec}
              initialState={initialState}
              loading={streaming}
              onAsk={onAsk}
            />
          ) : streaming ? (
            <AcquisitionSequence stage={stage} />
          ) : null}
        </div>
      )}
    </main>
  );
}
