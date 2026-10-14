import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { AVATAR_TYPES, deleteMedia, uploadAvatar } from "@/lib/upload";

export const AvatarField = ({ mediaId, name }: { mediaId?: Id<"media">; name?: string }) => {
  const token = useAuthToken();
  const setAvatar = useMutation(api.media.setAvatar);
  const clearAvatar = useMutation(api.media.clearAvatar);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File | undefined) => {
    if (!file || !token) return;
    setBusy(true);
    try {
      const newId = (await uploadAvatar(file, token)) as Id<"media">;
      const previous = await setAvatar({ mediaId: newId });
      if (previous) await deleteMedia(previous, token);
      toast.success("Profile image updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const onRemove = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const previous = await clearAvatar({});
      if (previous) await deleteMedia(previous, token);
      toast.success("Profile image removed");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar mediaId={mediaId} name={name} className="size-20 text-2xl" />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {mediaId ? "Change image" : "Upload image"}
          </Button>
          {mediaId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP or AVIF, up to 2 MB. Only you and people you share an experience with can
          see it.
        </p>
        <input
          ref={input}
          type="file"
          accept={AVATAR_TYPES.join(",")}
          className="sr-only"
          aria-label="Profile image"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
};
