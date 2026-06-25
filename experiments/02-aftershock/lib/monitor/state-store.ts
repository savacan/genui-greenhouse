import type { StateHint } from "./types";
import type { ComposePart } from "./compose";

/**
 * describe が吐く固定パス `/id/...` に instance セグメントを注入 → `/id/<instanceKey>/...`。
 * describe は自分の instance を知らない（slice しか受け取らない）ので、名前空間化は store の責務。
 */
function qualifyHint(hint: StateHint, id: string, instanceKey: string): StateHint {
  const prefix = `/${id}/`;
  const inject = `/${id}/${instanceKey}/`;
  return {
    ...hint,
    paths: hint.paths.map((p) =>
      p.path.startsWith(prefix) ? { ...p, path: inject + p.path.slice(prefix.length) } : p,
    ),
  };
}

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

  /**
   * 生 slice と hint を格納。key = instanceKey があれば `${id}/${instanceKey}`、無ければ `id`。
   * $state パスは `/id[/instanceKey]/...`。ref（= 完全修飾 key）を返す。
   * §8 (b): instanceKey 付き（quakeDetail=eventId / weather・nearby=丸め座標）なら同 tool の複数呼び出しが
   * 別スロットに並存（無印は従来通り tool-id 単一スロット＝後勝ち）。
   */
  put(id: string, slice: Record<string, unknown>, hint: StateHint, instanceKey?: string): string {
    const key = instanceKey ? `${id}/${instanceKey}` : id;
    // hint のパスは describe が `/id/...` を吐くので、instanceKey 付きなら `/id/<key>/...` に書き換える
    // （describe は自分の instance を知らない＝store が注入する。これで compose が正しいスロットにバインドできる）。
    this.slices.set(key, slice);
    this.hints.set(key, instanceKey ? qualifyHint(hint, id, instanceKey) : hint);
    return key;
  }

  has(key: string): boolean {
    return this.slices.has(key);
  }
  getSlice(key: string): Record<string, unknown> | undefined {
    return this.slices.get(key);
  }

  /**
   * loop 収束後に initialState へ flush する $state のルート。
   * key を `/` で分割してネストさせる（`quakeDetail/us6000t7zp` → `{quakeDetail:{us6000t7zp:slice}}`）
   * → json-pointer `/quakeDetail/us6000t7zp/...` が解決できる。
   */
  snapshot(): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (const [key, slice] of this.slices) {
      const parts = key.split("/");
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]] = slice;
    }
    return root;
  }

  /** 最終 compose に渡す hint 群（生配列ゼロ）。 */
  composeParts(): ComposePart[] {
    return [...this.hints].map(([id, hint]) => ({ id, hint }));
  }

  // --- per-step progress（Phase C のステッパ用） ---
  markStep(tool: string, status: "pending" | "done" | "error", note?: string): void {
    // 同 tool の既存行を upsert（pending→done/error）。無ければ追加。
    const existing = this.steps.find((s) => s.tool === tool);
    if (existing) {
      existing.status = status;
      if (note) existing.note = note;
    } else {
      this.steps.push({ tool, status, note });
    }
  }
  stepLog(): Array<{ tool: string; status: "pending" | "done" | "error"; note?: string }> {
    return this.steps.map((s) => ({ ...s }));
  }
}
