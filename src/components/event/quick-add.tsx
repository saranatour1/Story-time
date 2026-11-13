import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { ImagePlusIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { useCurrentAuthToken } from "@/hooks/use-current-auth-token";
import { addPhotos } from "@/lib/add-photos";
import { MEDIA_ACCEPT } from "@/lib/upload";

export const canAddTo = (event: EventView) =>
  event.role !== "viewer" && event.status !== "archived";

type ButtonProps = ComponentProps<typeof Button>;

export const QuickAddButton = ({
  event,
  variant = "default",
  size,
  children = "Add photos",
}: {
  event: EventView;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children?: ReactNode;
}) => {
  const createMoment = useMutation(api.moments.create);
  const token = useAuthToken();
  const currentToken = useCurrentAuthToken();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!canAddTo(event)) return null;

  const add = async (list: FileList | null) => {
    setBusy(true);
    try {
      await addPhotos({
        event,
        files: Array.from(list ?? []),
        currentToken,
        createMoment,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={busy || !token}
        aria-label="Add photos and videos"
        data-track="add_photos_clicked"
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon /> {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void add(e.target.files);
          // Cleared, so picking the same files again still fires.
          e.target.value = "";
        }}
      />
    </>
  );
};
