import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bearerToken, convexAnonymous, convexAs, json, shareToken, ssecKeyFor } from "@/server/r2";

// Null unless the caller may see it. A signed-in viewer is checked as
// themselves; a share link by its token alone. Convex makes both decisions.
async function mediaFor(request: Request, mediaId: Id<"media">, variant: "full" | "thumb") {
  const token = bearerToken(request);
  if (token) {
    return convexAs(token).query(api.media.getForDownload, { mediaId, variant }).catch(() => null);
  }
  const share = shareToken(request);
  if (share) {
    return convexAnonymous()
      .query(api.share.mediaForShare, { token: share, mediaId, variant })
      .catch(() => null);
  }
  return null;
}

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!bearerToken(request) && !shareToken(request)) return json({ error: "Sign in" }, 401);

        const variant = new URL(request.url).searchParams.get("variant") === "thumb" ? "thumb" : "full";
        const media = await mediaFor(request, params.id as Id<"media">, variant);
        if (!media) return json({ error: "Not found" }, 404);

        const object = await env.MEDIA.get(media.r2Key, {
          ssecKey: await ssecKeyFor(media.keyScope, media.keyVersion),
        });
        if (!object) return json({ error: "Not found" }, 404);

        return new Response(object.body, {
          headers: {
            "Content-Type": media.mime,
            // Shown in the page, not saved as a file, and not sniffed into
            // another type.
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
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
        if (target.thumbR2Key) await env.MEDIA.delete(target.thumbR2Key);
        await convex.mutation(api.media.markDeleted, { mediaId });
        return json({ ok: true });
      },
    },
  },
});
