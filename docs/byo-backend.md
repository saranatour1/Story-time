# Bring your own backend: rules

Status: proposal. Nothing here is built. Written 2026-10-11 against master 38b890c.

The idea: a person runs their own Convex deployment and their own file storage. This website becomes a front door that serves the app and nothing else. Their data, their keys, their bills.

The hosted setup (`strong-stoat-772` plus the `story-time-media` R2 bucket) keeps working exactly as it does today. These rules exist to make sure of that.

## What "front door" means

The front door is the static app plus a Worker. In bring-your-own mode (BYO):

- The browser talks straight to the person's Convex deployment.
- The browser sends and fetches photos straight to and from their storage.
- The Worker never sees a session token, a photo, a key, or the deployment's data.
- The front door stores nothing about them. Not an account, not a pointer, not a log line with their deployment name.

## Rules that protect the hosted setup

1. **Hosted is the default and takes the same code path as today.** With no BYO configuration present, every request, link and screen behaves as it does now. BYO is opt-in, per browser.
2. **One backend, two homes.** BYO deployments run this repo's `convex/` folder as is. No fork, no `if (byo)` inside a query or mutation. Differences live in environment variables and in which deployment the code is pushed to.
3. **Additive changes only.** New optional env vars, new HTTP routes, new optional fields. No renamed or removed fields, no changed function signatures, no tightened validators on existing tables. Widening or renaming `media.r2Key` waits for its own migration, later.
4. **The existing test suite passes untouched** before any BYO work merges (314 tests today). New code gets new tests. CI keeps exercising the hosted path.
5. **Ship dark.** BYO UI sits behind a build flag (`VITE_BYO_ENABLED`), off in production until the checks in "Gates" pass.
6. **Dev before prod.** The dev deployment `diligent-armadillo-667` is the first BYO target. A second, throwaway Convex project plays the part of "someone else's deployment".

## Choosing the backend at runtime

Today `VITE_CONVEX_URL` is baked into the build and read in three places: `src/router.tsx`, and `convexAs` and `convexAnonymous` in `src/server/r2.ts`.

- **One function decides.** `resolveBackend()` returns `{ mode, convexUrl, siteUrl }`. Hosted returns the baked values. BYO returns a validated URL from `localStorage`. Everything that read `VITE_CONVEX_URL` in the browser goes through it.
- **The Worker stays hosted-only.** It keeps using the baked URL and never accepts a backend URL from a request, a header or a link. Otherwise it becomes an open proxy. In BYO mode the browser never calls `/api/upload`, `/api/media/*` or `/api/events/*`, and a test asserts it.
- **Only real Convex addresses.** A backend URL must match `https://<name>.convex.cloud`. Then the app calls `GET <site>/story-time/info` and expects `{ app: "story-time", contract: <number> }`. Anything else is refused. That route needs CORS headers (it is public and holds nothing private).
- **The pointer lives only in the browser.** `localStorage` holds the deployment URL. It is never sent to my deployment or the Worker.
- **Sessions never mix.** Auth storage is namespaced by deployment URL. Signing out of one backend leaves the other signed in. Switching backend clears the in-memory media cache in `use-media-url.ts` and the router's query cache.
- **A contract number guards versions.** The web app and a backend each carry an integer. A backend that is older than the app's minimum shows "your backend needs an update" with the deploy command. A backend that is newer shows "refresh the app". The number changes only for breaking changes, and the app keeps accepting the previous number for at least 60 days.

## Links

Share and invite links keep their form so old links never break.

- Hosted: `/s#<token>` and `/invite#<token>`, exactly as now.
- BYO: `/s#<token>@<deployment-name>` and `/invite#<token>@<deployment-name>`. Tokens are base64url, which never contains `@`, so a link with no `@` is hosted.
- The deployment name sits in the fragment, so it never reaches a server log, the same reason the token does.
- A BYO deployment builds these links with an optional env var, `LINK_DEPLOYMENT` (its own name). Hosted leaves it unset, so hosted links don't change.
- `APP_URL` on a BYO deployment lists the front door's origin (and any custom domain). It is the only coupling, and it is how sign-in knows where to return.
- Opening a BYO link shows a one-line notice: "This story is stored on its owner's own server (<name>)." Sign-in on a backend reached through a link goes through a confirm step that names the deployment first.

## Sign-in

Two different things share the word "Convex":

- **Provisioning identity** is Convex's OAuth for third-party apps. It gives the front door a token to manage a person's Convex team or project. It is not a login for the people using their app.
- **App sign-in** stays what it is today: Convex Auth on the deployment, with GitHub and Google. In BYO each deployment runs its own, with its own `AUTH_PRIVATE_KEY`, `AUTH_JWKS` and its own GitHub and Google OAuth apps. The callbacks are `https://<name>.convex.site/oauth/{github,google}/callback`. `convex.config.ts` already reads all of these from env, so no code changes.

Invitees to a BYO story create an account on the owner's deployment. The Data & privacy page says so.

## Storage

Three homes for photos, picked per deployment:

| Home | Who runs it | Notes |
| --- | --- | --- |
| Hosted R2 | me | Today's path. Worker applies SSE-C with a key derived from the master key. Unchanged. |
| Convex file storage | the person's Convex team | BYO default. Nothing extra to set up. |
| Their own R2 or S3 bucket | the person | Credentials live in their Convex env. Browser uses presigned URLs. Needs CORS for the front door's origin. |

Rules:

