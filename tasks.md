# Tasks

What is next, in order. Done items move to `progress.md`.

## Now

1. **Production runs in the EU** (Convex `production-eu`, `knowing-akita-405`, Ireland) since 2026-10-12; the old US deployment `strong-stoat-772` is empty and can be deleted in the dashboard. Sign-in waits on Sara pointing Google and GitHub at `https://knowing-akita-405.eu-west-1.convex.site/oauth/google/callback` and `/oauth/github/callback`. To deploy: `VITE_APP_URL=https://story-time.saranatour.dev pnpm exec convex deploy --env-file .env.production-eu.local --cmd "pnpm build" --cmd-url-env-var-name VITE_CONVEX_URL`, then `pnpm exec wrangler deploy`. `VITE_APP_URL` is needed for absolute link-preview URLs. Still naming the old deployment: the seed guard (`convex/model/seed.ts`) and `docs/byo-backend.md`.
2. **Simplification A2**: clear `itinerary`, `canvases`, `canvasNodes`, `quotaRequests` and the account-wide `agentTokens` (no `eventId`) in the dashboard (dev, then prod after the deploy), remove them from `convex/schema.ts`, push. Deleting an experience already drains its own tokens. Dev still had rows on 2026-10-24 (65 itinerary, 33 canvasNodes, 3 canvases, 2 quotaRequests, 2 agentTokens). Convex keeps a table that leaves the schema, rows and all, unvalidated, so the schema change needn't wait for the clear-out; the purge in `convex/model/events.ts` that reads these tables goes with it. In the same pass, delete any rows left in `inviteEmails`, `shareEmails` and `emailChecks`, which left the schema on 2026-10-24.
3. **Auth 2.0 to production (real data)**, when #89 and #90 are approved. Merging to `master` deploys (Workers Builds runs `convex deploy`), so:
   1. Back up: `pnpm exec convex export --deployment production-eu --path story-time-prod-backup.zip`.
   2. Merge #89 and check the site after its build.
   3. Just before merging #90, empty the auth sessions (their schema changed; the deploy fails otherwise): `pnpm exec convex import --component auth --table sessions --format jsonLines --replace --yes empty.jsonl --deployment production-eu` with an empty file. Merge straight after. If the build still fails on the auth schema (someone signed in between), run the import again and retry the build.
   4. Sign in with GitHub and with Google: you should land in your own account with your experiences. Logins live in `auth.accounts`, which beta reads unchanged; everyone signs in once more.
   5. To roll back: revert the merge on `master`, and run the same import first (beta's sessions don't fit the old schema either).
   6. After a week, delete the unmounted `oauthGithub`, `oauthGoogle` and `workflow` components' data in the dashboard (sign-in requests and workflow state only, no people).
4. **Workers Builds**: the settings that work are in `docs/architecture.md` (Deploy and CI). Check the first `master` build after they're saved deploys both Convex and the Worker, then a PR preview build.
5. **After the journal** (removed 2026-11-13, with its locked PDF, stickers and link previews). In the dashboard, on dev and then prod: delete the rows of `journals` and `journalPages` (both tables left the schema; Convex keeps their rows, unvalidated), and the `media` rows with purpose `sticker` or `pdf` together with their R2 objects (they still count toward upload bytes). Once no row holds them, drop the legacy values from `convex/schema.ts`: `"sticker"` and `"pdf"` in `media.purpose`, `pdf` in `events.shareHide`, and `"page"` in `vChangeEntity` (old Activity rows; they read as "Create page").

## Next

In this order. No feed, no like counts, no public profiles.

1. **Guestbook** (medium). Built, as its own section (Guestbook in the sidebar). Still open: hiding a note (owner), and whether share-link readers may leave one.
2. **On this day** (small). Home shows "A year ago today: Porto". The email is in: opt-in in Settings, a daily note that a memory is waiting, with a link and no note text. Open: the home card.
3. **Photos with no signal** (medium to large). Install to the home screen; photos picked offline wait in a queue ("3 waiting") and upload when back online. A service worker on the existing `site.webmanifest`, an IndexedDB queue in `add-photos.ts`. Risks: iOS limits on installed web apps, storage quota.

## Later

- Edit moment: a photo fills only an empty When, so a moment's first stop (which always has a time) keeps its time when photos are added to it. Decide whether a photo taken earlier should move it.
- Collaboration follow-ups: tag people when a moment is first added (today it's only on edit).

- After the AI Budget and the agent: both components are unmounted. Delete the `aiBudget` and `agent` components' data in the dashboard (dev, then prod), and remove `AI_BUDGET_DASHBOARD_TOKEN` from the deployments that have it.
- Voice with zero data retention: turn on `provider.zdr` in `convex/model/ai/voice.ts` once the gateway's transcription route accepts it (it answers 400 today).
- Databuddy: after the next production deploy, check the dashboard shows the first page view (localhost is ignored).
- Lighthouse on a slow phone: the landing page's first screen now comes in the HTML, but the 120 KB core script still holds performance near 70. Server-rendering the landing page, or a smaller core bundle, would get it to 90.
- The newer print logo exists only in Paper: export it as an SVG and swap it in for `public/favicon.svg`, `src/components/logo.tsx` and the README.
- BYO backend (`docs/byo-backend.md`): phase 0 groundwork, only on a go.
- Deferred audit items: S9, S11, S12, S13, S25, S26, S29, CARTO tiles.
- Paginated lists (Activity, the people on Shared) on TanStack Query, once `@convex-dev/react-query` has a paginated query.
- Narrow the `events.description` schema union once the description migration has run on prod.

## Rules that stay

- Private by default. No `any`. pnpm, never npx. Squash and merge (`gh pr merge N --squash`).
- Each PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `vp build` green before it opens.
- Update `progress.md` and this file in every PR.
