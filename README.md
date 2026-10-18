<p align="center">
  <img src="public/favicon.svg" alt="Story-time logo" width="96" height="96">
</p>

<h1 align="center">Story-time</h1>

<p align="center"><a href="https://story-time.saranatour.dev">story-time.saranatour.dev</a></p>

> **TL;DR:** a private photo story of a trip. Everyone who was there adds their photos, and the app plays them back in order, stop by stop, on a map. It uses React (TanStack Start) on Cloudflare Workers, Convex for the backend, and R2 for photos. To run it: `pnpm install`, then `pnpm dev`.

## What it does

- Start an **experience** (a trip, a day out) and invite the people who were there with one-time links.
- Everyone adds their own **moments**: photos, a place, a note.
- **Story mode** plays it back in order, each leg drawn on a map.
- The **Journal** turns it into a scrapbook you can rearrange and export as a PDF.
- Private by default. Sharing is a link you switch on.

## Run it locally

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set ENCRYPTION_MASTER_KEY (openssl rand -base64 32)
pnpm dev                         # Convex + the app on http://localhost:3000
```

- The first `pnpm dev` asks you to create or link a Convex deployment.
- `pnpm dlx @convex-dev/auth` sets up the sign-in keys on it.

## Deploy

```bash
pnpm exec convex deploy
VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_APP_URL=https://<your site> pnpm build
pnpm exec wrangler deploy
```

First time? Settings, OAuth and the R2 bucket are in [docs/architecture.md](docs/architecture.md#deploy-and-ci).

## More

- [docs/user-guide.md](docs/user-guide.md): how to use it
- [docs/architecture.md](docs/architecture.md): how it works, settings, commands, what data leaves the app
- [convex/README.md](convex/README.md): the backend code
