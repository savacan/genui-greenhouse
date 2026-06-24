import { z } from "zod";
import type { AnyAction } from "../types";
import { apod } from "./apod";
import { apodGallery } from "./apodGallery";
import { neows } from "./neows";
import { iss } from "./iss";
import { astros } from "./astros";
import { epic } from "./epic";
import { imageSearch } from "./imageSearch";
import { launches } from "./launches";
import { exoplanet } from "./exoplanet";
import { spaceWeather } from "./spaceWeather";
import { cme } from "./cme";
import { aurora } from "./aurora";
import { flares } from "./flares";
import { stormReplay } from "./stormReplay";

/** THE knob. Add an action = append here. Router schema / menu / dispatch all DERIVE from this. */
export const ACTIONS = [apod, apodGallery, neows, iss, astros, epic, imageSearch, launches, exoplanet, spaceWeather, cme, aurora, flares, stormReplay] as const satisfies readonly AnyAction[];

export const actionById: Record<string, AnyAction> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
);

const ids = ACTIONS.map((a) => a.id) as [string, ...string[]];

/**
 * Router schema. Azure の構造化出力はルート schema が type:"object" 必須で discriminated
 * union（anyOf）を弾くため、union ではなく「action enum + 全アクションの params を統合した
 * nullable な params オブジェクト」にする（ルートが object）。それでも形は ACTIONS から derive。
 * 各アクション固有の検証は route 側で action.params.parse() が行う（単一の真実は各 action）。
 */
const paramKeys = new Set<string>();
for (const a of ACTIONS) {
  for (const key of Object.keys((a.params as unknown as z.ZodObject<z.ZodRawShape>).shape)) {
    paramKeys.add(key);
  }
}
// Azure の strict 構造化出力は「全プロパティが required・optional 不可」。よって nullable(必須・null可)で表現する。
// 現状すべてのアクションの params は文字列なので string|null で受ける（型変換・必須チェックは route 側の action.params.parse が担う）。
const mergedParamsShape: Record<string, z.ZodTypeAny> = Object.fromEntries(
  [...paramKeys].map((key) => [key, z.string().nullable()]),
);

// 複数アクション対応（複合質問 = 1問で写真＋小惑星など）。通常は1件、複数トピックに跨るときだけ複数。
// .min() は Azure strict 構造化出力で弾かれることがあるため付けず、空配列は route 側で扱う。
export const routerSchema = z.object({
  actions: z.array(
    z.object({
      action: z.enum(ids),
      params: z.object(mergedParamsShape),
    }),
  ),
});
export type Routed = z.infer<typeof routerSchema>;
export type RoutedAction = Routed["actions"][number];

/** Menu the router LLM reads to pick an action (+ which params each needs). */
export const actionMenu = ACTIONS.map((a) => {
  const keys = Object.keys((a.params as unknown as z.ZodObject<z.ZodRawShape>).shape);
  const p = keys.length ? `（params: ${keys.join(", ")}）` : "（params 不要）";
  return `- ${a.id}: ${a.when} ${p}`;
}).join("\n");
