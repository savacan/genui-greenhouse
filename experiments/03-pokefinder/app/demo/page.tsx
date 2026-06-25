"use client";

import { useMemo, useRef, useState } from "react";
import type { Spec } from "@json-render/core";
import { FinderRenderer } from "@/lib/render/renderer";

/**
 * Phase B の心臓 = LLM 抜きのハンド spec で双方向フォームをブラウザ検証する。
 *   - TypeCheckbox / Select / Slider を $bindState で /shelf に two-way 結合
 *   - トグル → onStateChange デルタ → 現在 state を再構成して live 表示（即時・サーバ往復なし）
 *   - $template の echo が state を文字列に差し込めるか
 *   - 「探す」find ハンドラが現在 state から findMons 引数を組めるか（Phase C の送信を模擬）
 *   - MonGrid が /findMons/mons（静的サンプル）を描けるか（出力経路の確認）
 */

const SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// 静的サンプル（probe の fire∩flying から3件）。Phase C ではサーバ findMons が返す。
const SAMPLE_MONS = [
  { id: 146, name: "moltres", sprite: SPRITE(146), types: ["fire", "flying"], hp: 90, attack: 100, defense: 90, spAtk: 125, spDef: 85, speed: 90, total: 580 },
  { id: 6, name: "charizard", sprite: SPRITE(6), types: ["fire", "flying"], hp: 78, attack: 84, defense: 78, spAtk: 109, spDef: 85, speed: 100, total: 534 },
  { id: 663, name: "talonflame", sprite: SPRITE(663), types: ["fire", "flying"], hp: 78, attack: 81, defense: 71, spAtk: 74, spDef: 69, speed: 126, total: 499 },
];

// LLM が組む spec を模した手書き spec。state に初期選択（問い「炎か飛行・素早さ高め」を想定）。
const SPEC: Spec = {
  root: "root",
  state: {
    shelf: { type: { fire: true, flying: true }, generationId: null, minStats: { speed: 100 } },
    findMons: { mons: SAMPLE_MONS },
  },
  elements: {
    root: { type: "Stack", props: { direction: "vertical", gap: "lg" }, children: ["title", "form", "echo", "findBtn", "resHead", "grid"] },
    title: { type: "Heading", props: { text: "炎・飛行タイプで素早さ高めの相棒さがし", level: "h1" } },

    form: { type: "Card", props: { title: "条件", tone: "accent" }, children: ["typeHead", "typeRow", "gen", "spd"] },
    typeHead: { type: "Text", props: { text: "タイプ（複数選ぶと AND）", muted: true } },
    typeRow: { type: "Stack", props: { direction: "horizontal", gap: "sm", wrap: true }, children: ["cbFire", "cbFlying", "cbWater", "cbGrass", "cbDragon"] },
    cbFire: { type: "TypeCheckbox", props: { label: "ほのお", color: "#e62829", checked: { $bindState: "/shelf/type/fire" } } },
    cbFlying: { type: "TypeCheckbox", props: { label: "ひこう", color: "#81b9ef", checked: { $bindState: "/shelf/type/flying" } } },
    cbWater: { type: "TypeCheckbox", props: { label: "みず", color: "#2980ef", checked: { $bindState: "/shelf/type/water" } } },
    cbGrass: { type: "TypeCheckbox", props: { label: "くさ", color: "#3fa129", checked: { $bindState: "/shelf/type/grass" } } },
    cbDragon: { type: "TypeCheckbox", props: { label: "ドラゴン", color: "#5060e1", checked: { $bindState: "/shelf/type/dragon" } } },

    gen: {
      type: "Select",
      props: {
        label: "世代",
        value: { $bindState: "/shelf/generationId" },
        options: [
          { value: null, label: "全世代" },
          { value: 1, label: "第1世代（カントー）" },
          { value: 2, label: "第2世代（ジョウト）" },
          { value: 3, label: "第3世代（ホウエン）" },
        ],
      },
    },
    spd: { type: "Slider", props: { label: "すばやさ下限", min: 0, max: 200, step: 5, unit: "", value: { $bindState: "/shelf/minStats/speed" } } },

    echo: { type: "Text", props: { muted: true, text: { $template: "選択中: fire=${/shelf/type/fire} flying=${/shelf/type/flying} water=${/shelf/type/water} dragon=${/shelf/type/dragon} / 世代=${/shelf/generationId} / 最低すばやさ=${/shelf/minStats/speed}" } } },
    findBtn: { type: "ActionButton", props: { label: "この条件で探す", tone: "primary" }, on: { click: { action: "find" } } },

    resHead: { type: "Heading", props: { text: "結果（静的サンプル · /findMons/mons）", level: "h2" } },
    grid: { type: "MonGrid", props: { mons: { $state: "/findMons/mons" } } },
  } as unknown as Spec["elements"],
};

type Shelf = { type?: Record<string, boolean>; generationId?: number | null; minStats?: Record<string, number> };

/** path("/a/b") の値を clone に set（onStateChange デルタを現在 state に畳む）。 */
function applyChange(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.replace(/^\//, "").split("/");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** 現在 shelf → findMons 引数（Phase C のサーバ送信に渡す形）。0 や false は落とす。 */
function toFindParams(shelf: Shelf) {
  const types = Object.entries(shelf.type ?? {}).filter(([, v]) => v).map(([k]) => k);
  const minStats = Object.fromEntries(Object.entries(shelf.minStats ?? {}).filter(([, v]) => v && v > 0));
  return { types, generationId: shelf.generationId ?? null, minStats };
}

export default function DemoPage() {
  const initialState = useMemo(() => structuredClone(SPEC.state) as Record<string, unknown>, []);
  // onStateChange はデルタしか来ないので、初期 state を基準に畳んで「現在 state」を保つ。
  const liveRef = useRef<Record<string, unknown>>(structuredClone(SPEC.state) as Record<string, unknown>);
  const [shown, setShown] = useState<Record<string, unknown>>(() => structuredClone(SPEC.state!.shelf as Record<string, unknown>));
  const [searched, setSearched] = useState<unknown>(null);

  return (
    <main className="pf-shell">
      <header className="pf-topbar">
        <span className="pf-logo">◓ Pokéfinder</span>
        <span className="pf-sub">Phase B demo · 双方向フォーム（LLM 抜き・ハンド spec）</span>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <FinderRenderer
          spec={SPEC}
          initialState={initialState}
          onStateChange={(changes) => {
            for (const c of changes) applyChange(liveRef.current, c.path, c.value);
            setShown(structuredClone(liveRef.current.shelf as Record<string, unknown>));
          }}
          onFind={() => setSearched(toFindParams(liveRef.current.shelf as Shelf))}
        />

        <section className="pf-panel">
          <h3 className="pf-panel__title">live state（onStateChange で再構成 · トグルで即更新）</h3>
          <pre className="pf-statebox">{JSON.stringify(shown, null, 2)}</pre>
          <p className="pf-demo-note">↑ チェック/セレクト/スライダーを動かすと即座に変わる（サーバ往復なし）。</p>
        </section>

        {searched ? (
          <section className="pf-panel pf-panel--accent">
            <h3 className="pf-panel__title">「探す」→ findMons へ送る引数（Phase C のサーバ送信を模擬）</h3>
            <pre className="pf-statebox">{JSON.stringify(searched, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
