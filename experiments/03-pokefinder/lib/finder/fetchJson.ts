import { ActionDataError } from "./types";

/**
 * Minimal JSON GET with caller-supplied abort signal. Throws ActionDataError on non-2xx.
 * 5xx / network はリトライ。abort は即時中断。01/02 から写経（PokéAPI は鍵不要なので header 最小）。
 */
export async function fetchJson<T>(url: string, signal: AbortSignal, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal, headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw new ActionDataError(`HTTP ${res.status} ${res.statusText} (${url.split("?")[0]})`);
    } catch (e) {
      if (signal.aborted || e instanceof ActionDataError || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

/**
 * 並列度を絞って items を非同期マップする（PokéAPI の pokemon/<n> N+1 を fair-use 内に抑える）。
 * 積集合は小さくなる想定だが、単一の広いタイプ等で候補が膨らんでも詰まらないように。
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
