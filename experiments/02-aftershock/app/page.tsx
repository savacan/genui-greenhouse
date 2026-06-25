"use client";

import { useCallback, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SPEC_DATA_PART_TYPE, type Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { MonitorRenderer } from "@/lib/render/renderer";
import type { Stage } from "@/lib/monitor/types";

const transport = new DefaultChatTransport({
  api: "/api/generate",
  prepareSendMessagesRequest: ({ messages }) => ({ body: { messages } }),
});

const GROUPS: Array<{ label: string; items: string[] }> = [
  { label: "まず一覧", items: ["最近の大きい地震は？", "今週 M5 以上の地震を見せて"] },
  { label: "深掘り", items: ["いちばん大きい地震を詳しく", "その地震の発震機構は？"] },
  { label: "連鎖で調べる", items: ["最大の地震の震源、今どんな天気？", "震源の周りには何がある？"] },
];

// multi-step loop の各手（思考連鎖）の表示名。
const TOOL_LABEL: Record<string, string> = {
  quakes: "地震の一覧",
  quakeDetail: "最大イベントの詳細",
  weather: "震源の天気",
  nearby: "震源の周辺",
  aircraft: "上空の航空機",
};
const STEPS: Array<{ phase: Stage["phase"]; label: string }> = [
  { phase: "routing", label: "調査" },
  { phase: "fetching", label: "取得" },
  { phase: "composing", label: "構成" },
];
const PHASE_TITLE: Record<string, string> = {
  routing: "調査計画を立案中",
  fetching: "エージェントが多段で調査中",
  composing: "画面を構成中",
  error: "エラー",
};
const PHASE_SUB: Record<string, string> = {
  routing: "問いに合う調べ方をエージェントが決めています…",
  fetching: "地震 → 詳細 → 震源の天気/周辺 と、必要な手を自分でたどっています…",
  composing: "集めた値で画面を組み上げています…",
  error: "",
};

type AnyPart = { type: string; data?: unknown };

function lastStage(parts: AnyPart[]): Stage | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "data-stage") return parts[i].data as Stage;
  }
  return undefined;
}

/**
 * 待ちのシネマ（routing → 多段 fetching → composing）。死に時間を「エージェントが調べている
 * 過程」に変える＝モデルが選んだ手（tool）とその取得状況（◌→✓）を逐次可視化（per-step）。
 * 最初の spec patch が来た時点で Compose-Live のビルドへ引き継がれる。
 */
function AcquisitionSequence({ stage }: { stage?: Stage }) {
  const phase = stage?.phase ?? "routing";
  const curIdx = STEPS.findIndex((s) => s.phase === phase);
  const steps = stage?.steps ?? [];
  const alert = steps.some((s) => s.status === "error");
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
      {steps.length > 0 && (
        <ul className="sc-acq__sources">
          {steps.map((s) => (
            <li key={s.tool} className={`sc-acq__src is-${s.status}`}>
              <span className="sc-acq__icon">{s.status === "done" ? "✓" : s.status === "error" ? "⚠" : ""}</span>
              <span className="sc-acq__name">{TOOL_LABEL[s.tool] ?? s.tool}</span>
              <span className="sc-acq__stat">{s.status === "done" ? "取得" : s.status === "error" ? "失敗" : "取得中…"}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="sc-acq__rail">
        {STEPS.map((s, i) => (
          <span key={s.phase} className={`sc-acq__step is-${i < curIdx ? "done" : i === curIdx ? "active" : "todo"}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PromptMenu({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <section className="sc-menu">
      <div className="sc-menu__hint">
        何を聞けばいい？ — エージェントが「地震 → 詳細 → 震源の天気/周辺」と自分で多段に調べて画面を組む
      </div>
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

/** Verdict-Tempo（01 流用）: 被害の大きい地震（PAGER red/orange・赤警報あり）だけ突入を尖らせる。 */
function deriveMood(state: Record<string, unknown>): "calm" | "storm" {
  const qd = state.quakeDetail as { pagerAlert?: string } | undefined;
  const q = state.quakes as { redAlertCount?: number } | undefined;
  if (qd?.pagerAlert === "red" || qd?.pagerAlert === "orange") return "storm";
  if (typeof q?.redAlertCount === "number" && q.redAlertCount > 0) return "storm";
  return "calm";
}

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({ transport });
  const streaming = status === "submitted" || status === "streaming";
  const isLanding = messages.length === 0;

  const lastMsg = messages.at(-1);
  const liveParts = (lastMsg?.role === "assistant" ? lastMsg.parts : []) as AnyPart[];
  const stage = lastStage(liveParts);
  const stageError = stage?.phase === "error" ? stage.label : undefined;

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.parts.some((p) => p.type === SPEC_DATA_PART_TYPE));
  const { spec, hasSpec } = useJsonRenderMessage(lastAssistant?.parts ?? []);
  const initialState =
    (lastAssistant?.parts.find((p) => p.type === "data-initialState") as { data?: Record<string, unknown> } | undefined)
      ?.data ?? {};

  const inProgress = lastMsg?.role === "assistant" ? lastMsg : undefined;
  const inProgressHasSpec = !!inProgress?.parts.some((p) => (p as AnyPart).type === SPEC_DATA_PART_TYPE);
  const showingBoard = !(streaming && inProgress && !inProgressHasSpec) && hasSpec && !!spec;
  const mood = showingBoard ? deriveMood(initialState) : "calm";

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setInput("");
    void sendMessage({ text: t });
  };
  const onAsk = useCallback(
    (q: string) => {
      const t = q.trim();
      if (t) void sendMessage({ text: t });
    },
    [sendMessage],
  );

  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <span className="sc-logo">◍ AFTERSHOCK</span>
        <span className="sc-sub">実験02 · エージェントが多段で調べて UI が組み上がる</span>
      </header>

      <form className="sc-ask" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="最近の大きい地震は？ / 最大の地震の震源の天気は？"
        />
        <button disabled={streaming}>{streaming ? "…" : "Ask"}</button>
      </form>

      {(error || stageError) && <div className="sc-fallback">エラー: {stageError ?? error?.message}</div>}

      {isLanding ? (
        <PromptMenu onPick={submit} disabled={streaming} />
      ) : (
        <div className={`sc-stage${mood === "storm" ? " sc-mood-storm" : ""}`}>
          {streaming && inProgress && !inProgressHasSpec ? (
            <AcquisitionSequence stage={stage} />
          ) : hasSpec && spec ? (
            <MonitorRenderer
              key={lastAssistant?.id}
              spec={spec as Spec}
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
