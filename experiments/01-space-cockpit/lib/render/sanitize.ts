import type { Spec } from "@json-render/core";
import { catalog } from "./catalog";

const KNOWN = new Set(catalog.componentNames);

/**
 * Post-hoc guard on a settled spec: drop elements whose `type` isn't in the catalog,
 * scrub dangling child refs, and (dev only) log how much drifted — turning the assumption
 * that prompt-constraints are probabilistic into a measurable number.
 * The Renderer `fallback` is the always-on backstop for anything that slips through.
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
  if (!(spec.root in elements)) return null; // root itself was invalid
  return { ...spec, elements: elements as Spec["elements"] };
}
