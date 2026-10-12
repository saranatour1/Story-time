import { Link } from "@tanstack/react-router";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

// The signed-out pages' column: 1120px of content on a 12-column grid.
export const CONTAINER = "mx-auto w-full max-w-[1168px] px-4 sm:px-6";

// The page every signed-out screen sits on (landing, deep links, invites):
// flat paper by day, story mode's dark room by night.
export const SignedOutPage = ({
  children,
  className,
  nav,
  footer,
}: {
  children: React.ReactNode;
  className?: string;
  nav?: React.ReactNode;
  footer?: React.ReactNode;
}) => {
  return (
    <div className="flex min-h-svh flex-col bg-[#f6f1e7] text-stone-900 dark:bg-[#141210] dark:text-stone-100">
      <header className="sticky top-0 z-40 border-b border-stone-900/10 bg-[#f6f1e7]/90 backdrop-blur-sm dark:border-white/10 dark:bg-[#141210]/90">
        <div className={cn(CONTAINER, "flex h-14 items-center gap-6")}>
          <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-tight">
            <Logo className="size-6" />
            Story-time
          </Link>
          {nav}
        </div>
      </header>
      <main className={cn("flex flex-1 flex-col", className)}>{children}</main>
      {footer}
    </div>
  );
};

// Signed-out visitors to a deep link (an experience, a story) sign in where
// they are: OAuth returns to the current URL, so they land where they meant to.
export const SignInScreen = () => {
  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <LoginForm
        className="w-full max-w-sm"
        heading="Sign in to open this page"
        description="Only the people it was shared with, or anyone holding a link its owner switched on, can see it. You'll come straight back here."
      />
    </SignedOutPage>
  );
};
