# Exercise

Exercise is a multi-user workout logger. Sign in, record an ordered workout of
exercises and sets, build reusable routines, and review progress over time.

It is a Next.js 16 App Router application using React 19, TypeScript, Tailwind
CSS, Auth.js, Drizzle/Postgres (Neon in development and production), TanStack
Query, Vitest, and Playwright.

## Start here

The project documentation is intentionally split by purpose:

| Need | Read |
| --- | --- |
| Architecture, system boundaries, data model, and known rough edges | [docs/architecture.md](docs/architecture.md) |
| Where new files belong and dependency rules | [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) |
| Domain terms | [docs/glossary.md](docs/glossary.md) |
| Running the app, tests, database tools, icons, and mascots | [docs/how-to-start-and-stop.md](docs/how-to-start-and-stop.md) |
| Deployment | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Detailed implementation context and working conventions | [CLAUDE.md](CLAUDE.md) |

`CLAUDE.md`, `FOLDER_STRUCTURE.md`, and `docs/architecture.md` are the key
context files for coding changes. The latter two are the sources of truth for
architecture and file placement.

## Quick start

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Neon/Auth.js values.
3. Start the app with `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000).

The development server uses the Neon database configured in `.env.local`.
Docker Postgres is used exclusively for the automated test suite.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the development server |
| `npm run lint` | Run ESLint, including architectural import-boundary checks |
| `npx tsc --noEmit` | Type-check without building |
| `npm test` | Start the local Docker test database and run Vitest |
| `npm run test:e2e` | Run Playwright journeys against a real local server |
| `npm run build` | Create a production build |
| `npm run db:generate` | Generate a Drizzle migration after schema changes |
| `npm run db:migrate` | Apply migrations using the direct database connection |
| `npm run db:seed` | Seed the global exercise catalog |
| `npm run icons` | Regenerate committed app-icon build assets |
| `npm run mascots` | Regenerate committed mascot build assets |

On a fresh checkout, run `npx next typegen` once before a standalone TypeScript
check if Next's generated route types are absent.

## Architectural guardrails

- Keep routes thin: route handler → domain service → data access.
- Do not use Server Actions; REST route handlers are the mutation surface.
- Keep feature UI in `src/features/<feature>/`; shared UI belongs in
  `src/components/` and shared code in `src/lib/`.
- Features must not import from one another, and client components must never
  import `src/server/**`.
- Derive identity from the server-side Auth.js session only. All user-owned
  data access must be scoped to that user.
- Persist weights in kilograms; convert display units only at the UI boundary.

See the linked architecture documents for the full rules and exceptions.
