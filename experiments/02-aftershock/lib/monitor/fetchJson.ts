import { ActionDataError } from "./types";

export interface FetchJsonOpts {
  retries?: number;
  /** extra request headers（例: Wikipedia REST の User-Agent）。 */
  headers?: Record<string, string>;
}

/**
 * Minimal JSON GET with caller-supplied abort signal. Throws ActionDataError on non-2xx。
 * 01 から写経 + headers オプション追加（Wikipedia UA 用）。
 *   - res.ok を**先に**見るので、USGS の 404 が plain-text 本文でも json パースに踏み込まず安全に degrade。
 *   - 5xx / network はリトライ（USGS/NASA は時々 5xx）。abort は即時中断、4xx は即失敗。
 */
export async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
  opts: FetchJsonOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 1;
  const headers = { accept: "application/json", ...(opts.headers ?? {}) };
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal, headers });
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
