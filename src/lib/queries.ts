import { convexQuery } from "@convex-dev/react-query";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { api } from "@/lib/api";

// Everything the app reads, as TanStack Query options: one factory per
// feature, named like convex/api/. Components call
// `useQuery(queries.moments.list({ eventId }))` from @tanstack/react-query, and
// route loaders prefetch the same options, so both share one cache entry.
// Each entry stays live: Convex pushes changes into the cache, so nothing here
// is ever refetched or invalidated by hand. Pass "skip" to wait for the args.
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
  journal: {
    outline: (args: Args<typeof api.journal.outline>) => convexQuery(api.journal.outline, args),
    page: (args: Args<typeof api.journal.page>) => convexQuery(api.journal.page, args),
    pageForMoment: (args: Args<typeof api.journal.pageForMoment>) =>
      convexQuery(api.journal.pageForMoment, args),
    stickers: (args: Args<typeof api.journal.stickers>) => convexQuery(api.journal.stickers, args),
    unpaged: (args: Args<typeof api.journal.unpaged>) => convexQuery(api.journal.unpaged, args),
  },
  media: {
    unattached: (args: Args<typeof api.media.unattached>) =>
      convexQuery(api.media.unattached, args),
  },
  moments: {
    list: (args: Args<typeof api.moments.list>) => convexQuery(api.moments.list, args),
  },
  pdf: {
    get: (args: Args<typeof api.pdf.get>) => convexQuery(api.pdf.get, args),
  },
  share: {
    get: (args: Args<typeof api.share.get>) => convexQuery(api.share.get, args),
    hidePhotos: (args: Args<typeof api.share.hidePhotos>) =>
      convexQuery(api.share.hidePhotos, args),
    journal: (args: Args<typeof api.share.journal>) => convexQuery(api.share.journal, args),
    link: (args: Args<typeof api.share.link>) => convexQuery(api.share.link, args),
    page: (args: Args<typeof api.share.page>) => convexQuery(api.share.page, args),
    pdf: (args: Args<typeof api.share.pdf>) => convexQuery(api.share.pdf, args),
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
