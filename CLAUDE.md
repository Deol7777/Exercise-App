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
aws-us-west-2), and the global exercise catalog is seeded (71 rows).

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

**Routines are built**: `routines` and `routine_exercises` (migration
`0004_serious_sumo`), `src/server/services/routines.ts` over
`db/queries/routines.ts`, the REST surface under `/api/routines` and
`/api/routine-exercises`, and the `/routines` and `/routines/[id]` screens that
drive them. A *routine* is a reusable named list of exercises — a plan, not a
record; check `docs/glossary.md` before reaching for the word "session" for one.
Starting one **copies** its exercises into a new workout session and nothing
links them afterwards, so editing a routine cannot rewrite history. A **Start
routine** link on the home screen and `/log` opens `/routines/start`, one card
per routine, and tapping a card is what starts it — there is no start control on
`/routines` itself. Starting goes through the same `POST /api/workout-sessions`
as a plain start (with a `routineId`), so both share the one-open-session
guard. `/browse` was a
placeholder and is gone; the tab is now Routines.

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

**Colour is themed**: six palettes (`rose` the designed default, `rose-dark`,
`ink`, `forest`, `cobalt`, `court`), listed in `src/lib/theme.ts`, stored on
`users.theme` (migration `0003_complex_tomorrow_man`), chosen in Settings and
applied by the root layout as `data-theme` on `<html>` — plus the `dark` class
for the two dark ones, which is what shadcn's `dark:` utilities key on. A theme
is a block of role-token values in `globals.css` and nothing else: no selector
below `:root` names a component, and a component that hard-codes a colour is
right in one theme and wrong in five (ADR 0017). Reading the theme in the layout
makes every route request-rendered.

**End-to-end tests exist**: Playwright journeys in `e2e/` — signing up and
logging a workout, correcting a set and switching to pounds, one user's log
staying away from another, account deletion, and building a routine and starting
it (`e2e/routines.spec.ts`). They run a real server on port 3100 pointed at the Docker
database, and are the only place Auth.js itself is exercised.

**Accounts can be deleted**: `DELETE /api/users/me`, a hard delete in one
transaction in foreign-key order (training data → custom exercises → user),
confirmed by typing the email. Signed-in pages resolve the session through
`src/app/_lib/require-account.ts`, because a JWT can outlive its account.

**The logging screen runs on TanStack Query** (ADR 0014): server components
render the first paint and pass `initialData`, mutations invalidate the two keys
in `src/lib/queries.ts`, and logging, editing, deleting a set and reordering are
optimistic. An unsaved row renders "saving…" with its controls disabled — an
end-to-end test that asserts on the DOM alone will pass before the write lands.

**Sign-in is throttled**: ten failed checks per email per fifteen minutes,
counted in `sign_in_attempts` (migration `0002_grey_gargoyle`) and enforced
inside `verifyCredentials`, so every caller gets it. Throttled, wrong password
and unknown address are deliberately indistinguishable. `BCRYPT_COST` is 4 under
`NODE_ENV=test` and 12 everywhere else.

Still missing: **no component-level test runner** (no jsdom, no Testing
Library), so components off the end-to-end paths are verified by hand. Sets
cannot be reordered (exercise entries and routine exercises can). The exercise
catalog has no screen of its own — it is reachable only through the two pickers
that add an exercise to something.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server. Turbopack is the default bundler in Next 16 — there is no flag. |
| `npm run build` | Production build, including a TypeScript pass. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest, once. Starts the Docker test database first via `pretest`. |
| `npm run test:watch` | Vitest in watch mode. Expects the container to be up already. |
| `npm run test:e2e` | Playwright. Starts its own `next dev` on port 3100 against the test database. Needs `npx playwright install chromium` once. |
| `npm run test:db:down` | Stop and remove the test database container. |
| `npx tsc --noEmit` | Types only, without building. On a fresh clone this fails with `Cannot find name 'LayoutProps'` until `npx next typegen` has run once — Next generates the route types. |
| `npx next typegen` | Regenerate the route/layout types under `.next/types`. |
| `npm run db:generate` | Write a new SQL migration from schema changes. Commit what it produces. |
| `npm run db:migrate` | Apply pending migrations. Uses the **direct** URL. |
| `npm run db:seed` | Seed the global exercise catalog. Idempotent. |
| `npm run db:seed:demo` | Fill one account with a year of generated training, for looking at `/progress`. Writes to Neon; refuses an account that already has sessions unless `--replace` (which deletes that user's whole log). |
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
