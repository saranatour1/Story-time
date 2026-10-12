import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import { ImagePlusIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { addPhotos } from "@/lib/add-photos";
import { MEDIA_ACCEPT } from "@/lib/upload";

// Viewers can't add, and nothing is added to an archived experience.
export const canAddTo = (event: EventView) => event.role !== "viewer" && event.status !== "archived";

type ButtonProps = ComponentProps<typeof Button>;

// Picks photos and videos and makes their moments in one go, grouped by day
// and place, each with its AI note.
export function QuickAddButton({
  event,
  variant = "default",
  size,
  children = "Add photos",
}: {
  event: EventView;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children?: ReactNode;
}) {
  const createMoment = useMutation(api.moments.create);
  const enrich = useAction(api.ai.enrich.enrich);
  const token = useAuthToken();
  // Read at each call: tokens are short-lived and a batch can run for minutes.
  const latestToken = useRef(token);
  useEffect(() => {
    latestToken.current = token;
  }, [token]);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!canAddTo(event)) return null;

  async function add(list: FileList | null) {
    setBusy(true);
    try {
      await addPhotos({
        event,
        files: Array.from(list ?? []),
        token: () => latestToken.current ?? undefined,
        createMoment,
        enrich,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={busy || !token}
        aria-label="Add photos and videos"
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon /> {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        tabIndex={-1}
        // Visually hidden rather than display:none: some browsers won't click those.
        className="sr-only"
        onChange={(e) => {
          void add(e.target.files);
          // Cleared, so picking the same files again still fires.
          e.target.value = "";
        }}
      />
    </>
  );
}
