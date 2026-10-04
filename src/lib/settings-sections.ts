import { DatabaseIcon, KeyRoundIcon, UserIcon } from "lucide-react";

// The settings pages, in nav order.
export const SETTINGS_SECTIONS = [
  { to: "/settings/profile", label: "Profile", icon: UserIcon },
  { to: "/settings/data", label: "Data & region", icon: DatabaseIcon },
  { to: "/settings/account", label: "Account", icon: KeyRoundIcon },
] as const;
