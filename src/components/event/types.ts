import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type EventView = NonNullable<FunctionReturnType<typeof api.events.get>>;
export type MomentView = FunctionReturnType<typeof api.moments.list>[number];
export type GroupBy = "day" | "place" | "month";
