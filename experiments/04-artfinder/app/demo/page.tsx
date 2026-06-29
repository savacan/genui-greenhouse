"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStateStore, type Spec } from "@json-render/core";
import { FinderRenderer } from "@/lib/render/renderer";
import type { ArtGridRow } from "@/lib/render/components/ArtGrid";
import { toFindParams, hasAnyFilter, type Shelf } from "@/lib/finder/shelf";

/**
 * Phase B（LLM 抜き）: 手書き spec で two-way 入力部品＋controlled store の live 再検索を実機検証する。
 * これが exp04 の心臓（§9/§12）= フォームを残したまま「探す」で結果が in-place 更新され、選択が飛ばないこと。
 * /demo で開く。
 */

const bind = (p: string) => ({ $bindState: p });

// 手書きの「フィルタベンチ＋結果」spec（LLM が Phase C で組むのと同じ構造を人手で）。
const HAND_SPEC: Spec = {
  root: "root",
  state: { shelf: { type: { painting: true }, hue: 215 }, findArt: { artworks: [], count: 0, matchedCount: 0, criteriaLabel: "", note: "" } },
  elements: {
    root: { type: "Stack", props: { gap: "lg" }, children: ["typeCard", "deptCard", "yearCard", "colorCard", "qCard", "opts", "go", "results"] },

    typeCard: { type: "Card", props: { title: "種別" }, children: ["typeRow"] },
    typeRow: { type: "Stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["t_painting", "t_sculpture", "t_print"] },
    t_painting: { type: "FacetCheckbox", props: { label: "絵画", checked: bind("/shelf/type/painting") } },
    t_sculpture: { type: "FacetCheckbox", props: { label: "彫刻", checked: bind("/shelf/type/sculpture") } },
    t_print: { type: "FacetCheckbox", props: { label: "版画", checked: bind("/shelf/type/print") } },

    deptCard: { type: "Card", props: { title: "部門" }, children: ["deptRow"] },
    deptRow: { type: "Stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["d_europe", "d_asia"] },
    d_europe: { type: "FacetCheckbox", props: { label: "ヨーロッパ絵画・彫刻", checked: bind("/shelf/department/europe") } },
    d_asia: { type: "FacetCheckbox", props: { label: "アジアの美術", checked: bind("/shelf/department/asia") } },

    yearCard: { type: "Card", props: { title: "制作年" }, children: ["yr"] },
    yr: { type: "RangeSelect", props: { label: "制作年（西暦）", from: bind("/shelf/yearFrom"), to: bind("/shelf/yearTo"), min: -3000, max: 2025 } },

    colorCard: { type: "Card", props: { title: "色" }, children: ["colorRow"] },
    colorRow: { type: "Stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["c_red", "c_yellow", "c_green", "c_blue", "c_purple"] },
    c_red: { type: "ColorSwatch", props: { label: "赤", hue: 0, swatch: "#d12b2b", value: bind("/shelf/hue") } },
    c_yellow: { type: "ColorSwatch", props: { label: "黄", hue: 52, swatch: "#e8c63a", value: bind("/shelf/hue") } },
    c_green: { type: "ColorSwatch", props: { label: "緑", hue: 120, swatch: "#3fa15a", value: bind("/shelf/hue") } },
    c_blue: { type: "ColorSwatch", props: { label: "青", hue: 215, swatch: "#2b6fd1", value: bind("/shelf/hue") } },
    c_purple: { type: "ColorSwatch", props: { label: "紫", hue: 280, swatch: "#7d4bd1", value: bind("/shelf/hue") } },

    qCard: { type: "Card", props: { title: "検索語（作者・主題 / 英語）" }, children: ["q"] },
    q: { type: "TextInput", props: { label: "作者名・キーワード", placeholder: "例: Monet", value: bind("/shelf/q") } },

    opts: { type: "Stack", props: { direction: "horizontal", wrap: true, gap: "md" }, children: ["onview", "sort"] },
    onview: { type: "Toggle", props: { label: "展示中のみ", checked: bind("/shelf/onView") } },
    sort: {
      type: "Select",
      props: {
        label: "並べ替え",
        value: bind("/shelf/sortBy"),
        options: [
          { value: "relevance", label: "関連度" },
          { value: "newest", label: "新しい順" },
          { value: "oldest", label: "古い順" },
        ],
      },
    },

    go: { type: "ActionButton", props: { label: "この条件で探す", tone: "primary" }, on: { click: { action: "find" } } },

    results: { type: "Card", props: { title: "結果" }, children: ["kpis", "crit", "note", "grid"] },
    kpis: { type: "Stack", props: { direction: "horizontal", gap: "lg" }, children: ["kCount", "kMatched"] },
    kCount: { type: "Kpi", props: { label: "該当", value: bind("/findArt/count") } },
    kMatched: { type: "Kpi", props: { label: "候補", value: bind("/findArt/matchedCount"), unit: "件" } },
    crit: { type: "Text", props: { muted: true, text: { $template: "条件: ${/findArt/criteriaLabel}" } } },
    note: { type: "Text", props: { muted: true, text: bind("/findArt/note") } },
    grid: { type: "ArtGrid", props: { artworks: bind("/findArt/artworks") } },
  },
} as unknown as Spec;

export default function DemoPage() {
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const store = useMemo(() => createStateStore({}), []);
  const searchingRef = useRef(false);
  searchingRef.current = searching;

  // controlled store は spec.state を自動 seed しないので手動で（page.tsx と同じ）。
  useEffect(() => {
    store.set("/shelf", structuredClone((HAND_SPEC.state as { shelf: unknown }).shelf));
    store.set("/findArt", structuredClone((HAND_SPEC.state as { findArt: unknown }).findArt));
  }, [store]);

  const onFind = useCallback(async () => {
    if (searchingRef.current) return;
    const shelf = (store.getSnapshot() as { shelf?: Shelf }).shelf;
    const params = toFindParams(shelf);
    if (!hasAnyFilter(params)) {
      setErr("種別・部門・年代・色・検索語のいずれかを指定してください。");
      return;
    }
    setErr(null);
    setSearching(true);
    try {
      const res = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      store.set("/findArt", {
        artworks: data.artworks,
        count: data.count,
        matchedCount: data.matchedCount,
        criteriaLabel: data.criteriaLabel,
        note: data.note ?? "",
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setSearching(false);
    }
  }, [store]);

  const onAnchor = useCallback((art: ArtGridRow) => {
    // demo では再 compose しない（LLM 抜き）。クリックで検索語に作者を入れて即再検索する簡易版。
    store.set("/shelf/q", art.artist && art.artist !== "作者不詳" ? art.artist : "");
    void onFind();
  }, [store, onFind]);

  return (
    <main className="af-shell">
      <header className="af-topbar">
        <span className="af-logo">▣ Artfinder</span>
        <span className="af-sub">実験04 · Phase B デモ（LLM 抜き・手書き spec で two-way ＋ live 再検索）</span>
      </header>
      {err && <div className="af-fallback">エラー: {err}</div>}
      <div className={searching ? "af-searching" : undefined}>
        <FinderRenderer spec={HAND_SPEC} store={store} onFind={onFind} onAnchor={onAnchor} />
        {searching ? <div className="af-text af-text--muted" style={{ marginTop: 8 }}>探索中…</div> : null}
      </div>
    </main>
  );
}
