> 実験01「宇宙コックピット」M1（生成ループ）の確定設計。
> 2026-06-23、独立3案（拡張性 / 可読性 / ライブラリ流儀+堅牢性）+ 判定統合の設計パスで決定。実装はこれに従う。
> 前提・確定事項は [`space-cockpit.md`](space-cockpit.md) / [`../CLAUDE.md`](../CLAUDE.md) 参照。

# M1 Architecture — Judgment & Synthesized Recommendation

## RECOMMENDATION (approve this, then build)

Build the **two-step orchestrator** (router → server fetch+compute → streaming compose), with the **`Action` registry** as the single source of truth, **prompt + post-hoc sanitize** for LLM output, **initialState delivered as a leading custom data part** (not a header), and **maplibre isolated behind one `next/dynamic({ssr:false})` inner-component split**. This is essentially **Proposal 3's spine** with **Proposal 2's readability/folder discipline** and **Proposal 1's `suits`/hint richness and explicit `pruneToCatalog`**.

---

## 1. Scorecard

| Proposal | Extensibility | Readability | Idiomatic-fit | Robustness | Locked-alignment | 
|---|---|---|---|---|---|
| **P1** (extensibility-first) | **5** — `ACTIONS` array *derives* the router union; add = 1 file + 1 entry, zero schema edits | 4 — clean, but `env.ts`/`http.ts`/`sanitize.ts` split is slightly more surface to hold | 4 — correct core/react split & `pipeJsonRender`; `data-initialState` part is the right call | **5** — 3-stage `autoFixSpec`→`pruneToCatalog`→`validateSpec`, soft-degrade per source | **5** — firewall explicit, server computes, $math forbidden |
| **P2** (readability-first) | 4 — clean registry, but router union hand-listed *and* `actionById` derived (two enumerations) | **5** — `lib/cockpit/` vs `lib/render/` boundary = import-safety boundary; reads top-to-bottom | 3 — **`x-cockpit-state` HTTP header for state is non-idiomatic & size-capped**; `onResponse` is a fragile seam | 3 — sanitize is `fallback`-only, defers real guard | 4 — firewall good, header delivery slightly muddies "data never via prose" cleanliness |
| **P3** (idiomatic+robust) | 4 — `actions` object + hand-listed discriminated union (two places, but colocated) | 4 — one-dir-per-layer rule is good; `IssMap`/`IssMapInner` split is the clearest maplibre answer | **5** — explicitly studies both shipped idioms, *correctly rejects* the tool-loop, leading data-part, `SPEC_DATA_PART` typing | **5** — defense-in-depth, dev-mode `catalog.validate` as measurement, streaming-sanitize caveats named | **5** — most rigorous on "why two-step honors the no-raw-data lock" |

**Primary winner: Proposal 3** (idiomatic + robust), narrowly over P1. P3 best understands the json-render/AI-SDK idioms and the *reason* the tool-loop is forbidden here; P1 wins purely on the `ACTIONS`-derives-the-union trick, which I graft in. P2's `lib/cockpit/` vs `lib/render/` split is the readability idea worth stealing; its header-based state delivery is the one thing to reject.

---

## 2. Resolved forks (with rationale)

**Fork A — two-step router vs single tool-loop → TWO-STEP.** Unanimous across proposals and correct. The shipped `chat` example uses `agent.stream` (a `ToolLoopAgent`) whose tool *results re-enter the model context* — that is exactly the raw NeoWs date-map landing in the prompt, violating the hard lock "raw data must NEVER go through the LLM." Two-step makes the firewall **structural, not disciplinary**: the server owns `initialState`; the compose LLM sees only `StateHint` (paths + meaning + counts). Cost (two round-trips, single-action-per-query) is accepted and named as the M2 line.

