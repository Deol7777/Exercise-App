# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based **workout logger**: a signed-in user records a training session as
an ordered list of exercises, each with sets of reps and weight, then reads it
back as progress over time. Multi-user from the first commit.

## Current state

Next.js 16 (App Router, React 19, Tailwind 4) with shadcn/ui components in
`src/components/ui/`. Note `--src-dir`: the App Router lives at `src/app/**`,
not `app/**`.

The full schema — Auth.js tables plus `exercises`, `workout_sessions`,
`session_exercises`, `sets` — is migrated onto a Neon project (`exercise-app`,
aws-us-west-2), and the global exercise catalog is seeded (60 rows).

**The authentication slice is built**: email/password registration and sign-in
on Auth.js v5 with a `jwt` session strategy, `POST /api/users`, the Auth.js
catch-all at `/api/auth/[...nextauth]`, `/sign-in`, `/sign-up`, and the
error-to-status mapping in `src/app/api/_lib/respond.ts`. `currentUserId()` in
`src/server/auth.ts` is how server code asks who is acting.

**The training write path is built**: `src/server/services/training.ts` and
`services/exercises.ts` over `db/queries/training.ts` and `queries/exercises.ts`,
the REST surface under `/api/workout-sessions`, `/api/exercise-entries`,
`/api/sets` and `/api/exercises`, and the `/log` screen that drives them. Two
domain rules live in the service layer, not the schema: only one workout session
may be in progress at a time, and `position` is assigned by the database as
`max(position) + 1` — never sent by the client.

**The read path is built**: `src/server/services/progress.ts` over
`db/queries/progress.ts` (personal records via `distinct on`, last performance,
weekly volume by muscle group), the `/api/progress/**` and
`/api/exercises/[id]/last-performance` endpoints, and the `/history`,
`/history/[id]` and `/progress` pages. The logging screen shows "last time" per
exercise from the same endpoint.

**Tests exist for the service layer**: Vitest against a local `postgres:17`
from `docker-compose.yml` on port **5433** — never Neon, and the suite refuses
to start against a non-localhost `DATABASE_URL`. `src/test/global-setup.ts`
migrates and seeds it; `src/test/setup.ts` empties the log before each test.
Tests live next to what they test: `src/server/services/*.test.ts` for the
domain rules, `src/app/api/routes.test.ts` for the HTTP contract (401/404/422,
status mapping, cross-user isolation) with `currentUserId` mocked.

**Display units are done**: `users.weight_unit` (`kg` | `lb`, migration
`0001_tidy_makkari`) with all conversion in `src/lib/weight.ts`, called from
components only. The database is still kilograms everywhere.

Still missing: **components are untested** and Playwright is chosen but not
installed. Sets cannot be reordered (exercise entries can).

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server. Turbopack is the default bundler in Next 16 — there is no flag. |
| `npm run build` | Production build, including a TypeScript pass. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest, once. Starts the Docker test database first via `pretest`. |
| `npm run test:watch` | Vitest in watch mode. Expects the container to be up already. |
| `npm run test:db:down` | Stop and remove the test database container. |
| `npx tsc --noEmit` | Types only, without building. On a fresh clone this fails with `Cannot find name 'LayoutProps'` until `npx next typegen` has run once — Next generates the route types. |
| `npx next typegen` | Regenerate the route/layout types under `.next/types`. |
| `npm run db:generate` | Write a new SQL migration from schema changes. Commit what it produces. |
| `npm run db:migrate` | Apply pending migrations. Uses the **direct** URL. |
| `npm run db:seed` | Seed the global exercise catalog. Idempotent. |
| `npm run db:studio` | Drizzle Studio against the current database. |
| `npm run db:push` | Pushes schema with no migration file. Local throwaway branches only — never a shared environment. |

Environment lives in `.env.local` (gitignored); `.env.example` names every key.
`DATABASE_URL` is the pooled Neon string and `DATABASE_URL_UNPOOLED` the direct
one — they are not interchangeable, and swapping them fails only under load.

