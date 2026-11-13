import { convexQuery } from "@convex-dev/react-query";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { api } from "@/lib/api";

type Args<F extends FunctionReference<"query">> = FunctionArgs<F> | "skip";

export const queries = {
  changes: {
    unreadCount: (args: Args<typeof api.changes.unreadCount>) =>
      convexQuery(api.changes.unreadCount, args),
    counts: (args: Args<typeof api.changes.counts>) => convexQuery(api.changes.counts, args),
  },
  events: {
    get: (args: Args<typeof api.events.get>) => convexQuery(api.events.get, args),
    listMine: () => convexQuery(api.events.listMine, {}),
  },
  guestNotes: {
    list: (args: Args<typeof api.guestNotes.list>) => convexQuery(api.guestNotes.list, args),
  },
  invites: {
    listForEvent: (args: Args<typeof api.invites.listForEvent>) =>
      convexQuery(api.invites.listForEvent, args),
  },
  media: {
    unattached: (args: Args<typeof api.media.unattached>) =>
      convexQuery(api.media.unattached, args),
  },
  moments: {
    list: (args: Args<typeof api.moments.list>) => convexQuery(api.moments.list, args),
  },
  share: {
    get: (args: Args<typeof api.share.get>) => convexQuery(api.share.get, args),
    link: (args: Args<typeof api.share.link>) => convexQuery(api.share.link, args),
    shown: (args: Args<typeof api.share.shown>) => convexQuery(api.share.shown, args),
  },
  users: {
    getCurrentUser: (args: Args<typeof api.users.getCurrentUser> = {}) =>
      convexQuery(api.users.getCurrentUser, args),
    usage: () => convexQuery(api.users.usage, {}),
  },
};

// Route loaders run outside React. On the first load that can be before
// ConvexAuthProvider has handed Convex its token, and a query sent then runs
// signed out and fails. So prefetching waits until sign-in is known, and is
// skipped when nobody is signed in. Prefetching only saves time; a skipped one
// costs nothing, since the component asks for the same query anyway.
export const signInGate = () => {
  let signedIn = false;
  let known = (): void => {};
  const ready = new Promise<void>((resolve) => (known = resolve));
  return {
    set: (value: boolean) => {
      signedIn = value;
      known();
    },
    whenSignedIn: (run: () => void) => void ready.then(() => signedIn && run()),
  };
};
