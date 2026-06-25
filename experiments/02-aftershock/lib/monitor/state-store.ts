import type { StateHint } from "./types";
import type { ComposePart } from "./compose";

/**
 * 1リクエスト（= 1回の multi-step loop）の中で、各 tool が生んだ生 slice と hint を溜める箱。
 *  - tool.execute が put() で書く（生 slice は $state へ、hint は compose へ）。
 *  - loop 収束後に snapshot() を initialState に1発 flush（StateProvider が initialState 更新を
 *    無視する罠への対処 = client は応答ごとに remount するので、flush は spec より先に1回でよい）。
 * モデル文脈には何も渡さない（それは tools.ts の toModelOutput の責務）。
 */
export class StateStore {
  private slices = new Map<string, Record<string, unknown>>();
  private hints = new Map<string, StateHint>();
  private steps: Array<{ tool: string; status: "pending" | "done" | "error"; note?: string }> = [];

  /** 生 slice と hint を id 名前空間に格納。$state パスは /id/... になる。ref = id を返す。 */
  put(id: string, slice: Record<string, unknown>, hint: StateHint): string {
    // 同 id を別引数で複数回呼んだ場合は後勝ち（Phase 1 で per-callId 名前空間化を検討）。
    this.slices.set(id, slice);
    this.hints.set(id, hint);
    return id;
  }

  has(id: string): boolean {
    return this.slices.has(id);
  }
  getSlice(id: string): Record<string, unknown> | undefined {
    return this.slices.get(id);
  }

  /** loop 収束後に initialState へ flush するオブジェクト（$state のルート）。 */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.slices);
  }

  /** 最終 compose に渡す hint 群（生配列ゼロ）。 */
  composeParts(): ComposePart[] {
    return [...this.hints].map(([id, hint]) => ({ id, hint }));
  }

  // --- per-step progress（Phase C のステッパ用） ---
  markStep(tool: string, status: "pending" | "done" | "error", note?: string): void {
    this.steps.push({ tool, status, note });
  }
  stepLog(): Array<{ tool: string; status: "pending" | "done" | "error"; note?: string }> {
    return this.steps.map((s) => ({ ...s }));
  }
}
