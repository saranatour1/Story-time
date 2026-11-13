import { UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// Up to two initials ("Sara Natour" → "SN"), or "" when there's no name.
// Array.from keeps an emoji or accented letter whole.
export const initials = (name: string | undefined) => {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
};

// Shows the image they uploaded, else the photo from their sign-in provider
// (imageUrl), otherwise the name's initials, or a person for people who
// haven't set a name.
export const UserAvatar = ({
  mediaId,
  imageUrl,
  name,
  className,
}: {
  mediaId?: string;
  imageUrl?: string;
  name?: string;
  className?: string;
}) => {
  const { url } = useMediaUrl(mediaId, "thumb");
  // Not `url ?? imageUrl`: the provider photo would flash while an upload loads.
  const src = mediaId ? url : imageUrl;
  return (
    <Avatar className={cn("rounded-lg", className)}>
      {src && (
        <AvatarImage
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          width={40}
          height={40}
          sizes="40px"
          decoding="async"
          className="rounded-lg object-cover"
        />
      )}
      <AvatarFallback className="rounded-lg">
        {initials(name) || <UserIcon aria-hidden className="size-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
};
