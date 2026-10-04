import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bearerToken, convexAs, json, ssecKeyFor } from "@/server/r2";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = bearerToken(request);
        if (!token) return json({ error: "Sign in" }, 401);

        // Null unless the caller has an active grant on the event.
        const media = await convexAs(token)
          .query(api.media.getForDownload, { mediaId: params.id as Id<"media"> })
          .catch(() => null);
        if (!media) return json({ error: "Not found" }, 404);

        const object = await env.MEDIA.get(media.r2Key, {
          ssecKey: await ssecKeyFor(media.eventId, media.keyVersion),
        });
        if (!object) return json({ error: "Not found" }, 404);

        return new Response(object.body, {
          headers: {
            "Content-Type": media.mime,
            // Private, per-viewer content: never cached by shared caches.
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
