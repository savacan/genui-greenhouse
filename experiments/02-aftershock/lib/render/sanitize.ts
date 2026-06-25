import type { Spec } from "@json-render/core";
import { catalog } from "./catalog";

const KNOWN = new Set(catalog.componentNames);

/**
 * Post-hoc guard on a settled spec（01 から写経・無改造）: drop elements whose `type`
 * isn't in the catalog, scrub dangling child refs, dev-log how much drifted.
 * Renderer の fallback が常時バックストップ。
 */
export function sanitizeSpec(spec: Spec | null): Spec | null {
  if (!spec || !spec.root || !spec.elements) return spec ?? null;

  const elements: Record<string, unknown> = {};
  let dropped = 0;
  for (const [id, el] of Object.entries(spec.elements as Record<string, { type: string }>)) {
    if (KNOWN.has(el.type)) elements[id] = el;
    else dropped++;
  }
  for (const el of Object.values(elements) as Array<{ children?: string[] }>) {
    if (Array.isArray(el.children)) el.children = el.children.filter((c) => c in elements);
  }
  if (dropped && process.env.NODE_ENV !== "production") {
    console.warn(`[sanitize] dropped ${dropped} out-of-catalog element(s)`);
  }
  if (!(spec.root in elements)) return null;
  return { ...spec, elements: elements as Spec["elements"] };
}
