<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Where things are in convex/

Start at [`convex/README.md`](convex/README.md): the layout, how to call things and add a function, and a map of every file. In short, functions are written in `convex/model/`, the app's API is the thin re-export files in `convex/api/` (called as `api.moments.list` with `api` from `@/lib/api`), helpers live in `convex/lib/`, and `convex/tests/layout.test.ts` keeps it that way. The app reads through TanStack Query: `useQuery(queries.moments.list({ eventId }))` with `queries` from `@/lib/queries`, and route loaders prefetch the same options.
