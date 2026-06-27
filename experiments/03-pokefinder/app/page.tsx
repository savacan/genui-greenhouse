"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SPEC_DATA_PART_TYPE, createStateStore, type Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import { FinderRenderer } from "@/lib/render/renderer";
import type { MonGridRow } from "@/lib/render/components/MonGrid";
import type { Stage } from "@/lib/finder/types";
import { toFindParams, type Shelf } from "@/lib/finder/shelf";

/**
 * exp03 本体シェル（docs §12 = form 永続 live 再検索）:
 *   問い → /api/generate(form) で LLM が「フォーム＋結果リージョン」を1枚に組む
 *   → controlled StateStore を mount したまま保持（ボード remount しない）
 *   → トグル（local・即時・store 書込）→「探す」→ /api/find（計算のみ）→ store.update /findMons
 *   → 同一 spec 内の MonGrid が live 更新（form 選択も結果も飛ばない＝§9 remount-flash の回避）。
 */

const EXAMPLES = [
  "炎か飛行タイプで、素早さ高めの相棒",
  "第1世代の水タイプでタフなやつ",
  "ドラゴンタイプで攻撃が高いポケモン",
  "はがね・エスパーで打たれ強い相棒",
];

type AnyPart = { type: string; data?: unknown };

function lastStage(parts: AnyPart[]): Stage | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "data-stage") return parts[i].data as Stage;
  }
  return undefined;
}

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
    () => new DefaultChatTransport({
      api: "/api/generate",
      // §14: 指差し再 compose は sendMessage(..., { body: { seedMon } }) で seedMon を載せる → ここで merge。
      // intent はスプレッド後に固定（per-call body が固定キーを上書きできない）。
      prepareSendMessagesRequest: ({ messages, body }) => ({ body: { messages, ...(body ?? {}), intent: "form" } }),
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

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.parts.some((p) => p.type === SPEC_DATA_PART_TYPE));
  const { spec, hasSpec } = useJsonRenderMessage(lastAssistant?.parts ?? []);

  // 新しいフォームが組み上がったら controlled store を spec.state.shelf で seed し、/findMons を空に。
  // 1メッセージにつき1回（探すでは reseed しない＝選択を保持）。
  useEffect(() => {
    if (streaming) return;
    const id = lastAssistant?.id;
    if (!id || seededRef.current === id) return;
    const shelf = (spec as Spec | null)?.state?.shelf as Record<string, unknown> | undefined;
    if (shelf || hasSpec) {
      store.set("/shelf", shelf ? structuredClone(shelf) : {});
      store.set("/findMons", { mons: [], count: 0, matchedCount: 0, criteriaLabel: "", note: "" });
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

  // 「探す」: LLM を介さず現在 store を読んでサーバ計算 → store に値を書き戻し（MonGrid が live 更新）。
  const onFind = useCallback(async () => {
    if (searchingRef.current) return;
    const shelf = (store.getSnapshot() as { shelf?: Shelf }).shelf;
    const params = toFindParams(shelf);
    if (!params.types.length) { setFindError("タイプを1つ以上選んでください。"); return; }
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
      // §14b: matchedCount/note も書き戻す（OR で候補が cap を超えた等の開示を live パスに届ける＝dead-path 配線を解消）。
      store.set("/findMons", {
        mons: data.mons,
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

  // §14「指差しで組み直す」: 結果カードのモンをクリック → そのモンを seedMon に、LLM が「似た相棒」フォームを再 compose。
  // 安定参照（useCallback []）＋可変値は ref 越し（§10 の handler 凍結を踏まないため）。
  // seedMon は client が既に持つ値をそのまま渡す（再フェッチしない＝exp02 越境スカラー）。
  const onAnchor = useCallback((mon: MonGridRow) => {
    if (streamingRef.current) return;
    const seedMon = {
      name: mon.name,
      types: mon.types,
      stats: { hp: mon.hp, attack: mon.attack, defense: mon.defense, spAtk: mon.spAtk, spDef: mon.spDef, speed: mon.speed },
    };
    setInput("");
    setFindError(null);
    void sendRef.current({ text: `「${mon.name}」を起点に、似た相棒をさがす` }, { body: { seedMon } });
  }, []);

  return (
    <main className="pf-shell">
      <header className="pf-topbar">
        <span className="pf-logo">◓ Pokéfinder</span>
        <span className="pf-sub">実験03 · 双方向フォームを残したまま live 再検索</span>
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

      {(error || stageError || findError) && <div className="pf-fallback">エラー: {stageError ?? findError ?? error?.message}</div>}

      {isLanding ? (
        <section className="pf-panel">
          <h3 className="pf-panel__title">何をさがす？ — 問いを入れると LLM がフォーム＋結果欄を1枚に組む（探すで結果がその場で更新）</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className="pf-actionbtn pf-actionbtn--default" disabled={streaming} onClick={() => submitForm(q)}>
                {q}
              </button>
            ))}
          </div>
        </section>
      ) : showWaiting ? (
        <div className="pf-panel" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>フォームを構成中</div>
          <div className="pf-text pf-text--muted" style={{ marginTop: 6 }}>{stage?.label ?? "LLM がフォームと結果欄を組んでいます…"}</div>
        </div>
      ) : hasSpec && spec ? (
        <div className={searching ? "pf-searching" : undefined}>
          <FinderRenderer key={lastAssistant?.id} spec={spec as Spec} store={store} loading={streaming} onFind={onFind} onAnchor={onAnchor} />
          {searching ? <div className="pf-text pf-text--muted" style={{ marginTop: 8 }}>探索中…</div> : null}
        </div>
      ) : null}
    </main>
  );
}
