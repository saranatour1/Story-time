import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({ component: SettingsLayout });

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="grid border-t md:grid-cols-[14rem_1fr]">
        <nav
          aria-label="Settings sections"
          className="magnetic flex gap-1 overflow-x-auto py-4 md:flex-col md:border-r md:py-6 md:pr-4"
        >
          <span className="magnetic-indicator" aria-hidden />
          {SETTINGS_SECTIONS.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
                  active && "bg-accent font-semibold text-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="py-6 md:pl-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
