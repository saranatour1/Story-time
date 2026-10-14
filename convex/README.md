# convex/

Story-time's backend. Written for people and coding agents alike: start here,
then open the file the map points to. `convex/tests/layout.test.ts` checks the
rules below and fails if this map misses a file.

Read `convex/_generated/ai/guidelines.md` before writing Convex code.

## The layout

```
convex/
  api/        the API the app calls. Thin files that only re-export.
  model/      where functions are written, one file per feature.
  lib/        plain helpers. No Convex functions here.
  tests/      convex-test suites, one per feature.
  components/ local components (email, invites).
  schema.ts  convex.config.ts  auth.ts  auth.config.ts  http.ts  crons.ts
```

The split follows [ianmacartney/code-organization-pattern](https://github.com/ianmacartney/code-organization-pattern):
code is organized by feature in `model/`, and the public API is organized
for callers in `api/`, without losing jump-to-definition.

- **`model/<feature>.ts`** writes the queries, mutations and actions. Public
  ones are not exported one by one: they leave the file only inside one
  object, `export const momentsApi = { create, list, page, update, remove }`.
  Convex doesn't register functions inside an object, so they exist once,
  where `api/` re-exports them. Internal functions are exported directly and
  stay at `internal.model.<feature>.<name>`.
- **`api/<feature>.ts`** is one line: `export const { create, list, page, update, remove } = momentsApi;`.
  That is what registers them. Jump to definition goes `api/` → `model/` in
  one hop.
- **The root** keeps only the files Convex reads from there. `auth.ts` stays
  at the root too: `@convex-dev/auth` sets sign-in up from it, and the app
  reaches it as `authApi`.

## Calling things

| From                     | Public function                                                                                                                | Internal function                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| The app reading (`src/`) | `useQuery(queries.moments.list({ eventId }))`, with `useQuery` from `@tanstack/react-query` and `queries` from `@/lib/queries` | not reachable                      |
| The app writing (`src/`) | `useMutation(api.moments.create)`, with `api` from `@/lib/api`                                                                 | not reachable                      |
| Sign-in (`src/`)         | `authApi.signInAnonymous`, from `@/lib/api`                                                                                    |                                    |
| Backend code and tests   | `api.api.moments.list` (from `_generated/api`)                                                                                 | `internal.model.journal.makePages` |

`@/lib/api` is `api.api` from `_generated/api`, so the app never spells out the
folder. `@/lib/queries` wraps each public query the app reads as TanStack Query
options, so a page and its route's `loader` (which prefetches) share one live
cache entry. Lint rejects `useQuery` from `convex/react`. Paginated lists still
use `usePaginatedQuery` from `convex/react`.

## Adding a function

1. Write it in the feature's file in `model/` (or a new `model/<feature>.ts`).
2. Public: add its name to the file's `…Api` object, and to the matching
   `export const { … }` line in `api/<feature>.ts` (make that file if it's new).
   Internal: export it directly.
3. Check access first: `requireEventAccess(ctx, eventId, "viewer" | "contributor" | "owner")`
   from `lib/access.ts`. Encrypt anything a person wrote with `encryptText`
   (`lib/crypto.ts`), and log changes with `recordChange` (`lib/changes.ts`)
   in the same mutation.
4. A query the app reads: add it to `src/lib/queries.ts` under its feature,
   and prefetch it in the route's `loader` when the page needs it at once.
5. New feature file? Add it to the map below. `pnpm exec convex codegen`, then
   `pnpm typecheck`, `pnpm lint` and `pnpm test`.

## The map

### api/ (re-exports only)

`api/changes.ts`, `api/events.ts`, `api/guestNotes.ts`, `api/invites.ts`,
`api/journal.ts`, `api/media.ts`, `api/moments.ts`, `api/pdf.ts`,
`api/sessions.ts`, `api/share.ts`, `api/users.ts`, `api/ai/command.ts`,
`api/ai/enrich.ts`, `api/ai/title.ts`, `api/ai/voice.ts`. Each re-exports
the `…Api` object of the `model/` file with the same path.

### model/

| File                      | What it owns                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `model/events.ts`         | Experiences: create, rename, dates, the home list, delete (and the purge of everything in one).                 |
| `model/moments.ts`        | Moments: create, list, edit, delete. `createMoment` is the one insert every path uses.                          |
| `model/media.ts`          | Uploads (reserved by the Worker, then confirmed), avatars, who may download or delete, the upload sweep.        |
| `model/journal.ts`        | The journal: outline and pages, cutting pages for moments, saving, catching up, locks, stickers, link previews. |
| `model/pdf.ts`            | The password-locked PDF on the share link.                                                                      |
| `model/share.ts`          | The share link: switching it on, the book and pages it opens, its media, hiding photos, emailing it.            |
| `model/invites.ts`        | Invites: making, accepting, dismissing, invite emails.                                                          |
| `model/sessions.ts`       | Who has access to an experience, and revoking it.                                                               |
| `model/users.ts`          | Profile, settings, email confirmation, the memory reminder, and the users sign-in creates.                      |
| `model/aiBudget.ts`       | AI Budget's one-time setup (no prompts or responses kept) and a spend summary for the CLI.                      |
| `model/changes.ts`        | The Activity log, and its unread count.                                                                         |
| `model/guestNotes.ts`     | The guestbook invited people sign.                                                                              |
| `model/onThisDay.ts`      | The daily "a memory is waiting" email (opt-in).                                                                 |
| `model/migrations.ts`     | One-off data migrations, run from the CLI.                                                                      |
| `model/seed.ts`           | Dev only: `pnpm exec convex run model/seed:japan '{"userId":"..."}'`, a ten-day demo trip. Refuses production.  |
| `model/ai/command.ts`     | The box: a sentence becomes a plan to add, change or remove moments.                                            |
| `model/ai/voice.ts`       | Speech to text for the box. Nothing is stored.                                                                  |
| `model/ai/enrich.ts`      | Captions, transport and link titles after photos come in.                                                       |
| `model/ai/scribe.ts`      | What Haiku is told about a moment, and the caption it writes.                                                   |
| `model/ai/apply.ts`       | Writes AI suggestions into gaps only; what a person typed stays.                                                |
| `model/ai/decide.ts`      | Jev's quick decisions (transport between stops).                                                                |
| `model/ai/title.ts`       | "Try another" titles for a journal page. Only a suggestion.                                                     |
| `model/ai/unfurl.ts`      | Link titles and previews, reading only public pages.                                                            |
| `model/ai/publicFetch.ts` | Node action that fetches a public page, pinned to the addresses just checked.                                   |

### lib/ (helpers, no functions)

| File                  | What it is                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lib/access.ts`       | Who may do what on an experience (`requireEventAccess`).                                                         |
| `lib/actors.ts`       | Who is acting: a person, an AI working for one, or the system.                                                   |
| `lib/appUrl.ts`       | The web app's origins, from `APP_URL`.                                                                           |
| `lib/blocks.ts`       | Checking and encrypting a moment's blocks, stops, places and labels.                                             |
| `lib/changes.ts`      | `recordChange`, for the Activity log.                                                                            |
| `lib/cover.ts`        | Keeping the journal cover's name and dates in step with the trip.                                                |
| `lib/crypto.ts`       | Encryption under each experience's key.                                                                          |
| `lib/emailAddress.ts` | Whether email can be sent, and to which confirmed address.                                                       |
| `lib/geo.ts`          | Distances between places.                                                                                        |
| `lib/journal.ts`      | Journal page layouts and limits, shared with the app.                                                            |
| `lib/limits.ts`       | Every cap in one place.                                                                                          |
| `lib/monthDay.ts`     | A moment's month and day, where it happened.                                                                     |
| `lib/profile.ts`      | Cleaning profile fields.                                                                                         |
| `lib/publicWeb.ts`    | Which web addresses the server may open.                                                                         |
| `lib/rateLimit.ts`    | Per-person rate limits.                                                                                          |
| `lib/seeded.ts`       | Repeatable randomness from an id.                                                                                |
| `lib/sharedPdf.ts`    | Whether an upload is the journal's locked PDF.                                                                   |
| `lib/ai/budget.ts`    | AI Budget: `metered()` records each AI call's model, person, feature, tokens and cost. Dashboard at `/aibudget`. |
| `lib/ai/generate.ts`  | Structured output from Haiku, with a JSON fallback.                                                              |
| `lib/ai/models.ts`    | Which models the AI features use.                                                                                |
