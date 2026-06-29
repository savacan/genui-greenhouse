"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec, StateStore } from "@json-render/core";
import { standardDirectives } from "@json-render/directives";
import { useMemo } from "react";
import { registry, Fallback } from "./registry";
import { sanitizeSpec } from "./sanitize";
import { AnchorContext } from "./anchorContext";
import type { ArtGridRow } from "./components/ArtGrid";

/** 表示整形だけ許す（$format/$template 等）。計算は禁止 → $math は外す（計算はサーバで値にする）。 */
const DISPLAY_DIRECTIVES = standardDirectives.filter((d) => d.name !== "$math");

/**
 * 01/02/03 から写経 ＋ exp04 の核。**controlled StateStore モード**（docs §12 = form 永続 live 再検索）:
 *  - store を外から渡す（JSONUIProvider が controlled 動作 = initialState/onStateChange は無視）。
 *    1つの store を mount したまま保つので、結果が来てもボードが remount されず form 選択が飛ばない。
 *  - handlers.find: 「探す」ActionButton の emit("click") → page が store を読んでサーバ計算 → store に値を書き戻し。
 *  - 入力部品は useBoundProp 経由でこの store に read/write（two-way の真実の源）。
 *  - onAnchor: §14 = 結果カードの「指差し」。AnchorContext で ArtGrid に流し、page が seed 再 compose を起こす。
 */
export function FinderRenderer({
  spec,
  store,
  loading,
  onFind,
  onAnchor,
}: {
  spec: Spec;
  store: StateStore;
  loading?: boolean;
  onFind?: () => void;
  onAnchor?: (art: ArtGridRow) => void;
}) {
  const safe = useMemo(() => sanitizeSpec(spec), [spec]);
  const handlers = useMemo(() => ({ find: () => onFind?.() }), [onFind]);
  if (!safe) return <div className="af-fallback">ビューを構築できませんでした。</div>;
  return (
    <AnchorContext.Provider value={onAnchor ?? null}>
      <JSONUIProvider registry={registry} store={store} directives={DISPLAY_DIRECTIVES} handlers={handlers}>
        <Renderer spec={safe} registry={registry} loading={loading} fallback={() => <Fallback />} />
      </JSONUIProvider>
    </AnchorContext.Provider>
  );
}
