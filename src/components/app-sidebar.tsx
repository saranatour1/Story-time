import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, HomeIcon, ListIcon, UsersIcon } from "lucide-react";
import { queries } from "@/lib/queries";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const SECTIONS = [
  { to: "/e/$id", label: "Moments", icon: ListIcon, path: "" },
  { to: "/e/$id/shared", label: "People", icon: UsersIcon, path: "/shared" },
] as const;

export const AppSidebar = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const open = /^\/e\/([^/]+)(\/[a-z]+)?\/?$/.exec(pathname);
  const eventId = open?.[1];
  const section = open?.[2] ?? "";
  const { data: event } = useQuery(queries.events.get(eventId ? { eventId } : "skip"));
  const { data: events } = useQuery(queries.events.listMine());

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Story-time">
              <Link to="/home">
                <Logo className="size-7! shrink-0 group-data-[collapsible=icon]:size-8!" />
                <span className="text-base font-bold tracking-tight group-data-[collapsible=icon]:hidden">
                  Story-time
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu className="magnetic">
            <span className="magnetic-indicator" aria-hidden />
            <Collapsible asChild defaultOpen className="group/experiences">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Experiences" isActive={pathname === "/home"}>
                  <Link to="/home">
                    <HomeIcon />
                    <span>Experiences</span>
                  </Link>
                </SidebarMenuButton>
                {events !== undefined && events.length > 0 && (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction
                        aria-label="Show or hide the experiences"
                        className="transition-transform group-data-[state=open]/experiences:rotate-90"
                      >
                        <ChevronRightIcon />
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {events.map((e) => (
                          <SidebarMenuSubItem key={e._id}>
                            <SidebarMenuSubButton asChild isActive={e._id === eventId}>
                              <Link to="/e/$id" params={{ id: e._id }}>
                                <span className="truncate">{e.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                )}
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>

        {eventId && event && (
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">{event.title}</SidebarGroupLabel>
            <SidebarMenu>
              {SECTIONS.map((s) => (
                <SidebarMenuItem key={s.label}>
                  <SidebarMenuButton asChild tooltip={s.label} isActive={section === s.path}>
                    <Link to={s.to} params={{ id: eventId }}>
                      <s.icon />
                      <span>{s.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