`npm run dev` reads and writes the same Neon database as everything else — the
Docker Postgres is for the test suite only, and nothing else points at it.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), TypeScript |
| Styling / UI | Tailwind CSS, shadcn/ui + Radix |
| API style | REST route handlers under `app/api/**` |
| Database | PostgreSQL + Drizzle ORM (drizzle-kit migrations) |
| Auth | Auth.js v5, users in our own Postgres |
| Hosting | Vercel + Neon |
| Also | Zod (request validation, installed), TanStack Query (client server-state), Vitest + Playwright (tests), ESLint (installed) + Prettier |

Chosen but **not yet installed**: TanStack Query, Vitest, Playwright, Prettier.
Client components use plain `fetch` and `useState` until TanStack Query lands.
The Postgres driver is `pg` (node-postgres), not `@neondatabase/serverless`.

Biome was considered and deliberately not adopted.

## Invariants

Full detail in [docs/architecture.md](docs/architecture.md); these are the ones
that get broken by accident:

- **Identity comes from the server-side Auth.js session and nowhere else** —
  never from a request body, query parameter or path segment. Every training row
  is user-owned and every query is scoped by that id.
- **Layering:** route handler → domain service → data access. Handlers hold no
  SQL and no business rules; services know nothing about HTTP (no `Request`, no
  `Response`, no status codes — they throw typed domain errors).
- **No Server Actions.** REST route handlers are the only mutation surface.
  Server components may call a domain service directly, but never query the
  database inline.
- **Every request body is parsed by a Zod schema at the handler edge.**
- **Client components never import `src/server/**`.**
- **Weight is kilograms as `numeric`, always** — and the driver returns
  `numeric` as a *string*, so convert once in the data-access layer.
- **Catalog reads always filter `owner_id IS NULL OR owner_id = <session user>`.**
  Forgetting it leaks other users' custom exercises.

## Vocabulary

Check [docs/glossary.md](docs/glossary.md) before naming things. Two traps:
"session" is ambiguous (always qualify it *workout session* or *auth session*),
and an *exercise* is a catalog definition while an *exercise entry* is one
performance of it inside a session.

## Documentation contract

The docs directory is the project's memory, and the parts do not overlap.
Putting content in the wrong one is the main way this degrades.

**Committed to the repository:**

- **[docs/architecture.md](docs/architecture.md)** — present tense, *what is*.
  Rewritten in place; carries no history. Its `Known rough edges` section is the
  highest-value part and the one most often left empty — keep it honest.
- **[docs/glossary.md](docs/glossary.md)** — what words mean *here*. Check it
  before naming things.

**Local only, and deliberately never committed** — `.gitignore` excludes both,
so they exist on the author's machine and nowhere else. Keep writing them; just
never stage them, and never link to them from a committed file, because a clone
will not have them:

- **`docs/decisions/`** — *why*, append-only ADRs. Never rewrite an accepted
  one; supersede it with a new one and mark the old one superseded. Copy
  `0000-template.md` to start. Write one when reversing the decision would be
  expensive — framework, datastore, auth model, deployment target, a boundary in
  the code, or a deliberate departure from convention. Read the existing ADRs
  before proposing a change, so settled ground is not relitigated.
- **`docs/flows/`** — *how one path runs*, end to end. Named after the journey
  (`log-a-workout.md`), never after the code (`sessions-route.md`).

### Writing flows

Use the `/doc-flow` skill rather than freehand prose, right after a feature
lands that adds or changes a route, handler, background job or webhook — the
docs go stale otherwise, and the path has just been traced.

Its rules apply to hand-written flows too: trace by *opening every file* rather
than inferring a hop from its name; stop at external boundaries (note what
crosses, not what happens beyond); reference real symbols and paths only; keep
Mermaid participants to six or fewer *components*, not files; preserve
human-written `Gotchas` when updating in place; document what the code *does*,
not what it should do — if the code contradicts architecture.md, say so rather
than papering over it.

# Next.js writes and re-adds AGENTS.md on `next dev`; it points at the
# Next 16 docs vendored in `node_modules/next/dist/docs/`.
@AGENTS.md