- **A storage interface sits behind `convex/model/media.ts`**: reserve, confirm, read, delete. Rows get an optional `backend` field (`"hosted-r2"` when absent, `"convex"`, `"s3"`). Existing rows are valid as they are. The backend's opaque key is stored in `r2Key` for now (rule 3).
- **In BYO the Worker touches no bytes and no keys.** Today the Worker holds `ENCRYPTION_MASTER_KEY` to apply SSE-C. In BYO that key lives only in the person's Convex env. Photos are encrypted in the browser (AES-GCM) with a per-experience key that the person's Convex hands to signed-in members and to holders of a valid share link. Viewers decrypt in the browser.
- **Same limits as now.** 5 MB photos, 50 MB videos, 2 MB profile images, the per-person caps in `convex/lib/limits.ts`. Convex re-checks size and type before any bytes move, as `reserveUpload` does today.
- **EXIF stripping stays client-side and stays before encryption.**
- **Deleting an experience deletes its files** in whichever home holds them.

## Keys

- The master key and the auth keys are generated where the deployment is set up (their browser, their machine, or their build runner). They are set on their deployment and **never sent to the front door**, never logged, never put in a URL.
- Losing `ENCRYPTION_MASTER_KEY` loses every photo and note. The setup flow shows a recovery copy once and says so plainly. There is no recovery on my side by design.

## Provisioning

What Convex allows, from its docs:

- An OAuth application (registered in the Convex dashboard) gets a team-scoped or project-scoped token. It can create projects and deployments. An unverified app can be authorized by up to 100 teams.
- The Management API can create a deploy key.
- **Pushing code is done with the Convex CLI** (`CONVEX_DEPLOY_KEY=… npx convex deploy`), which needs a shell and a file system. A browser or a Worker can't bundle and push the backend.

So there are three ways in, built in this order:

1. **Paste a URL.** The person deploys the repo to their own Convex project with one command (we document it), sets their env vars, and pastes the URL into Settings. No OAuth, no runner. This is the whole first release.
2. **Connect with Convex.** OAuth with PKCE and a project-scoped token. A short-lived build runner (a GitHub Action in their own fork, or an ephemeral sandbox) pushes the code. Needs the OAuth app registered, then verified past 100 teams.
3. **Fully managed.** Convex has a platforms contact (platforms@convex.dev) for this. Out of scope until 1 and 2 have users.

Rules for 2:

- Convex tokens and deploy keys are never stored at rest by me. They live in memory or in the runner's secret store for the length of the setup, then are dropped.
- Ask for the smallest scope: project, not team, unless they want me to create the project.
- The deploy key goes to the runner and nowhere else.
- **Never use my own team's access token to create other people's deployments.** Convex's "managing your own projects" path puts every project in my team, so their data would sit in my account and the whole point of BYO is lost. It also ties each dev deployment to the token's owner, and those are deleted if that person leaves the team. Users' projects are created only through the OAuth path, in their team.
- **BYO deployments are production deployments.** Pushing uses `npx convex deploy` (prod), not `convex dev --once`. A dev deployment belongs to one team member and disappears with them, which is wrong for someone's photo archive.
- **The runner needs a shell and a file system**, per Convex's own guidance, since the CLI bundles and pushes the code. A Worker can't be the runner.

## Costs and "their own plans"

I read "subs" as their own plans and bills: Convex usage, storage, the AI gateway and email land on their accounts. If you meant something else, change this section.

- **AI fill-ins** use the Convex AI Gateway on their team. If their plan has none, enrichment fails quietly and the moment is still saved, which is how failures behave today.
- **Invite emails** need `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN` and `EMAIL_FROM`, all optional already. Without them, invites are copy-link only.
- **Limits** (the 120 AI fill-ins an hour, 50 waiting invites, upload caps) are per deployment. The owner can change the numbers on their own deployment.

## What the Data & privacy page must say

The page's copy depends on the mode and never claims something that isn't true for the one in use.

- Hosted: the page as it is today.
- BYO: your data is in your Convex deployment and your storage. This website serves the app and sees your IP address like any website. It does not see your stories, photos, keys or session.
- In both modes the browser still calls photon.komoot.io, OpenStreetMap routers and map tiles. Those stay listed.

## Gates before BYO goes on in production

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass with BYO off, and the built hosted bundle behaves as before.
2. A second Convex project, deployed from this repo, passes the full loop from the front door: sign in, add moments with photos, play the story, create a share link and open it in a private window, send and accept an invite.
3. A hosted account and a BYO account stay signed in side by side in one browser.
4. The Worker rejects any attempt to point it at another backend, and BYO mode makes zero requests to `/api/*`.
5. A non-Convex URL, and a Convex URL that isn't a Story-time backend, are both refused.

## Build order

0. **No behavior change.** `resolveBackend()`, the `/story-time/info` route and contract number, link parsing for `@name`, tests. Hosted only.
1. **Paste a URL**, Convex storage, browser-side encryption, the deploy guide, Data page copy.
2. **Connect with Convex** provisioning.
3. **Their own R2 or S3 bucket.**

Later, separately: an export from hosted and an import into BYO, so someone can move without losing anything.

## To check before building

- The upload size limits of Convex's upload URLs, for 50 MB videos.
- Whether a project-scoped OAuth token can call "Create deploy key". Convex's guide says the deploy key comes from that API and that any token from the OAuth path can call the Management API, so it likely can, but confirm the permission on a test project.
- Whether the AI Gateway works on every plan.
- The default auth storage namespace in `@convex-dev/auth/react`, and whether it already isolates two deployments.
