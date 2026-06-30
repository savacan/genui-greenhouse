"use client";

import { createContext } from "react";
import type { ArtGridRow } from "./components/ArtGrid";

/**
 * exp04 §14 = 指差しで組み直す（出力ジェスチャ → 入力UI 合成）。pokefinder から写経。
 * 結果カード（出力部品 ArtGrid）に入力アフォーダンスを乗せ、クリックされた作品を上流（page）へ渡す。
 * page はその作品を seed として LLM に渡し、「似た作品」フォームを再 compose する（同じ作者・近い色・同じ種別）。
 *
 * 配線は controlled store と同じく registry の外（json-render の emit/handler は使わない）:
 *  - ArtGrid のカードは spec の element でなく /findArt/artworks の各行＝動的データなので per-element の on/emit に載せられない。
 *  - これにより handler 凍結（§10）と同型の罠も回避（context 値は安定参照で渡す）。
 */
export const AnchorContext = createContext<((art: ArtGridRow) => void) | null>(null);
