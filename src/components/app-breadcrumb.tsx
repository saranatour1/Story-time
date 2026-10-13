import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/queries";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SECTION_NAMES: Record<string, string> = {
  "/journal": "Journal",
  "/guestbook": "Guestbook",
  "/shared": "Shared",
  "/activity": "Activity",
};

// Navbar trail for the experiences side: Experiences › <experience> › <section>.
export const AppBreadcrumb = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const open = /^\/e\/([^/]+)(\/[a-z]+)?\/?$/.exec(pathname);
  const eventId = open?.[1];
  const section = open?.[2] ? SECTION_NAMES[open[2]] : undefined;
  const { data: event } = useQuery(queries.events.get(eventId ? { eventId } : "skip"));

  if (pathname !== "/home" && !eventId) return null;
  const title = event === undefined ? "…" : event === null ? "Not found" : event.title;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          {eventId ? (
            <BreadcrumbLink asChild>
              <Link to="/home">Experiences</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Experiences</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {eventId && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {section ? (
                <BreadcrumbLink asChild className="truncate">
                  <Link to="/e/$id" params={{ id: eventId }}>
                    {title}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}
        {section && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{section}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
