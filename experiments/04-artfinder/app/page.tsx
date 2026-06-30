"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SPEC_DATA_PART_TYPE, createStateStore, type Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { FinderRenderer } from "@/lib/render/renderer";
import type { ArtGridRow } from "@/lib/render/components/ArtGrid";
import type { Stage } from "@/lib/finder/types";
import { toFindParams, hasAnyFilter, type Shelf } from "@/lib/finder/shelf";

/**
 * exp04 本体シェル（docs §12 = form 永続 live 再検索）:
 *   問い → /api/generate(form) で LLM が「フォーム＋結果リージョン」を1枚に組む
 *   → controlled StateStore を mount したまま保持（ボード remount しない）
 *   → トグル/入力（local・即時・store 書込）→「探す」→ /api/find（計算のみ・form→ES 翻訳）→ store.update /findArt
 *   → 同一 spec 内の ArtGrid が live 更新（form 選択も結果も飛ばない＝remount-flash の回避）。
 */

const EXAMPLES = [
  "青っぽい近代の油彩",
  "水辺を描いた風景画",
  "ヨーロッパの版画",
  "絵画か、青い作品",
];

type AnyPart = { type: string; data?: unknown };

function lastStage(parts: AnyPart[]): Stage | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "data-stage") return parts[i].data as Stage;
  }
  return undefined;
}

const EMPTY_RESULT = { artworks: [], count: 0, matchedCount: 0, criteriaLabel: "", note: "" };

export default function Page() {
  const [input, setInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  // ★ 1つの controlled store を mount したまま保つ（form 選択も結果も remount で飛ばない）。
  const store = useMemo(() => createStateStore({}), []);
  const seededRef = useRef<string | null>(null);
  const searchingRef = useRef(false);
  searchingRef.current = searching;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/generate",
        // §14: 指差し再 compose は sendMessage(..., { body: { seed } }) で seed を載せる → ここで merge。
        prepareSendMessagesRequest: ({ messages, body }) => ({ body: { messages, ...(body ?? {}) } }),
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const streaming = status === "submitted" || status === "streaming";
  const streamingRef = useRef(false);
  streamingRef.current = streaming;
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const isLanding = messages.length === 0;

  const lastMsg = messages.at(-1);
  const liveParts = (lastMsg?.role === "assistant" ? lastMsg.parts : []) as AnyPart[];
  const stage = lastStage(liveParts);
  const stageError = stage?.phase === "error" ? stage.label : undefined;

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.parts.some((p) => p.type === SPEC_DATA_PART_TYPE));
  const { spec, hasSpec } = useJsonRenderMessage(lastAssistant?.parts ?? []);

  // 新しいフォームが組み上がったら controlled store を spec.state.shelf で seed し、/findArt を空に。
  useEffect(() => {
    if (streaming) return;
    const id = lastAssistant?.id;
    if (!id || seededRef.current === id) return;
    const shelf = (spec as Spec | null)?.state?.shelf as Record<string, unknown> | undefined;
    if (shelf || hasSpec) {
      store.set("/shelf", shelf ? structuredClone(shelf) : {});
      store.set("/findArt", { ...EMPTY_RESULT });
      seededRef.current = id;
      setFindError(null);
    }
  }, [streaming, lastAssistant?.id, spec, hasSpec, store]);

  const inProgress = lastMsg?.role === "assistant" ? lastMsg : undefined;
  const inProgressHasSpec = !!inProgress?.parts.some((p) => (p as AnyPart).type === SPEC_DATA_PART_TYPE);
  const showWaiting = streaming && inProgress && !inProgressHasSpec;

  const submitForm = (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    setInput("");
    setFindError(null);
    void sendMessage({ text: t });
  };

  // 「探す」: LLM を介さず現在 store を読んでサーバ計算 → store に値を書き戻し（ArtGrid が live 更新）。
  const onFind = useCallback(async () => {
    if (searchingRef.current) return;
    const shelf = (store.getSnapshot() as { shelf?: Shelf }).shelf;
    const params = toFindParams(shelf);
    if (!hasAnyFilter(params)) {
      setFindError("種別・部門・年代・色・検索語のいずれかを指定してください。");
      return;
    }
    setFindError(null);
    setSearching(true);
    try {
      const res = await fetch("/api/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      store.set("/findArt", {
        artworks: data.artworks,
        count: data.count,
        matchedCount: data.matchedCount,
        criteriaLabel: data.criteriaLabel,
        note: data.note ?? "",
      });
    } catch (e) {
      setFindError(String(e));
    } finally {
      setSearching(false);
    }
  }, [store]);

  // §14「指差しで組み直す」: 結果カードの作品をクリック → seed に、LLM が「似た作品」フォームを再 compose。
  // 安定参照（useCallback []）＋可変値は ref 越し（§10 の handler 凍結を踏まないため）。
  const onAnchor = useCallback((art: ArtGridRow) => {
    if (streamingRef.current) return;
    const seed = { title: art.title, artist: art.artist, type: art.type, hue: art.hue };
    setInput("");
    setFindError(null);
    void sendRef.current({ text: `「${art.title}」に似た作品をさがす` }, { body: { seed } });
  }, []);

  return (
    <main className="af-shell">
      <header className="af-topbar">
        <span className="af-logo">▣ Artfinder</span>
        <span className="af-sub">実験04 · LLM が双方向の入力フォームを組み、上流(AIC)クエリ言語へ翻訳して live 再検索</span>
      </header>

      <form
        className="af-ask"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm(input);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 18 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="どんな作品をさがす？（例: 青っぽい近代の油彩 / モネの絵）"
          style={{ flex: 1, padding: "11px 14px", border: "1.5px solid var(--line)", borderRadius: 11, fontSize: 15, fontFamily: "system-ui, sans-serif" }}
        />
        <button className="af-actionbtn af-actionbtn--primary" disabled={streaming}>
          {streaming ? "…" : "組む"}
        </button>
      </form>

      {(error || stageError || findError) && (
        <div className="af-fallback">エラー: {stageError ?? findError ?? error?.message}</div>
      )}

      {isLanding ? (
        <section className="af-panel">
          <h3 className="af-panel__title">何をさがす？ — 問いを入れると LLM がフォーム＋結果欄を1枚に組む（探すで結果がその場で更新）</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className="af-actionbtn af-actionbtn--default" disabled={streaming} onClick={() => submitForm(q)}>
                {q}
              </button>
            ))}
          </div>
        </section>
      ) : showWaiting ? (
        <div className="af-panel" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>フォームを構成中</div>
          <div className="af-text af-text--muted" style={{ marginTop: 6 }}>{stage?.label ?? "LLM がフォームと結果欄を組んでいます…"}</div>
        </div>
      ) : hasSpec && spec ? (
        <div className={searching ? "af-searching" : undefined}>
          <FinderRenderer key={lastAssistant?.id} spec={spec as Spec} store={store} loading={streaming} onFind={onFind} onAnchor={onAnchor} />
          {searching ? <div className="af-text af-text--muted" style={{ marginTop: 8 }}>探索中…</div> : null}
        </div>
      ) : null}
    </main>
  );
}
