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

// Shows the profile image when there is one, otherwise the name's initials,
// or a person for people who haven't set a name.
export const UserAvatar = ({
  mediaId,
  name,
  className,
}: {
  mediaId?: string;
  name?: string;
  className?: string;
}) => {
  const { url } = useMediaUrl(mediaId, "thumb");
  return (
    <Avatar className={cn("rounded-lg", className)}>
      {url && (
        <AvatarImage
          src={url}
          alt=""
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
