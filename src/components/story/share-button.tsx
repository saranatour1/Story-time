import { useMutation } from "convex/react";
import { Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { StoryEvent } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

// Safari only lets a click write the clipboard before its first await, so
// the write starts at once and takes the text when it's ready.
const copyLater = (text: Promise<string>): Promise<void> => {
  if (typeof ClipboardItem === "undefined") return text.then((t) => navigator.clipboard.writeText(t));
  const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
  return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
};

// Owners switch the story's link on and copy it: anyone with it can watch.
// Everyone else copies the story's own address. On a shared story, which has
// no role, the address on screen is the link.
export const ShareButton = ({ event, label, className }: { event: StoryEvent; label?: string; className?: string }) => {
  const enableLink = useMutation(api.share.enable);
  const [busy, setBusy] = useState(false);
  const shared = event.role === undefined;
  const canShareLink = event.role === "owner" && event.status !== "archived";

  const share = async () => {
    setBusy(true);
    const link = shared
      ? Promise.resolve(window.location.href)
      : canShareLink
        ? enableLink({ eventId: event._id })
        : Promise.resolve(`${window.location.origin}/e/${event._id}/story`);
    const copied = copyLater(link).then(
      () => true,
      () => false,
    );
    try {
      const url = await link;
      const description = shared
        ? "Anyone with it can watch."
        : canShareLink
          ? "Switch it off under Shared."
          : "Only people who already have access to this experience can open it.";
      if (await copied) {
        toast.success(canShareLink ? "Link copied · anyone with it can watch" : "Link copied", { description });
      } else {
        // The browser refused the clipboard: a fresh click on Copy is allowed.
        toast(url, { description, action: { label: "Copy", onClick: () => void navigator.clipboard.writeText(url) } });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (label) {
    return (
      <Button variant="secondary" onClick={() => void share()} disabled={busy}>
        <Share2Icon /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={canShareLink ? "Share with a link" : "Copy link"}
      onClick={() => void share()}
      disabled={busy}
      className={cn("text-white hover:bg-white/10 hover:text-white", className)}
    >
      <Share2Icon />
    </Button>
  );
};
