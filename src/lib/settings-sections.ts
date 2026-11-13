import { KeyRoundIcon, UserIcon } from "lucide-react";

export const SETTINGS_SECTIONS = [
  { to: "/settings/profile", label: "Profile", icon: UserIcon },
  { to: "/settings/account", label: "Account", icon: KeyRoundIcon },
] as const;