**Fork B — how localized is "add an action" → ONE new file + ONE array entry.** Take P1's derivation so the discriminated union is *not* a second enumeration. The single source of truth is `lib/actions/index.ts`'s `ACTIONS` array; the router schema, the router menu, and dispatch lookup all derive from it. (P2/P3 hand-list the union — rejected; that's the drift surface P1 eliminates.)

**Fork C — how strict on LLM output → PROMPT + POST-HOC SANITIZE (not constrained decoding).** Constrained decoding (`catalog.jsonSchema({strict})`) fights streaming, which is the whole UX, and Azure structured-output is uneven. So: `catalog.prompt()` + custom rules for steering, then P1's explicit 3-stage guard (`autoFixSpec` → `pruneToCatalog` against catalog keys → `validateSpec`) applied **on the settled spec**, plus a visible `fallback` chip for anything that slips through, plus P3's **dev-mode `catalog.validate()` logging to turn the prompt-drift assumption into data**. Sanitize on the assembled spec at a debounced/settled boundary, never reorder mid-stream (P3's caveat).

**Fork D — maplibre boundary → P3's two-file split.** `IssMap.tsx` (`"use client"`) is the registered component and is thin: it `next/dynamic(() => import("./IssMapInner"), { ssr:false })`. `IssMapInner.tsx` owns `new maplibregl.Map()` in `useEffect`. The `dynamic` call is the single, explicit SSR island; recharts needs only `"use client"` (no dynamic).

**Fork E (implicit) — initialState delivery → LEADING CUSTOM DATA PART, not a header.** Reject P2's `x-cockpit-state` header (size-capped ~tens of KB, non-idiomatic, `onResponse` fragility). Use P1/P3's `writer.write({ type: "data-initialState", data: state })` *before* merging the spec stream, so the client seeds `initialState` before the spec lands. Verified: `useJsonRenderMessage` consumes only `SPEC_DATA_PART` + text, so a custom data part rides alongside safely.

---

## 3. Final file tree (evolving the scaffold)

`=` keep · `~` edit · `+` new · `-` delete

```
experiments/01-space-cockpit/
  app/
~   page.tsx                         # "use client" cockpit shell: input + useChat + useJsonRenderMessage -> <CockpitRenderer>
=   layout.tsx
~   globals.css                      # + .sc-table / .sc-scatter / .sc-map / .sc-fallback (additive)
+   api/generate/route.ts            # the loop. core-only imports (@json-render/core), NEVER @json-render/react

  lib/
    cockpit/                         # "the brain": data + LLM. server route may import only from here + render/catalog
+     types.ts                       # Action<P,R,S> + StateHint + ActionContext  (THE central contract)
+     model.ts                       # createAzure(...) -> export model.  THE provider seam (env-driven)
+     fetchJson.ts                   # tiny fetch helper: timeout via AbortSignal, !ok -> typed ActionDataError
+     router.ts                      # step 1: NL -> {action, params} via generateText + Output.object (schema DERIVED from ACTIONS)
+     compose.ts                     # step 2: buildComposeSystem(hints, notes) — catalog.prompt() + $state hint block
+     actions/
+       index.ts                     # SINGLE SOURCE OF TRUTH: export const ACTIONS = [apod, neows, iss] as const
+       apod.ts                      # APOD action (handles video/no-hdurl)
+       neows.ts                     # NeoWs action (worked example below)
+       iss.ts                       # ISS action (open-notify soft-degrade)

    render/                          # "the look": client-only drawing. catalog.ts is the one core-safe file here
~     catalog.ts                     # + AsteroidTable, AsteroidScatter, IssMap entries (props mirror the action State shapes)
~     registry.tsx                   # "use client". + 3 impls (import heavy ones from components/), + Fallback export
+     renderer.tsx                   # "use client" <CockpitRenderer> = JSONUIProvider + Renderer + fallback
+     sanitize.ts                    # core-only. autoFixSpec -> pruneToCatalog -> validateSpec  (+ dev-mode catalog.validate log)
+     components/
+       AsteroidTable.tsx            # "use client" plain table
+       AsteroidScatter.tsx          # "use client" recharts ScatterChart
+       IssMap.tsx                   # "use client" thin: dynamic(IssMapInner, {ssr:false})
+       IssMapInner.tsx              # "use client" raw maplibre-gl in useEffect
-     demo-spec.ts                   # delete once page.tsx stops importing it (keep until M1 green)
```

**Boundary rule (P2):** `lib/cockpit/` = data/LLM (server-safe except none import react); `lib/render/` = drawing (client, except `catalog.ts` + `sanitize.ts` are core-only). The folder line *is* the import-safety line. The route imports `@json-render/core` + `lib/cockpit/*` + `lib/render/{catalog,sanitize}` only.

---

## 4. The Action contract + worked example

### `lib/cockpit/types.ts`

```ts
import type { z } from "zod";

export interface ActionContext {
  signal: AbortSignal;
  env: { nasaKey: string };
}

/** Paths + meaning + counts handed to the COMPOSE LLM. NEVER raw data / arrays. */
export interface StateHint {
  /** one-line scalar summary the LLM may read, e.g. "12 asteroids, 3 hazardous" */
  summary: string;
  paths: Array<{
    path: string;          // json-pointer, e.g. "/neows/rows"  -> {"$state":"/neows/rows"}
    type: string;          // shape only, e.g. "array<{name,diameterM,missLunar,...}>"
    note: string;          // meaning + units + which component it fits
    sample?: string;       // scalars ONLY: "len=12, closest='(2024 AB)' @ 3.1 LD"
  }>;
  /** soft nudge toward catalog components that fit this data */
  suggest?: string[];
  /** surfaced to the LLM verbatim, e.g. "crew list unavailable" / "no objects in window" */
  notes?: string[];
}

/**
 * One self-contained capability. Co-locates the 5 things that change together.
 *  P = validated params (router arm), R = raw payload, S = computed state slice.
 */
export interface Action<P = unknown, R = unknown, S extends Record<string, unknown> = Record<string, unknown>> {
  /** stable id = router discriminator = initialState namespace key */
  readonly id: string;
  /** one line the ROUTER reads to pick this action */
  readonly when: string;
  /** Zod params; becomes one arm of the derived router discriminated union. z.object({}) if none. */
  readonly params: z.ZodType<P>;
  /** I/O only. throws ActionDataError on hard failure; returns partial on soft failure. */
  fetch(params: P, ctx: ActionContext): Promise<R>;
  /** PURE. ALL math here: parseFloat, midpoints, ranking, KPI values. No I/O. */
  compute(raw: R, params: P): S;
  /** paths + summary + notes for the compose prompt. receives S so it can emit COUNTS, never arrays. */
  describe(state: S): StateHint;
}

export type AnyAction = Action<any, any, any>;
```

### `lib/cockpit/actions/neows.ts` (worked — the heaviest compute)

```ts
import { z } from "zod";
import type { Action, StateHint, ActionContext } from "../types";
import { fetchJson } from "../fetchJson";

const params = z.object({
  startDate: z.string().describe("YYYY-MM-DD"),
  endDate: z.string().describe("YYYY-MM-DD, <= 7 days after startDate"),
});
type Params = z.infer<typeof params>;

interface NeoWsRaw {
  near_earth_objects: Record<string, Array<{
    name: string;
    is_potentially_hazardous_asteroid: boolean;
    estimated_diameter: { meters: { estimated_diameter_min: number; estimated_diameter_max: number } };
    close_approach_data: Array<{
      close_approach_date: string;
      miss_distance: { lunar: string; kilometers: string };
      relative_velocity: { kilometers_per_hour: string };
    }>;
  }>>;
}

/** Computed row — these field names ARE the AsteroidTable/Scatter prop contract. */
export interface AsteroidRow {
  name: string; hazardous: boolean;
  diameterM: number;        // meters, midpoint of min/max — chosen convention
  missLunar: number; missKm: number; velocityKmh: number; date: string;
}
export interface NeowsState extends Record<string, unknown> {
  rows: AsteroidRow[];                                   // ranked closest-first
  scatter: Array<{ x: number; y: number; hazardous: boolean; name: string }>; // x=missLunar, y=diameterM
  hazardousCount: number;
  closest: { name: string; missLunar: number } | null;
  windowLabel: string;
  total: number;
}

export const neows: Action<Params, NeoWsRaw, NeowsState> = {
  id: "neows",
  when: "Near-earth asteroids / close approaches in a date window (<= 7 days): ranking, hazard flag, distance-vs-size scatter.",
  params,

  async fetch(p, ctx: ActionContext) {
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${p.startDate}&end_date=${p.endDate}&api_key=${ctx.env.nasaKey}`;
    return fetchJson<NeoWsRaw>(url, ctx.signal);
  },

  compute(raw, p) {
    const rows: AsteroidRow[] = [];
    for (const list of Object.values(raw.near_earth_objects ?? {})) {   // flatten the DATE-KEYED map
      for (const o of list) {
        const ca = [...(o.close_approach_data ?? [])]
          .sort((a, b) => parseFloat(a.miss_distance.lunar) - parseFloat(b.miss_distance.lunar))[0];
        if (!ca) continue;
        const d = o.estimated_diameter.meters;
        rows.push({
          name: o.name,
          hazardous: o.is_potentially_hazardous_asteroid,
          diameterM: Math.round((d.estimated_diameter_min + d.estimated_diameter_max) / 2),
          missLunar: parseFloat(ca.miss_distance.lunar),
          missKm: parseFloat(ca.miss_distance.kilometers),
          velocityKmh: Math.round(parseFloat(ca.relative_velocity.kilometers_per_hour)),
          date: ca.close_approach_date,
        });
      }
    }
    rows.sort((a, b) => a.missLunar - b.missLunar);                     // RANK on the server
    return {
      rows,
      scatter: rows.map((r) => ({ x: r.missLunar, y: r.diameterM, hazardous: r.hazardous, name: r.name })),
      hazardousCount: rows.filter((r) => r.hazardous).length,
      closest: rows[0] ? { name: rows[0].name, missLunar: rows[0].missLunar } : null,
      windowLabel: `${p.startDate} → ${p.endDate}`,
      total: rows.length,
    };
  },

  describe(s): StateHint {
    const paths = [
      { path: "/neows/rows", type: "array<{name,hazardous,diameterM(m),missLunar(LD),missKm,velocityKmh,date}>",
        note: "ranked closest-first; bind to AsteroidTable.rows", sample: `len=${s.total}${s.closest ? `, closest='${s.closest.name}' @ ${s.closest.missLunar} LD` : ""}` },
      { path: "/neows/scatter", type: "array<{x,y,hazardous,name}>", note: "x=miss distance (LD), y=diameter (m); bind to AsteroidScatter.points" },
      { path: "/neows/hazardousCount", type: "number", note: `potentially-hazardous count (${s.hazardousCount}); Kpi or Badge tone=danger when > 0` },
      { path: "/neows/windowLabel", type: "string", note: "date window for a Heading" },
    ];
    if (s.closest) {
      paths.push({ path: "/neows/closest/name", type: "string", note: "closest asteroid name (Kpi)" });
      paths.push({ path: "/neows/closest/missLunar", type: "number", note: "closest miss distance, unit LD (Kpi)" });
    }
    const notes: string[] = [];
    if (s.total === 0) notes.push("No objects in this window — render a Text empty-state, not a table.");
    if (s.hazardousCount > 0) notes.push(`${s.hazardousCount} hazardous — consider Card tone=danger.`);
    return { summary: `Near-earth asteroids ${s.windowLabel}: ${s.total} objects, ${s.hazardousCount} hazardous.`, paths, suggest: ["Heading", "Kpi", "Badge", "AsteroidTable", "AsteroidScatter"], notes };
  },
};
```

`apod.ts` / `iss.ts` follow the identical shape with smaller `compute`. APOD: `params = z.object({ date: z.string().nullable() })`, branch on `media_type` (video → `src=null`, note "render Text + video link"). ISS: `params = z.object({})`, crew fetched in its own try/catch (soft-degrade to `crew:[]` + note).

### `lib/cockpit/actions/index.ts` — single source of truth + derived router schema

```ts
import { z } from "zod";
import type { AnyAction } from "../types";
import { apod } from "./apod";
import { neows } from "./neows";
import { iss } from "./iss";

