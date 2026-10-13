import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

// Light / Dark / System. Expanded sidebar: a three-way switch. Collapsed
// rail: one button that cycles through the three.
export const ThemeToggle = () => {
  const { theme = "system", setTheme } = useTheme();
  // The stored theme is only known on the client; avoid a wrong first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : "system";

  const next = OPTIONS[(OPTIONS.findIndex((o) => o.value === current) + 1) % OPTIONS.length]!;
  const Active = OPTIONS.find((o) => o.value === current)!.icon;

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex rounded-lg bg-sidebar-accent/60 p-0.5 group-data-[collapsible=icon]:hidden"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={current === value}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              // Same as the selected tab in ui/tabs: in dark mode the plain
              // background is darker than the track and reads as "off".
              current === value && "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
            )}
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenuButton tooltip={`Theme: ${current}. Switch to ${next.label}`} onClick={() => setTheme(next.value)}>
          <Active />
          <span>Theme</span>
        </SidebarMenuButton>
      </div>
    </>
  );
};
