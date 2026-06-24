"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { standardDirectives } from "@json-render/directives";
import { useMemo } from "react";
import { registry, Fallback } from "./registry";
import { sanitizeSpec } from "./sanitize";

/**
 * 表示整形だけ spec 側に許す（$format/$concat/$join/$count/$truncate/$pluralize）。
 * 計算は禁止 → $math は外す（CLAUDE.md: 計算はサーバで値にする）。
 */
const DISPLAY_DIRECTIVES = standardDirectives.filter((d) => d.name !== "$math");

/** The single client renderer: seed initialState, sanitize the spec, draw with a fallback. */
export function CockpitRenderer({
  spec,
  initialState,
  loading,
  onAsk,
}: {
  spec: Spec;
  initialState: Record<string, unknown>;
  loading?: boolean;
  /** spec 内 ActionButton の on.click(action:"ask") から呼ばれる = 別の問いを投げ直す。 */
  onAsk?: (query: string) => void;
}) {
  const safe = useMemo(() => sanitizeSpec(spec), [spec]);
  // "ask" ハンドラはここで provider に渡す（registry.actions は JSONUIProvider では参照されない）。
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
