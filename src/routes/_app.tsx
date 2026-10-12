import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { AppSidebar } from "@/components/app-sidebar";
import { LogoSplash } from "@/components/logo";
import { SignInScreen } from "@/components/sign-in-screen";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { queries } from "@/lib/queries";

const AppLayout = () => {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [wasSignedIn, setWasSignedIn] = useState(false);
  useEffect(() => {
    if (isAuthenticated) setWasSignedIn(true);
  }, [isAuthenticated]);

  if (isLoading) return <LogoSplash />;
  if (!isAuthenticated) {
    // Signing out heads back to the landing page. Arriving signed out signs
    // in right here instead, so the link they opened survives.
    return wasSignedIn ? <Navigate to="/" replace /> : <SignInScreen />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <AppBreadcrumb />
        </header>
        <div className="flex flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app")({
  // The sidebar's list and the account menu, on every page in here.
  loader: ({ context: { prefetch } }) => {
    prefetch(queries.users.getCurrentUser());
    prefetch(queries.events.listMine());
  },
  component: AppLayout,
});
