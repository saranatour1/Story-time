# Tasks

What is next, in order. Done items move to `progress.md`.

## Now

1. **Production runs in the EU** (Convex `production-eu`, `knowing-akita-405`, Ireland) since 2026-10-12; the old US deployment `strong-stoat-772` is empty and can be deleted in the dashboard. Sign-in waits on Sara pointing Google and GitHub at `https://knowing-akita-405.eu-west-1.convex.site/oauth/google/callback` and `/oauth/github/callback`. To deploy: `VITE_APP_URL=https://story-time.saranatour.dev pnpm exec convex deploy --env-file .env.production-eu.local --cmd "pnpm build" --cmd-url-env-var-name VITE_CONVEX_URL`, then `pnpm exec wrangler deploy`. `VITE_APP_URL` is needed for absolute link-preview URLs. Still naming the old deployment: the seed guard (`convex/model/seed.ts`) and `docs/byo-backend.md`.
2. **Simplification A2**: clear `itinerary`, `canvases`, `canvasNodes`, `quotaRequests` and the account-wide `agentTokens` (no `eventId`) in the dashboard (dev, then prod after the deploy), remove them from `convex/schema.ts`, push. Deleting an experience already drains its own tokens. Dev still had rows on 2026-10-24 (65 itinerary, 33 canvasNodes, 3 canvases, 2 quotaRequests, 2 agentTokens). Convex keeps a table that leaves the schema, rows and all, unvalidated, so the schema change needn't wait for the clear-out; the purge in `convex/model/events.ts` that reads these tables goes with it. In the same pass, delete any rows left in `inviteEmails`, `shareEmails` and `emailChecks`, which left the schema on 2026-10-24.
3. **Workers Builds**: the settings that work are in `docs/architecture.md` (Deploy and CI). Check the first `master` build after they're saved deploys both Convex and the Worker, then a PR preview build.
4. **Journal, the next eight** (`docs/next-features.md`, built by Cursor). Done: pages are cut when the moment is saved (1, PR #40), the share link opens the book (2, PR #41), one page on screen at a time (3, PRs #39 and #42), a page that can catch up (4, PR #43), print a sitting (5, PRs #39 and #44), the cover keeps the trip's name (6, PR #45, with "Try another" titles), take a sticker back (7, PR #39), Play is the same book (8, PR #46). All eight are built. A trip that already has moments without pages gets them when the journal is opened, and once a day on its own. A page taken out on purpose is not made again. The day it is for the person reading is marked Today in the moments list and in the journal's contents. A thing locked in place on a page cannot be moved, rewritten, or taken off until it is unlocked on its own. The box can also attach photos already in the trip: ones you uploaded that are not on a moment yet. Pressing / focuses the box only when moment search is not on the page. A pasted link's preview looks the hostname up and will not fetch an address on a private or local network. Activity counts new moments, pages, and guestbook notes since it was last opened, and deleting the trip removes those notes and the read mark. A share link can leave photos out, including an http preview image on a link card and the locked PDF's id.

## Next

After the eight, in this order. Each one stays inside "photos or a sentence in, a book out": no feed, no like counts, no public profiles.

1. **Guestbook** (medium). Built, as its own section (Guestbook in the sidebar), not the last page of the book. Still open: hiding a note (owner), and whether share-link readers may leave one.
2. **On this day** (small). Home shows "A year ago today: Porto" with that day's journal page. The email is in: opt-in in Settings, a daily note that a memory is waiting, with a link and no note text. Open: the home card.
3. **Home as a bookshelf** (small). Each experience's journal cover as a book on a shelf, opening in read mode, beside an "Everywhere we've been" mapcn map with a pin per trip. The events list returns each cover page (at most 20).
4. **The book as a video** (large). "Make a video": a day or the whole trip, square or 9:16, pages turning and the map drawing its route, as an MP4 for the phone's share sheet. Render the reader frame by frame (modern-screenshot, as the PDF does), encode with WebCodecs in a worker plus a small MP4 muxer, MediaRecorder where WebCodecs is missing. Risks: older Safari, memory on long trips, map tiles from other sites. Open: 9:16, square, or both?
5. **Photos with no signal** (medium to large). Install to the home screen; photos picked offline wait in a queue ("3 waiting") and upload when back online. A service worker on the existing `site.webmanifest`, an IndexedDB queue in `add-photos.ts`. Risks: iOS limits on installed web apps, storage quota.

## Later

- Convex Auth 2.0 beta (`2.0.0-beta.0`, 2026-10-15) is a rewrite: every import path the app uses (`core/setup`, `providers/oauth/*`, `providers/anonymous/*`) is gone, and GitHub and Google become separate components with their own tables. Moving to it means moving users' accounts and sessions; the app stays on `2.0.0-alpha.2` until that's planned.
- Edit moment: a photo fills only an empty When, so a moment's first stop (which always has a time) keeps its time when photos are added to it. Decide whether a photo taken earlier should move it.
- The journal page beside the moments list showed empty photo frames in local dev while the story showed the same photos. Check it on production.
- Collaboration follow-ups: tag people when a moment is first added (today it's only on edit), and decide whether "Who was there" belongs on journal pages (it would then reach the share link).

- AI Budget on production: after it's deployed, run `pnpm exec convex run model/aiBudget:configure --deployment production-eu` once, and set `AI_BUDGET_DASHBOARD_TOKEN` there to open the dashboard. Consider a global daily spend cap (`aiBudget.global.setLimits`) as a killswitch.
- Voice with zero data retention: turn on `provider.zdr` in `convex/model/ai/voice.ts` once the gateway's transcription route accepts it (it answers 400 today).
- Journal photo frames that take the photo's shape: keep each photo's width and height when it's uploaded, and size frames from it when a page is cut, so a tall photo gets a tall frame instead of paper at its sides.
- Databuddy: after the next production deploy, check the dashboard shows the first page view (localhost is ignored).
- The AI allowance (10 a day, `AI_PER_DAY` in `convex/lib/limits.ts`) includes the notes drafted for imported photos, so one big import uses the day's 10. Decide whether drafted notes get their own, larger allowance.
- Lighthouse on a slow phone: the landing page's first screen now comes in the HTML, but the 120 KB core script still holds performance near 70. Server-rendering the landing page, or a smaller core bundle, would get it to 90.
- Voice clips on a page: ten seconds, kept as a tap-to-play sticker (a new audio media type).
- The newer print logo exists only in Paper: export it as an SVG and swap it in for `public/favicon.svg`, `src/components/logo.tsx` and the README.
- Ordering a printed book (payments and a print partner).
- BYO backend (`docs/byo-backend.md`): phase 0 groundwork, only on a go.
- Deferred audit items: S9, S11, S12, S13, S25, S26, S29, CARTO tiles.
- Paginated lists (Activity, the people on Shared) on TanStack Query, once `@convex-dev/react-query` has a paginated query.
- Narrow the `events.description` schema union once the description migration has run on prod.

## Rules that stay

- Private by default. No `any`. pnpm, never npx. Squash and merge (`gh pr merge N --squash`).
- Each PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `vp build` green before it opens.
- Update `progress.md` and this file in every PR.
