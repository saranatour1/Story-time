import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// Shows the profile image when there is one, otherwise the initial.
export function UserAvatar({
  mediaId,
  initial,
  className,
}: {
  mediaId?: string;
  initial: string;
  className?: string;
}) {
  const { url } = useMediaUrl(mediaId);
  return (
    <Avatar className={cn("rounded-lg", className)}>
      {url && <AvatarImage src={url} alt="" className="rounded-lg object-cover" />}
      <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
    </Avatar>
  );
}