/** THE knob. Add an action = append here. Everything else derives from this. */
export const ACTIONS = [apod, neows, iss] as const satisfies readonly AnyAction[];

export const actionById = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<string, AnyAction>;

/** Router union DERIVED from ACTIONS — never a second enumeration to keep in sync. */
const arms = ACTIONS.map((a) => z.object({ action: z.literal(a.id), params: a.params })) as
  [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];
export const routerSchema = z.discriminatedUnion("action", arms);
export type Routed = z.infer<typeof routerSchema>;

export const actionMenu = ACTIONS.map((a) => `- ${a.id}: ${a.when}`).join("\n");
```

---

## 5. /api route skeleton + client wiring

### `app/api/generate/route.ts` (core-only)

```ts
import { generateText, streamText, Output, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { pipeJsonRender } from "@json-render/core";
import { model } from "@/lib/cockpit/model";
import { ACTIONS, actionById, routerSchema, actionMenu } from "@/lib/cockpit/actions";
import { catalog } from "@/lib/render/catalog";
import { buildComposeSystem } from "@/lib/cockpit/compose";
import { sanitizeStream } from "@/lib/render/sanitize";

export const maxDuration = 60;
const COMPOSE_SYSTEM_BASE = catalog.prompt(); // text patch-mode prompt (the json-render grammar)

export async function POST(req: Request) {
  const { query } = await req.json();
  if (!query?.trim()) return Response.json({ error: "query required" }, { status: 400 });

  const ctx = { signal: req.signal, env: { nasaKey: process.env.NASA_API_KEY! } };
  const today = new Date().toISOString().slice(0, 10);

  // STEP 1: route (cold, constrained)
  const { experimental_output: routed } = await generateText({
    model, temperature: 0, prompt: query, abortSignal: req.signal,
    system: `Route the user's space question to ONE action and fill its params. Today is ${today}; default neows to a 3-day window ending today.\n\nACTIONS:\n${actionMenu}`,
    experimental_output: Output.object({ schema: routerSchema }),
  });

  const action = actionById[routed.action];
  if (!action) return Response.json({ error: `unknown action ${routed.action}` }, { status: 422 });

  // STEP 1.5: fetch + compute on the SERVER (raw data never leaves here)
  let state: Record<string, unknown>, hint;
  try {
    const slice = action.compute(await action.fetch(routed.params as never, ctx), routed.params as never);
    state = { [action.id]: slice };
    hint = action.describe(slice as never);
  } catch (e) {
    state = { [action.id]: { error: String(e) } };
    hint = { summary: `Could not load ${action.id} data.`, paths: [], notes: [`fetch failed: ${String(e)}`] };
  }

  // STEP 2: compose (warm, streaming). LLM sees ONLY catalog grammar + hint — never raw data.
  const result = streamText({
    model, temperature: 0.5, abortSignal: req.signal,
    system: COMPOSE_SYSTEM_BASE,
    prompt: buildComposeSystem(query, hint),
  });

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "data-initialState", data: state });           // SEED first, before spec
      writer.merge(sanitizeStream(pipeJsonRender(result.toUIMessageStream()), catalog));
    },
  });
  return createUIMessageStreamResponse({ stream });
}
```

> `sanitizeStream` may be a thin passthrough for M1 if per-patch interception is awkward — in that case the real guard is `sanitizeSpec(spec)` run client-side in `useMemo` before `<Renderer>` (Fork C). Pick whichever lands first; the `fallback` chip is the always-on backstop. Don't over-engineer the streaming sanitizer on day one.

### `lib/cockpit/compose.ts`

```ts
import type { StateHint } from "./types";

