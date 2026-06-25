"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SPEC_DATA_PART_TYPE, type Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { FinderRenderer } from "@/lib/render/renderer";
import type { Stage } from "@/lib/finder/types";

/**
 * exp03 本体シェル（01 写経 + 双方向 2モード）:
 *   問い → /api/generate(intent=form) → LLM がフォーム spec を組む
 *   トグル（local・即時）→ 「探す」→ /api/generate(intent=find, shelf=現在選択) → サーバ計算 → 結果ボード
 *   「別の条件でさがす」→ 元の問いで form に戻る
 * 「探す」の送信は action params に state を解決させず、onStateChange で保つ ref から組む（design §1）。
 */

const EXAMPLES = [
  "炎か飛行タイプで、素早さ高めの相棒",
  "第1世代の水タイプでタフなやつ",
  "ドラゴンタイプで攻撃が高いポケモン",
  "はがね・エスパーで打たれ強い相棒",
];

type AnyPart = { type: string; data?: unknown };
type Shelf = { type?: Record<string, boolean>; generationId?: number | null; minStats?: Record<string, number> };

function lastStage(parts: AnyPart[]): Stage | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "data-stage") return parts[i].data as Stage;
  }
  return undefined;
}

function applyChange(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.replace(/^\//, "").split("/");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** 現在 shelf → findMons 引数（false / 0 は落とす）。 */
function toFindParams(shelf: Shelf | undefined) {
  const types = Object.entries(shelf?.type ?? {}).filter(([, v]) => v).map(([k]) => k);
  const minStats = Object.fromEntries(Object.entries(shelf?.minStats ?? {}).filter(([, v]) => typeof v === "number" && v > 0));
  return { types, generationId: shelf?.generationId ?? null, minStats };
}

const PHASE_TITLE: Record<string, string> = {
  fetching: "準備中",
  composing: "画面を構成中",
  error: "エラー",
};

function Waiting({ stage }: { stage?: Stage }) {
  const phase = stage?.phase ?? "fetching";
  return (
    <div className="pf-panel" style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{PHASE_TITLE[phase] ?? "…"}</div>
      <div className="pf-text pf-text--muted" style={{ marginTop: 6 }}>{stage?.label ?? "LLM がUIを組んでいます…"}</div>
    </div>
  );
}

export default function Page() {
  const [input, setInput] = useState("");
  // 「探す」の送信用 ref（prepareSendMessagesRequest が同期で読む）。
  const intentRef = useRef<"form" | "find">("form");
  const shelfParamsRef = useRef<ReturnType<typeof toFindParams> | null>(null);
  const queryRef = useRef<string>("");
  // フォームの現在 state（onStateChange のデルタを畳んで保つ）。
  const liveRef = useRef<Record<string, unknown>>({});

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/generate",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            intent: intentRef.current,
            shelf: shelfParamsRef.current,
            query: queryRef.current,
          },
        }),
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const streaming = status === "submitted" || status === "streaming";
  const isLanding = messages.length === 0;

  // ★ json-render の ActionProvider は handlers を useState で初回マウント時に凍結する。
  // FinderRenderer は Compose-Live で streaming 中にマウントするので、onFind/onAsk は安定参照にし、
  // 可変値（streaming/sendMessage）は ref 越しに読む（凍結された handler でも現在値を見る）。
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;

  const lastMsg = messages.at(-1);
  const liveParts = (lastMsg?.role === "assistant" ? lastMsg.parts : []) as AnyPart[];
  const stage = lastStage(liveParts);
  const stageError = stage?.phase === "error" ? stage.label : undefined;

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.parts.some((p) => p.type === SPEC_DATA_PART_TYPE));
  const { spec, hasSpec } = useJsonRenderMessage(lastAssistant?.parts ?? []);
  const dataInit =
    (lastAssistant?.parts.find((p) => p.type === "data-initialState") as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  // store は initialState から seed（spec.state ではない）。form は spec.state、find は data-initialState。両方マージ。
  const initialState = useMemo(
    () => ({ ...((spec as Spec | null)?.state ?? {}), ...dataInit }),
    [spec, dataInit],
  );

  // 新しいボードが出たら liveRef を初期 state に再セット（その後トグルのデルタで更新）。
  useEffect(() => {
    liveRef.current = structuredClone(initialState);
  }, [lastAssistant?.id, initialState]);

  const inProgress = lastMsg?.role === "assistant" ? lastMsg : undefined;
  const inProgressHasSpec = !!inProgress?.parts.some((p) => (p as AnyPart).type === SPEC_DATA_PART_TYPE);
  const showWaiting = streaming && inProgress && !inProgressHasSpec;

  const submitForm = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setInput("");
    intentRef.current = "form";
    queryRef.current = t;
    void sendMessage({ text: t });
  };
  const onFind = useCallback(() => {
    if (streamingRef.current) return;
    intentRef.current = "find";
    shelfParamsRef.current = toFindParams((liveRef.current as { shelf?: Shelf }).shelf);
    void sendRef.current({ text: "（探す）" });
  }, []);
  const onAsk = useCallback((q: string) => {
    const t = q.trim();
    if (!t || streamingRef.current) return;
    intentRef.current = "form";
    queryRef.current = t;
    void sendRef.current({ text: t });
  }, []);

  return (
    <main className="pf-shell">
      <header className="pf-topbar">
        <span className="pf-logo">◓ Pokéfinder</span>
        <span className="pf-sub">実験03 · LLM が双方向の入力フォームを組む</span>
      </header>

      <form className="pf-ask" onSubmit={(e) => { e.preventDefault(); submitForm(input); }} style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="どんな相棒をさがす？（例: 炎か飛行で素早さ高め）"
          style={{ flex: 1, padding: "11px 14px", border: "1.5px solid var(--line)", borderRadius: 11, fontSize: 15 }}
        />
        <button className="pf-actionbtn pf-actionbtn--primary" disabled={streaming}>{streaming ? "…" : "組む"}</button>
      </form>

      {(error || stageError) && <div className="pf-fallback">エラー: {stageError ?? error?.message}</div>}

      {isLanding ? (
        <section className="pf-panel">
          <h3 className="pf-panel__title">何をさがす？ — 問いを入れると LLM がその場でフォームを組む</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className="pf-actionbtn pf-actionbtn--default" disabled={streaming} onClick={() => submitForm(q)}>
                {q}
              </button>
            ))}
          </div>
        </section>
      ) : showWaiting ? (
        <Waiting stage={stage} />
      ) : hasSpec && spec ? (
        <FinderRenderer
          key={lastAssistant?.id}
          spec={spec as Spec}
          initialState={initialState}
          loading={streaming}
          onFind={onFind}
          onAsk={onAsk}
          onStateChange={(changes) => {
            for (const c of changes) applyChange(liveRef.current, c.path, c.value);
          }}
        />
      ) : streaming ? (
        <Waiting stage={stage} />
      ) : null}
    </main>
  );
}
