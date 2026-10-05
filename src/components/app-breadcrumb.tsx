import { Link, useMatch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Navbar trail for the experiences side: Experiences › <experience title>.
export function AppBreadcrumb() {
  const home = useMatch({ from: "/_app/home", shouldThrow: false });
  const experience = useMatch({ from: "/_app/e/$id/", shouldThrow: false });
  const eventId = experience?.params.id as Id<"events"> | undefined;
  const event = useQuery(api.events.get, eventId ? { eventId } : "skip");

  if (!home && !experience) return null;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          {experience ? (
            <BreadcrumbLink asChild>
              <Link to="/home">Experiences</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Experiences</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {experience && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">
                {event === undefined ? "…" : event === null ? "Not found" : event.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
