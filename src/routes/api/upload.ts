import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { ConvexError } from "convex/values";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bearerToken, convexAs, json, ssecKeyFor } from "@/server/r2";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearerToken(request);
        const eventId = request.headers.get("X-Event-Id");
        const isAvatar = request.headers.get("X-Purpose") === "avatar";
        // The journal printed to a locked PDF for its share link.
        const isPdf = request.headers.get("X-Purpose") === "journal-pdf";
        const size = Number(request.headers.get("X-File-Size"));
        const mime = request.headers.get("Content-Type") ?? "";
        if (!token) return json({ error: "Sign in to upload" }, 401);
        if ((!isAvatar && !eventId) || !request.body || !Number.isInteger(size) || (isPdf && mime !== "application/pdf")) {
          return json({ error: "Bad request" }, 400);
        }
        // A first, cheap cap; Convex re-checks size and type when reserving.
        const isVideo = mime.startsWith("video/");
        const cap = isAvatar ? MAX_AVATAR_BYTES : isPdf ? MAX_PDF_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
        if (size < 1 || size > cap) {
          const error = isAvatar
            ? "Profile images can be at most 2 MB"
            : isPdf
              ? "The PDF can be at most 50 MB"
              : isVideo
              ? "Videos can be at most 50 MB"
              : "Photos can be at most 5 MB";
          return json({ error }, 413);
        }

        const convex = convexAs(token);
        try {
          // Convex enforces access, type and caps before any bytes move.
          const reserved = isAvatar
            ? await convex.mutation(api.media.reserveAvatarUpload, { size, mime })
            : isPdf
              ? await convex.mutation(api.pdf.reserve, { eventId: eventId as Id<"events">, size })
              : await convex.mutation(api.media.reserveUpload, {
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
              ssecKey: await ssecKeyFor(reserved.keyScope, reserved.keyVersion),
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
          // Keep the real cause in the server log; the client gets a generic message.
          console.error("[upload] failed", e);
          return json({ error: "Upload failed" }, 500);
        }
      },
    },
  },
});
