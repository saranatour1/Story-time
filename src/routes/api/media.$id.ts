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

        // Null unless the caller may see it: an active grant on the event for
        // photos, or the owner / someone sharing an experience for avatars.
        const media = await convexAs(token)
          .query(api.media.getForDownload, { mediaId: params.id as Id<"media"> })
          .catch(() => null);
        if (!media) return json({ error: "Not found" }, 404);

        const object = await env.MEDIA.get(media.r2Key, {
          ssecKey: await ssecKeyFor(media.keyScope, media.keyVersion),
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

      // Removes a replaced or cleared profile image from R2 for good.
      DELETE: async ({ request, params }) => {
        const token = bearerToken(request);
        if (!token) return json({ error: "Sign in" }, 401);
        const convex = convexAs(token);
        const mediaId = params.id as Id<"media">;

        const target = await convex
          .query(api.media.getForDelete, { mediaId })
          .catch(() => null);
        if (!target) return json({ error: "Not found" }, 404);

        await env.MEDIA.delete(target.r2Key);
        await convex.mutation(api.media.markDeleted, { mediaId });
        return json({ ok: true });
      },
    },
  },
});
