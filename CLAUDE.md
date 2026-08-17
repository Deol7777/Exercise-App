# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based **workout logger**: a signed-in user records a training session as
an ordered list of exercises, each with sets of reps and weight, then reads it
back as progress over time. Multi-user from the first commit.

## Current state

The stack is decided (ADRs 0002–0006) but **no application code exists yet** —
no package manifest, no source tree, and no VCS (`git init` has not been run).
There are therefore no build, lint or test commands to document; add a
`## Commands` section here as soon as the project is scaffolded.

The first slice is authentication plus the session → exercise entry → set write
path.

## Stack

| Concern | Choice | ADR |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | [0002](docs/decisions/0002-nextjs-typescript-tailwind-shadcn.md) |
| Styling / UI | Tailwind CSS, shadcn/ui + Radix | [0002](docs/decisions/0002-nextjs-typescript-tailwind-shadcn.md) |
| API style | REST route handlers under `app/api/**` | [0003](docs/decisions/0003-rest-route-handlers-as-api.md) |
| Database | PostgreSQL + Drizzle ORM (drizzle-kit migrations) | [0004](docs/decisions/0004-postgres-with-drizzle.md) |
| Auth | Auth.js v5, users in our own Postgres | [0005](docs/decisions/0005-authjs-with-owned-user-table.md) |
| Hosting | Vercel + Neon | [0006](docs/decisions/0006-vercel-and-neon.md) |
| Also | Zod (request validation), TanStack Query (client server-state), Vitest + Playwright (tests), ESLint + Prettier | |

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

The docs directory is the project's memory, and the three parts do not overlap.
Putting content in the wrong one is the main way this degrades:

- **[docs/architecture.md](docs/architecture.md)** — present tense, *what is*.
  Rewritten in place; carries no history. Its `Known rough edges` section is the
  highest-value part and the one most often left empty — keep it honest.
- **[docs/decisions/](docs/decisions/)** — *why*, append-only. Never rewrite an
  accepted ADR; supersede it with a new one and mark the old one
  `Superseded by [ADR-XXXX](XXXX-title.md)`. Copy `0000-template.md` to start.
  Write one when reversing the decision would be expensive — framework,
  datastore, auth model, deployment target, a boundary in the code, or a
  deliberate departure from convention. Read the existing ADRs before proposing
  a change, so settled ground is not relitigated.
- **[docs/flows/](docs/flows/)** — *how one path runs*, end to end. Named after
  the journey (`log-a-workout.md`), never after the code
  (`sessions-route.md`). None exist yet.

Architecture.md currently carries a "designed, not yet built" banner and
_(planned)_ markers. Convert those to plain description as code lands, and
delete the banner once the first slice ships.

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
