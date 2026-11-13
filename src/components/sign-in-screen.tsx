import { Link } from "@tanstack/react-router";
import { CONTAINER } from "@/components/container";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

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
