"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { standardDirectives } from "@json-render/directives";
import { useMemo } from "react";
import { registry, Fallback } from "./registry";
import { sanitizeSpec } from "./sanitize";

/** 表示整形だけ許す（$format 等）。計算は禁止 → $math は外す（CLAUDE.md: 計算はサーバで値にする）。 */
const DISPLAY_DIRECTIVES = standardDirectives.filter((d) => d.name !== "$math");

/** 01 から写経。seed initialState → sanitize → draw with fallback。"ask" ハンドラは provider に渡す。 */
export function MonitorRenderer({
  spec,
  initialState,
  loading,
  onAsk,
}: {
  spec: Spec;
  initialState: Record<string, unknown>;
  loading?: boolean;
  onAsk?: (query: string) => void;
}) {
  const safe = useMemo(() => sanitizeSpec(spec), [spec]);
  const handlers = useMemo(
    () => ({
      ask: (params: Record<string, unknown>) => {
        const q = typeof params?.query === "string" ? params.query.trim() : "";
        if (q) onAsk?.(q);
      },
    }),
    [onAsk],
  );
  if (!safe) return <div className="sc-fallback">ビューを構築できませんでした。</div>;
  return (
    <JSONUIProvider
      registry={registry}
      initialState={initialState}
      directives={DISPLAY_DIRECTIVES}
      handlers={handlers}
    >
      <Renderer spec={safe} registry={registry} loading={loading} fallback={() => <Fallback />} />
    </JSONUIProvider>
  );
}
