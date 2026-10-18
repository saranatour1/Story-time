<p align="center">
  <img src="public/favicon.svg" alt="Story-time logo" width="96" height="96">
</p>

<h1 align="center">Story-time</h1>

> **TL;DR:** a private photo story of a trip. Everyone who was there adds their photos, and the app plays them back in order, stop by stop, on a map. It's built with React on Cloudflare Workers, with Convex as the backend. To run it: `pnpm install`, then `pnpm dev`.

## What it does

- You start an **experience** (a trip, a day out, anything you did together).
- You invite the people who were there with one-time links. They each add their own **moments**: photos, a place, a note.
- **Story mode** plays it back in order: a title page, each leg drawn on a map, the photos one by one.
- The **Journal** turns it into a scrapbook of A4 pages you can rearrange, add stickers to, and export as a PDF.
- It's private by default. Sharing with anyone else is a link you switch on.

More on using it: [docs/user-guide.md](docs/user-guide.md).

## What it uses

- **App:** TanStack Start and Router (React 19), Tailwind v4, shadcn/ui
- **Hosting:** Cloudflare Workers
- **Backend:** Convex (data, functions, sign-in with GitHub or Google)
- **Photos and videos:** Cloudflare R2, encrypted per experience
- **Maps:** MapLibre through mapcn
- **AI fill-ins** (optional): the Convex AI Gateway, which needs a paid Convex plan

How it fits together: [docs/architecture.md](docs/architecture.md).

## Run it locally

> **TL;DR:** `pnpm install`, copy `.dev.vars`, then `pnpm dev`. Open http://localhost:3000.

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

- In `.dev.vars`, set `ENCRYPTION_MASTER_KEY`. `openssl rand -base64 32` makes one.
- The first `pnpm dev` asks you to create or link a Convex deployment. It writes `VITE_CONVEX_URL` to `.env.local` for you.
- `pnpm dlx @convex-dev/auth` sets up the sign-in keys on that deployment. It leaves your `convex/` files alone.
- Want to skip OAuth while developing? Set `ALLOW_ANONYMOUS_SIGNIN=true` on the dev deployment (never in production).

### Convex settings

Set them with `pnpm exec convex env set NAME value` (add `--prod` for production).

| Name                                                 | What it's for                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                      | Sign-in session keys                                                                                                      |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` | GitHub sign-in                                                                                                            |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google sign-in                                                                                                            |
| `ENCRYPTION_MASTER_KEY`                              | Encrypts places, notes and links. Must match the Worker's                                                                 |
| `APP_URL`                                            | Your site's address, for invite links. Several can be comma-separated; the first goes in the links. Defaults to localhost |
| `ALLOW_ANONYMOUS_SIGNIN`                             | `true` adds a dev-only "skip sign-in" button                                                                              |
| `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, `EMAIL_FROM`      | Optional. Sends invites by email; without them, invites are links only                                                    |

## Commands

| Command                | Does                                          |
| ---------------------- | --------------------------------------------- |
| `pnpm dev`             | Convex + the app on port 3000                 |
| `pnpm dev:web`         | The app only                                  |
| `pnpm build`           | Production build                              |
| `pnpm preview`         | Serve the build locally                       |
| `pnpm test`            | Tests (Convex functions and `src/lib`)        |
| `pnpm typecheck`       | Type check                                    |
| `pnpm lint`            | Lint                                          |
| `pnpm generate-routes` | Regenerate `src/routeTree.gen.ts`             |
| `pnpm typegen`         | Regenerate Worker types from `wrangler.jsonc` |

## Deploy

> **TL;DR:** deploy Convex, build against it, deploy the Worker.

First time only:

1. `pnpm exec convex deploy`, then set the Convex settings above with `--prod`.
2. Point the GitHub and Google OAuth apps at `https://<deployment>.convex.site/oauth/github/callback` and `.../oauth/google/callback`.
3. `pnpm exec wrangler r2 bucket create story-time-media`
4. `pnpm exec wrangler secret put ENCRYPTION_MASTER_KEY` (same value as Convex).

Every deploy:

```bash
VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_APP_URL=https://<your site> pnpm build
pnpm exec wrangler deploy
```

### From Cloudflare Workers Builds

- **Build command:**
  ```bash
  if [ "$WORKERS_CI_BRANCH" = "master" ]; then WORKERS_CI_BRANCH=main pnpm exec convex deploy --yes --cmd "pnpm build" --cmd-url-env-var-name VITE_CONVEX_URL; else VITE_CONVEX_URL=https://<dev deployment>.convex.cloud pnpm build; fi
  ```
  - `master` deploys Convex and the site. Other branches build against dev and leave Convex alone.
  - `WORKERS_CI_BRANCH=main` is there because Convex only treats a branch named `main` as production on Cloudflare.
- **Deploy command:** `pnpm exec wrangler deploy`
- **Build variables** (under Settings → Build, not the runtime ones): `CONVEX_DEPLOY_KEY` (a `prod:` key), `PNPM_VERSION=12.6.0`, `VITE_APP_URL`

## What leaves the app

- **AI fill-ins** (captions, labels, the "type a sentence" box, voice): moment details and small photo copies go to the Convex AI Gateway. Nothing is kept there. The app works without it.
- **Place search:** what you type, or a photo's location, goes to photon.komoot.io (OpenStreetMap).
- **Routes on the map:** two stop locations, rounded to about 100 m, go to OpenStreetMap's public routers.
- **Journal stickers:** cut out on your device. Only the model is downloaded, from Google.

How the AI parts work: [docs/architecture.md](docs/architecture.md).

## Where things are

```
src/routes/       pages (_app/ is the signed-in app, api/ is uploads and media)
src/components/   UI, story mode, journal, landing page
src/server/r2.ts  photo storage and encryption keys
src/lib/          shared helpers and their tests
convex/           backend: schema, functions, crons (start at convex/README.md)
public/           logo, link-preview image, manifest
docs/             architecture, user guide, plans
```
