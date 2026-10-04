import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bearerToken, convexAs, json, ssecKeyFor } from "@/server/r2";

const MAX_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearerToken(request);
        const eventId = request.headers.get("X-Event-Id");
        const size = Number(request.headers.get("X-File-Size"));
        const mime = request.headers.get("Content-Type") ?? "";
        if (!token) return json({ error: "Sign in to upload" }, 401);
        if (!eventId || !request.body || !Number.isInteger(size)) {
          return json({ error: "Bad request" }, 400);
        }
        if (size < 1 || size > MAX_BYTES) {
          return json({ error: "Photos can be at most 5 MB" }, 413);
        }

        const convex = convexAs(token);
        try {
          // Convex enforces access, type and per-event caps before any bytes move.
          const reserved = await convex.mutation(api.media.reserveUpload, {
            eventId: eventId as Id<"events">,
            size,
            mime,
          });
          // FixedLengthStream errors if the body isn't exactly `size` bytes,
          // so the declared (checked) size is the real size.
          await env.MEDIA.put(
            reserved.r2Key,
            request.body.pipeThrough(new FixedLengthStream(size)),
            {
              httpMetadata: { contentType: mime },
              ssecKey: await ssecKeyFor(eventId, reserved.keyVersion),
            },
          );
          await convex.mutation(api.media.confirmUpload, {
            mediaId: reserved.mediaId,
          });
          return json({ mediaId: reserved.mediaId }, 201);
        } catch (e) {
          if (e instanceof ConvexError) {
            const data = e.data as { message?: string } | string;
            return json({ error: typeof data === "string" ? data : data.message }, 400);
          }
          return json({ error: "Upload failed" }, 500);
        }
      },
    },
  },
});
