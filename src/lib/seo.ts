// What a page tells search engines and link previews (X, Reddit, Discord,
// Slack, iMessage, WhatsApp...). Server rendering is off, so only the root
// route's head() reaches them; it calls this with the path. Nothing private
// ever goes in: a shared trip's preview never names the trip.
export type PageMeta = {
  title: string;
  description: string;
  // 1200×630 PNG in public/, made by scripts/og-images.mjs.
  image: string;
  imageAlt: string;
  // Only the landing page is meant for search results.
  index: boolean;
};

const HOME: PageMeta = {
  title: "Story-time · Everyone's photos from the trip, in order",
  description:
    "Everyone's photos from the trip, in the order it happened. Invite the people who were there, then play it back stop by stop on a map. Private by default.",
  image: "/og.png",
  imageAlt:
    "Story-time: your trip, in order. Everyone who was there adds their photos, played back as a little film on a map.",
  index: true,
};

const SHARED: PageMeta = {
  title: "A trip, shared with you · Story-time",
  description:
    "Open it to read the book and play the film, stop by stop. Only people with the link can see it.",
  image: "/og-share.png",
  imageAlt: "Story-time: a trip, shared with you.",
  index: false,
};

const INVITE: PageMeta = {
  title: "You're invited to a trip · Story-time",
  description: "Join to add your photos and see everyone else's, in the order it happened.",
  image: "/og-invite.png",
  imageAlt: "Story-time: you're invited to a trip.",
  index: false,
};

export const pageMeta = (pathname: string): PageMeta => {
  if (pathname === "/") return HOME;
  if (pathname === "/s" || /^\/e\/[^/]+\/story\/?$/.test(pathname)) return SHARED;
  if (pathname === "/invite" || pathname.startsWith("/invite/")) return INVITE;
  // Signed-in pages: the site's own preview, kept out of search.
  return { ...HOME, index: false };
};
