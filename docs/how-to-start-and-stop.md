# How to start and stop

Everything you need to run this app on your own machine, in plain English.

Keep this file up to date. If a new piece is added — a queue, a cache, a worker,
a second database, an external service — add a row to the table below and a
section explaining how to start and stop it.

## The short version

| I want to… | Command |
| --- | --- |
| Set up a fresh clone (once) | `./scripts/setup.sh` |
| Work on the app | `./scripts/start.sh` |
| Stop everything | `./scripts/stop.sh` |
| Run the tests | `./scripts/test.sh` |

## The pieces

There are five. Only two of them need starting for normal work, and one of those
lives in the cloud and starts itself.

| Piece | Where it runs | Port | Do I start it? |
| --- | --- | --- | --- |
| Next.js app (web pages + API) | Your machine | 3000 | Yes |
| Neon Postgres (the real database) | Neon's cloud | — | No, it wakes itself |
| Docker Postgres (test database) | Your machine, in Docker | 5433 | Only for tests |
| Playwright's own Next.js server | Your machine | 3100 | No, the test run starts it |
| Drizzle Studio (database browser) | Your machine | 4983 | Only when you want it |

### 1. The Next.js app

This is the thing you look at in a browser. It serves the pages and the API
routes, and it reads and writes the Neon database.

Start it:

```bash
./scripts/start.sh
```

Then open http://localhost:3000.

Stop it: press `Ctrl+C` in that terminal. If you closed the terminal and it is
still running, `./scripts/stop.sh` will find it and stop it.

The script refuses to start if port 3000 is already taken, if `node_modules` is
missing, or if `.env.local` is missing. Each of those tells you what to do next.

Behind the script it is just `npm run dev`. Turbopack is the default bundler in
Next 16, so there is no flag for it.

### 2. Neon Postgres — the real database

The app's data lives in a Neon Postgres database in the cloud, not on your
machine. **There is nothing to start.** It scales to zero when idle and wakes up
on the first query, so the first page load after a quiet period is slower.

What it needs is `.env.local`, which is not in git. `./scripts/setup.sh` creates
it from `.env.example` if it is missing, and then stops so you can fill in:

- `DATABASE_URL` — the **pooled** connection string. Its host contains
  `-pooler`. The running app uses this one.
- `DATABASE_URL_UNPOOLED` — the **direct** connection string. Same host without
  `-pooler`. Migrations use this one.
- `AUTH_SECRET` — signs the sign-in cookie. Generate one with `npx auth secret`.

These two connection strings are not interchangeable. Swapping them appears to
work and then fails under load.

#### Which database is my app actually using?

Neon — for `npm run dev`, `npm run build` and `npm start` alike. All three read
`.env.local`, and `.env.local` holds the Neon strings. There is no separate
development database.

| Command | Database it uses |
| --- | --- |
| `npm run dev` (`./scripts/start.sh`) | **Neon**, via `DATABASE_URL` in `.env.local` |
| `npm run build` | **Neon**, same string — a build that prerenders a page runs its queries for real |
| `npm start` (serves the build locally) | **Neon**, same string |
| `npm run db:migrate` / `db:seed` / `db:studio` | **Neon**, via `DATABASE_URL_UNPOOLED` |
| `npm test`, `./scripts/test.sh` | **Docker Postgres on 5433** — never Neon |
| `npm run test:e2e` | **Docker Postgres on 5433** — Playwright overrides the strings for its own server |
| Deployed on Vercel | **Neon**, from Vercel's environment variables |

So a row you create while clicking around at localhost:3000 is a real row in the
same database the deployed app reads. Only the two test commands are isolated,
and they are isolated because Playwright and Vitest set the connection string
themselves — not because of anything in `.env.local`.

### 3. Docker Postgres — the test database

A throwaway Postgres in Docker on port **5433** (not 5432, so it cannot collide
with a Postgres you already had installed). Tests run against this and never
against Neon — the suite refuses to start if the connection string is not
localhost.

You do not normally start it by hand. `./scripts/test.sh` starts it, and so does
`npm test` through its `pretest` hook. To start it on its own:

```bash
docker compose up -d --wait      # or: ./scripts/start.sh --with-test-db
```

Stop it:

```bash
docker compose down              # or: ./scripts/stop.sh
```

It stores its data in memory, so stopping it throws away everything in it. That
is on purpose. Each test run migrates and seeds it again from scratch.

Docker Desktop itself has to be running first. `./scripts/test.sh` checks and
says so if it is not.

### 4. Playwright's Next.js server

The end-to-end tests need a real browser talking to a real server, so Playwright
starts its own copy of the app on port **3100** pointed at the Docker database,
and shuts it down when the run finishes. Port 3100 rather than 3000 means your
normal dev server can stay running while the tests go.

You never start or stop this yourself. Just leave port 3100 free —
`./scripts/test.sh` checks that it is.

One-time, before the first end-to-end run: `npx playwright install chromium`
(`./scripts/setup.sh` does this for you).

### 5. Drizzle Studio — the database browser

Optional. A web UI for looking at rows in whichever database `.env.local` points
at, which is Neon. Handy for checking what actually got written.

```bash
npm run db:studio                # or: ./scripts/start.sh --with-studio
```

It opens at https://local.drizzle.studio and talks to port 4983 on your machine.
Stop it with `Ctrl+C`, or `./scripts/stop.sh`.

## Running the tests

```bash
./scripts/test.sh          # both suites
./scripts/test.sh --unit   # Vitest only — services and route handlers
./scripts/test.sh --e2e    # Playwright only — three real browser journeys
```

The script starts the Docker database, runs what you asked for, and leaves the
container up so the next run does not pay for the cold start. Stop it with
`./scripts/stop.sh` when you are done for the day.

## Changing the database schema

Not a running piece, but it is the other multi-step thing:

```bash
npm run db:generate   # write a migration file from your schema changes
npm run db:migrate    # apply it to Neon
```

Commit whatever `db:generate` produced. Never use `npm run db:push` against
Neon — it changes the schema with no migration file to show for it.

## When something will not start

| Symptom | What is wrong |
| --- | --- |
| "Something is already listening on port 3000" | An old dev server. Run `./scripts/stop.sh`. |
| "node_modules is missing" / ".env.local is missing" | Run `./scripts/setup.sh`. |
| "Docker is not running" | Start Docker Desktop, then try again. |
| "Refusing to run tests against …" | The test database is not up. `docker compose up -d --wait`. |
| `Cannot find name 'LayoutProps'` from `npx tsc --noEmit` | Route types have not been generated. Run `npx next typegen` once. |
| Sign-in redirects to the wrong address | Set `AUTH_URL` in `.env.local`. |
| First page load is slow after a break | Neon woke from scale-to-zero. Normal. |
