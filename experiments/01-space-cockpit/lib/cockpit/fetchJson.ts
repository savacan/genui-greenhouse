import { ActionDataError } from "./types";

/**
 * Minimal JSON GET with caller-supplied abort signal. Throws ActionDataError on non-2xx.
 * 5xx / network はリトライ（NASA APOD は時々 503 を返すため）。abort は即時中断。
 */
export async function fetchJson<T>(url: string, signal: AbortSignal, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal, headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      // 5xx は一過性とみなしリトライ。4xx は即失敗。
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
