import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

export const ThemeToggle = () => {
  const { theme = "system", setTheme } = useTheme();

  const next = OPTIONS[(OPTIONS.findIndex((o) => o.value === theme) + 1) % OPTIONS.length]!;
  const Active = OPTIONS.find((o) => o.value === theme)!.icon;

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
            aria-checked={theme === value}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              theme === value &&
                "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
            )}
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenuButton
          tooltip={`Theme: ${theme}. Switch to ${next.label}`}
          onClick={() => setTheme(next.value)}
        >
          <Active />
          <span>Theme</span>
        </SidebarMenuButton>
      </div>
    </>
  );
};
