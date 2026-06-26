"use client";

import { createContext } from "react";
import type { MonGridRow } from "./components/MonGrid";

/**
 * exp03 §14 = 指差しで組み直す（出力ジェスチャ → 入力UI 合成）。
 * 結果カード（出力部品 MonGrid）に初めて入力アフォーダンスを乗せ、クリックされたモンを上流（page）へ渡す。
 * page はそのモンを seedMon として LLM に渡し、「似た相棒」フォームを再 compose する。
 *
 * 配線は controlled store と同じく registry の外（json-render の emit/handler は使わない）:
 *  - MonGrid のカードは spec の element ではなく /findMons/mons の各行＝動的データなので、
 *    per-element の on/emit には載せられない（monId が静的に書けない）。動的な「どのモンか」は React 側で扱う。
 *  - これにより「探す」で踏んだ handler 凍結（§10）と同型の罠も回避（context 値は安定参照で渡す）。
 */
export const AnchorContext = createContext<((mon: MonGridRow) => void) | null>(null);