/** paths + summary + notes ONLY — the data->prompt firewall. */
export function buildComposeSystem(query: string, hint: StateHint): string {
  const paths = hint.paths.map((p) => `  ${p.path} : ${p.type} — ${p.note}${p.sample ? ` (${p.sample})` : ""}`).join("\n");
  return [
    `User asked: "${query}"`,
    `Data is ALREADY fetched & computed into state. ${hint.summary}`,
    `Bind components ONLY to these EXACT $state paths via {"$state":"/path"}. Do not invent paths or inline values:`,
    paths || "  (no data available)",
    hint.suggest?.length ? `Good components here: ${hint.suggest.join(", ")}.` : "",
    hint.notes?.length ? `NOTES:\n${hint.notes.map((n) => "  - " + n).join("\n")}` : "",
    `RULES: use only catalog components; do NOT compute (values are final, $format only for display); answer the question with a clear arrangement.`,
  ].filter(Boolean).join("\n\n");
}
```

### `app/page.tsx` (client)

```tsx
"use client";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useJsonRenderMessage } from "@json-render/react";
import { CockpitRenderer } from "@/lib/render/renderer";

const transport = new DefaultChatTransport({
  api: "/api/generate",
  // route reads {query}; send the last user text as query
  prepareSendMessagesRequest: ({ messages }) => ({
    body: { query: messages.at(-1)?.parts.find((p) => p.type === "text")?.text ?? "" },
  }),
});

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({ transport });
  const streaming = status === "streaming" || status === "submitted";
  const last = messages.at(-1);
  const { spec } = useJsonRenderMessage(last?.role === "assistant" ? last.parts : []);
  const initialState =
    (last?.parts.find((p) => p.type === "data-initialState") as { data?: Record<string, unknown> } | undefined)?.data ?? {};

  return (
    <main className="sc-shell">
      <header className="sc-topbar"><span className="sc-logo">◍ SPACE COCKPIT</span><span className="sc-sub">実験01 · M1 生成ループ</span></header>
      <form className="sc-ask" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !streaming) { sendMessage({ text: input }); setInput(""); } }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="今週地球に近づく小惑星は？ / 今日のAPOD / ISSはどこ？" />
        <button disabled={streaming}>{streaming ? "…" : "Ask"}</button>
      </form>
      <div className="sc-stage">{spec && <CockpitRenderer spec={spec} initialState={initialState} loading={streaming} />}</div>
    </main>
  );
}
```

### `lib/render/renderer.tsx` (client)

```tsx
"use client";
import { JSONUIProvider, Renderer, type Spec, type ComponentRenderer } from "@json-render/react";
import { useMemo } from "react";
import { registry, Fallback } from "./registry";
import { sanitizeSpec } from "./sanitize";

