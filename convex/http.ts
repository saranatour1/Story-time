import { httpRouter } from "convex/server";
import { aiBudget } from "./lib/ai/budget";

const http = httpRouter();

aiBudget.registerRoutes(http);

export default http;
