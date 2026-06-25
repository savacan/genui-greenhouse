"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { standardDirectives } from "@json-render/directives";
import { useMemo } from "react";
import { registry, Fallback } from "./registry";
import { sanitizeSpec } from "./sanitize";

/** 表示整形だけ許す（$format/$template 等）。計算は禁止 → $math は外す（計算はサーバで値にする）。 */
const DISPLAY_DIRECTIVES = standardDirectives.filter((d) => d.name !== "$math");

/**
 * 01/02 から写経 ＋ exp03 の核を2点追加:
 *  - onStateChange: フォームのトグルで動く現在 state を page 側 ref に拾わせる（「探す」送信用）。
 *  - handlers.find: 「探す」ActionButton の emit("click") → find → page の検索送信へ。
 * initialState には spec.state（LLM が埋めた初期選択）がマージされる。
 */
export function FinderRenderer({
  spec,
  initialState,
  loading,
  onFind,
  onStateChange,
}: {
  spec: Spec;
  initialState: Record<string, unknown>;
  loading?: boolean;
  onFind?: () => void;
  onStateChange?: (changes: Array<{ path: string; value: unknown }>) => void;
}) {
  const safe = useMemo(() => sanitizeSpec(spec), [spec]);
  const handlers = useMemo(
    () => ({
      find: () => onFind?.(),
    }),
    [onFind],
  );
  if (!safe) return <div className="pf-fallback">ビューを構築できませんでした。</div>;
  return (
    <JSONUIProvider
      registry={registry}
      initialState={initialState}
      directives={DISPLAY_DIRECTIVES}
      handlers={handlers}
      onStateChange={onStateChange}
    >
      <Renderer spec={safe} registry={registry} loading={loading} fallback={() => <Fallback />} />
    </JSONUIProvider>
  );
}