const fallback: ComponentRenderer = ({ element }) => <Fallback type={element.type} />;

export function CockpitRenderer({ spec, initialState, loading }:
  { spec: Spec; initialState: Record<string, unknown>; loading?: boolean }) {
  const safe = useMemo(() => sanitizeSpec(spec), [spec]);   // client-side guard (Fork C backstop)
  if (!safe) return <div className="sc-fallback">ビューを構築できませんでした。</div>;
  return (
    <JSONUIProvider registry={registry} initialState={initialState}>
      <Renderer spec={safe} registry={registry} fallback={fallback} loading={loading} />
    </JSONUIProvider>
  );
}
```

---

## 6. Server → LLM → render contract (one sentence + shapes)

**`describe(state)` enumerates `$state` paths + a scalar-only summary; the server seeds `initialState` (namespaced by action id) as a leading `data-initialState` part; the LLM only picks catalog components and wires `{"$state":"/path"}`.** The only thing crossing data→prompt is counts/labels `describe()` deliberately surfaces.

```jsonc
// initialState (browser, via data-initialState part — NEVER a prompt token)
{ "neows": { "rows": [{ "name":"(2024 AB)","hazardous":true,"diameterM":312,"missLunar":3.81,"missKm":1463221,"velocityKmh":41233,"date":"2026-06-24" }],
             "scatter": [{ "x":3.81,"y":312,"hazardous":true,"name":"(2024 AB)" }],
             "hazardousCount":2,"closest":{"name":"(2024 AB)","missLunar":3.81},"windowLabel":"2026-06-21 → 2026-06-24","total":12 } }
