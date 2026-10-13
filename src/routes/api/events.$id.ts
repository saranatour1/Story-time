import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bearerToken, convexAs, json } from "@/server/r2";

const R2_DELETE_BATCH = 1000;

export const Route = createFileRoute("/api/events/$id")({
  server: {
    handlers: {
      // Deletes an experience: its R2 objects first, then the data. Safe to
      // retry, because deleting an object that's already gone is a no-op.
      DELETE: async ({ request, params }) => {
        const token = bearerToken(request);
        if (!token) return json({ error: "Sign in" }, 401);
        const convex = convexAs(token);
        const eventId = params.id as Id<"events">;

        let keys: string[];
        try {
          keys = await convex.query(api.media.listKeysForEvent, { eventId });
        } catch {
          return json({ error: "Not found" }, 404);
        }
        for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
          await env.MEDIA.delete(keys.slice(i, i + R2_DELETE_BATCH));
        }

        try {
          await convex.mutation(api.events.remove, { eventId });
        } catch (e) {
          console.error("[events] delete failed", e);
          return json({ error: "Couldn't delete this experience. Try again." }, 500);
        }
        return json({ ok: true });
      },
    },
  },
});
