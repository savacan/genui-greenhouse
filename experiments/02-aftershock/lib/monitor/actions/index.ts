import type { AnyAction } from "../types";
import { quakes, quakeDetail } from "./usgs";
import { weather } from "./weather";
import { nearby } from "./nearby";
import { aircraft } from "./opensky";

/**
 * THE knob. Add a capability = append here. tools.ts の ToolSet も dispatch もここから derive。
 * 01 の「アクション追加 = 1ファイル + ACTIONS に1行」を踏襲。
 */
export const ACTIONS = [quakes, quakeDetail, weather, nearby, aircraft] as const satisfies readonly AnyAction[];

export const actionById: Record<string, AnyAction> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