```

The compose LLM sees only: `catalog.prompt()` grammar + the `buildComposeSystem` block (paths/types/notes/counts). **Raw NASA/ISS payloads never enter `initialState` and never enter any LLM call.**

---

## 7. "Add a new action" checklist (e.g. Mars rover photos)

1. **`lib/cockpit/actions/mars.ts`** — implement `Action<P,R,S>`: `params` (Zod), `fetch`, pure `compute` → `MarsState`, `describe()` exposing `/mars/photos` (suggest `HeroImage` or a new gallery). Copy `neows.ts` as the template. *(the whole capability)*
2. **`lib/cockpit/actions/index.ts`** — add `mars` to the `ACTIONS` array. **This one edit wires the router union arm, the router menu, dispatch lookup, and initialState namespacing — they cannot drift** (all derived).
3. *(only if no existing component fits)* add a catalog entry in `render/catalog.ts` + impl in `render/registry.tsx` (+ a file under `render/components/` if it pulls a library). If `HeroImage`/`Stack`/`Card` suffice, **skip entirely**.

Untouched: `route.ts`, `router.ts`, `compose.ts`, `renderer.tsx`, `page.tsx`, `sanitize.ts`, `model.ts`. The orchestrator is action-agnostic; `ACTIONS` is the only knob.

---

## 8. Component & registry plan

- **`catalog.ts` stays one file** — it's the LLM's vocabulary, read top-to-bottom. Add `AsteroidTable` / `AsteroidScatter` / `IssMap` next to `HeroImage`. Their `props` Zod **mirrors the action `State` shapes** (e.g. `AsteroidScatter.props.points = z.array(z.object({ x:z.number(), y:z.number(), hazardous:z.boolean(), name:z.string() }))`); the binding contract lives in the `description`. The recharts axis mapping (x=missLunar, y=diameterM, color by hazardous) is **hardcoded in the impl, not LLM-chosen** — robustness over flexibility.
- **`registry.tsx` stays one `defineRegistry` call**, inline for the small existing components (Stack/Card/…/HeroImage), and **imports the three heavy ones from `render/components/`**. Rule: inline if <~20 lines & dependency-free; own file if it pulls a library. Also export a `Fallback` component (the `fallback` renderer uses it).
- **maplibre island:** `components/IssMap.tsx` is thin — `dynamic(() => import("./IssMapInner"), { ssr:false, loading: () => <div className="sc-map sc-map--loading" /> })`. `IssMapInner.tsx` holds `new maplibregl.Map()` in `useEffect`. Single explicit SSR boundary. recharts: just `"use client"`, SSR-tolerant under React 19, no dynamic.

---

## 9. Edge handling

| Case | Where | Behavior |
|---|---|---|
| APOD video (no `hdurl`) | `apod.compute` | `media_type==="video"` → `src:null`, `videoUrl` set; `describe` note "render Text + link, not HeroImage". |
| `copyright` absent | `apod.compute` | `credit = raw.copyright ?? "Public domain"`. |
| open-notify crew down | `iss.fetch` | crew in own try/catch + short timeout; on fail `crew:[]` + note. Position (wheretheiss.at) stays outside; map+KPIs still render. |
| Empty NeoWs window | `neows.compute` + `describe` | `rows:[]`, `closest:null`; note "render Text empty-state". LLM composes a message, not an empty table. |
| Hard fetch failure | `route.ts` catch | `state={[id]:{error}}` + error hint → LLM renders an error Card; no crash, no half-UI. |
| LLM emits out-of-catalog / bad spec | `sanitize.ts` + `fallback` | `autoFixSpec` (structural) → `pruneToCatalog` (drop unknown types, re-parent children, Zod-parse props) → `validateSpec`; survivors render, residue → `Fallback` chip. Dev-mode `catalog.validate()` logs drift frequency. |
| LLM binds non-existent `$state` path | json-render | resolves `undefined`; components render empty-state. No crash. |
| Router can't fit / bad params | `route.ts` | `Output.object` Zod failure → 422 prose; **no compose call** (don't burn the 2nd LLM call). |

---

## 10. BUILD & VERIFY ORDER (de-risk the data layer WITHOUT the LLM first)

**Phase A — data/compute, zero LLM (highest de-risk, fully unit-testable).**
1. `lib/cockpit/types.ts`, `fetchJson.ts`.
2. `actions/{apod,neows,iss}.ts` + `actions/index.ts`.
3. **Verify with a throwaway script** (`scratchpad/probe.ts` run via `tsx`/`node`): for each action, call `fetch`+`compute`+`describe` against the **real APIs** (creds are in `.env.local`) and print `JSON.stringify(state)` + the `StateHint`. Confirm: NeoWs date-map flattened & ranked, lunar/km parsed to numbers, diameter midpoint sane, APOD video branch, ISS crew soft-degrade when open-notify is down, empty-window note. **No LLM, no browser, no Next** — this proves the hardest logic in isolation.

**Phase B — render layer against a HAND-WRITTEN spec (no LLM).**
4. `render/catalog.ts` + `registry.tsx` + `components/*` + `renderer.tsx` + `sanitize.ts`.
5. **Verify by feeding a hand-written spec** (extend the existing `demo-spec.ts` pattern) bound to a Phase-A `state` dump into `<CockpitRenderer>`. Confirm AsteroidTable/Scatter/IssMap render, `$state` binding resolves, maplibre island mounts, `Fallback` shows for a deliberately-bad element. **Still no LLM** — proves catalog/registry/binding/sanitize.

**Phase C — wire the loop with Azure.**
6. `model.ts`, `compose.ts`, `router.ts`, `api/generate/route.ts`, `page.tsx`.
7. **Verify the router alone first**: log `routed` for "今週の小惑星" / "今日のAPOD" / "ISSは今どこ" → confirm correct action+params (temp 0). Then **verify compose**: confirm the prompt contains paths but **grep the outgoing prompt to prove no raw arrays leak**. Then end-to-end in the browser: progressive render, prose+spec split, `data-initialState` seeds before spec.
8. Delete `demo-spec.ts`.

The split is deliberate: **Phases A and B need no Azure and no network-flaky LLM**, so ~70% of the surface (all the hard compute + all the rendering) is green before the first model call. The LLM seam is the last, smallest, most-observable step.

---

### Honest residual risks (carried from the proposals, accepted)
- **Single-action-per-query** — compound queries ("APOD *and* asteroids") hit a wall; the `ACTIONS` array + union already generalize to `z.array(...)` for M2.
- **`State`-shape ↔ catalog-props is unenforced** (dynamic `$state` binding; TS can't verify). Rule: change `compute` return and catalog props in the **same edit**; revisit a shared row type only at the CLAUDE.md "3rd repetition." No codegen now (premature infra).
- **Two round-trips of latency** before pixels; show a "routing → fetching → composing" affordance. Compose streams, so perceived latency ≈ router + slowest fetch.
- **"Valid but ugly" specs** — sanitize catches invalid, not semantically-wrong-but-valid bindings. That *is* the 使い心地 the experiment exists to observe; left visible, not clamped.
