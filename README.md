# Story-time

Story-time collects everyone's photos from something you did together, in the order it happened. You start an experience, invite the people who were there with one-time links (or switch on a link anyone can watch from), and each of them adds their own moments. Story mode then plays it back stop by stop, with a typed title page, each leg on a map and the photos in a camera's viewfinder.

## Stack

- TanStack Start and Router (React 19), running on Cloudflare Workers. SSR is off; the server renders only the shell and its `<head>`.
- Convex for data and functions, Convex Auth for sign-in (GitHub and Google).
- Cloudflare R2 for photos and videos, encrypted with SSE-C keys derived per experience.
- Tailwind CSS v4 and shadcn/ui; MapLibre (through mapcn) for the maps. The story is plain DOM and CSS, no WebGL beyond the map.

## Local setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then set ENCRYPTION_MASTER_KEY, e.g. openssl rand -base64 32
pnpm dev                         # convex dev + the app on http://localhost:3000
```

The first `pnpm dev` asks you to create or link a Convex deployment and writes `VITE_CONVEX_URL` to `.env.local`. `npx @convex-dev/auth` sets `AUTH_PRIVATE_KEY` and `AUTH_JWKS` on that deployment and leaves the existing `convex/` files alone.

Set these on the Convex deployment with `npx convex env set NAME value` (add `--prod` for production):

| Name                                                 | What it's for                                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                      | Session signing keys                                                                                                                                                                                      |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app                                                                                                                                                                                          |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client                                                                                                                                                                                       |
| `ENCRYPTION_MASTER_KEY`                              | Encrypts places, notes, links and feelings. Use the same value as the Worker's                                                                                                                            |
| `APP_URL`                                            | The site's origin, used for invite and share links and allowed OAuth redirects. Several origins can be listed with commas (the first goes in invite and share links). Unset means `http://localhost:3000` |
| `ALLOW_ANONYMOUS_SIGNIN`                             | `true` enables the dev-only anonymous button. Never set it in production                                                                                                                                  |
| `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, `EMAIL_FROM`      | Optional. Without them invites are links only, no email                                                                                                                                                   |

The Journal (in the sidebar, under an experience) is the experience as a book of A4 pages: a cover, then a page for each moment, made for you as moments are added and laid out like a scrapbook (taped prints, typed notes, a postmark, a map of the moment's stops that plays them one by one). Its owner can move, size and turn anything (react-moveable, with snapping), retype titles in seven styles, add tickets, tape and shapes, lock a page or the whole journal, cut stickers out of photos on the device (MediaPipe's interactive segmenter; only the model is downloaded, from Google), and export it as an A4 PDF, a page as a picture, or a journal file that can be added back. A page is one row in `journalPages` with its elements; the layout of a new page is in `convex/lib/journal.ts`. Words on a page are encrypted like notes.

AI features (captions, labels, transport) run through the Convex AI Gateway, which needs a paid Convex plan and no provider keys. For captions it gets the photos' 512px copies and the moment's text (experience title and description, places, time, transport, labels, notes); for transport it gets the places and times between stops. The box above the moments sends what you type to the gateway as well: Jev (TypeSafe's decision model) reads just your words, and whether a moment is open, to tell a new moment from a change or a removal; for a change, Haiku gets your words, the experience title, today's date and each moment's time, place, transport, labels and the first 80 characters of its first note (up to 60 moments, the ones nearest the open one). The plan it returns is shown before anything is saved, and a removal in it is kept only if Jev, asked separately, agrees you asked for one. The mic in that box records up to a minute (32 kbit/s, under 1 MB), sends it to the gateway's `/v1/audio/transcriptions` route (model `openai/whisper-large-v3-turbo`, called over HTTP because the provider package's voice support is still alpha), and puts the text in the box; 40 recordings an hour per person. Photos attached to the box become moments, as with Add photos, and the words typed with them become the first moment's note and are passed to the note-writer as context. None of it is kept in Convex. Without the gateway the app works, just without the automatic fill-ins.

Place search and the names of photo locations use OpenStreetMap data from photon.komoot.io; your typed text or the photo's coordinates are sent to it.

Where a leg of a story goes by foot, bike, car, bus or train, the map draws it along real streets and tracks. The browser of whoever is watching (people with a share link too) asks OpenStreetMap's public routers, routing.openstreetmap.de for roads and routing.openrailrouting.org for rails, for the route between the two stops. Only those two coordinates, rounded to about 100 m, are sent, and the answers are kept in memory, never stored. If a router can't be reached the leg is drawn as a curve. Planes, boats and other ways of travelling are always curves.

On the client, `VITE_APP_URL` (the site's origin, set at build time) makes the link-preview image URL absolute. Crawlers ignore relative `og:image` URLs.

## Scripts

| Command                | Does                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `pnpm dev`             | Convex dev deployment plus the app on port 3000              |
| `pnpm dev:web`         | The app only                                                 |
| `pnpm build`           | Production build                                             |
| `pnpm preview`         | Serve the build locally                                      |
| `pnpm test`            | Vitest: Convex functions (convex-test) and `src/lib`         |
| `pnpm typecheck`       | `tsc --noEmit`                                               |
| `pnpm lint`            | ESLint                                                       |
| `pnpm generate-routes` | Regenerate `src/routeTree.gen.ts`                            |
| `pnpm typegen`         | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

## Deploy

1. `npx convex deploy`, then set the Convex variables above with `--prod`, including `APP_URL`.
2. Point each OAuth app's callback at `https://<deployment>.convex.site/oauth/github/callback` and `https://<deployment>.convex.site/oauth/google/callback`.
3. `npx wrangler r2 bucket create story-time-media` (bound as `MEDIA` in `wrangler.jsonc`).
4. `npx wrangler secret put ENCRYPTION_MASTER_KEY`, the same value Convex has.
5. Build against production: `VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_APP_URL=https://<your site> pnpm build`.
6. `npx wrangler deploy`.

## Layout

```
src/routes/          pages; _app/ is the signed-in app, api/ the Worker's upload and media endpoints
src/components/      ui/ (shadcn, generated), event/, story/ (story mode), landing/, settings/
src/server/r2.ts     R2 access and SSE-C key derivation for the Worker
src/lib/             shared helpers and their tests
convex/              schema, functions, crons; components/ holds email and invites; tests/
public/              favicon, link-preview image, robots.txt, web manifest
```
