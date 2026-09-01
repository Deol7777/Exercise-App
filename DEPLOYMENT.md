# Deployment

How to change this code base and get the change live. Longer local-setup detail
lives in [docs/how-to-start-and-stop.md](docs/how-to-start-and-stop.md).

## The pieces

| Piece | Where | Notes |
| --- | --- | --- |
| App | Vercel project `gurnoor4/exercise-app`, region `pdx1` | https://exercise-app-jade.vercel.app |
| Database | Neon (`exercise-app`, aws-us-west-2) | **One database.** `npm run dev` and production share it. |
| Test database | Docker Postgres, port 5433 | Tests only. Never Neon. |

There is no staging database. A row you write at localhost:3000 is a production row.

## Making a change

```bash
./scripts/setup.sh          # fresh clone, once: install deps, write .env.local scaffolding
./scripts/start.sh          # dev server on http://localhost:3000 (= npm run dev)
./scripts/stop.sh           # stop dev server + test database
```

Before pushing:

```bash
npm run lint                # ESLint, incl. the feature-boundary rules
npx tsc --noEmit            # types only (run `npx next typegen` once on a fresh clone first)
npm run build               # production build + TypeScript pass
./scripts/test.sh           # both suites (--unit for Vitest only, --e2e for Playwright only)
npm test                    # Vitest alone; starts the Docker DB via pretest
npm run test:e2e            # Playwright alone; needs `npx playwright install chromium` once
npm run test:db:down        # stop and remove the test database container
```

### If the change touches the schema

```bash
npm run db:generate         # write the migration SQL from the schema change — commit it
npm run db:migrate          # apply it (uses DATABASE_URL_UNPOOLED, the direct string)
npm run db:seed             # reseed the global exercise catalog; idempotent
npm run db:studio           # browse the database
```

`db:migrate` hits Neon — the same database production reads. **The deploy does
not run migrations.** Apply the migration *before* deploying code that expects
it, so the two are never out of order. Never `npm run db:push` against Neon; it
skips the migration file and is for throwaway local branches only.

### If the change touches icons or mascots

```bash
npm run icons               # favicon, Apple touch icon, manifest PNGs from assets/
npm run mascots             # public/mascots/ from the fifteen drawings in assets/
```

Nothing regenerates these at build time — commit what the scripts write.

## Deploying

**A push deploys.** `Deol7777/Exercise-App` is connected to the Vercel project and
the production branch is `main`.

| Push to… | Result |
| --- | --- |
| `main` | production deploy → https://exercise-app-jade.vercel.app |
| any other branch, or a PR | preview URL; nothing public changes |

Every push builds — no ignored-build-step is configured.

Deploying by hand still works, for pushing the live URL forward without a commit:

```bash
vercel                      # preview URL — nothing public changes
vercel --prod               # build and deploy to the live URL
vercel logs <url>           # what the running app printed
vercel inspect <url>        # build log and status for one deployment
vercel rollback <url>       # point production back at an older deployment
```

Checking the wiring:

```bash
vercel git connect --yes    # "already connected to your project" = linked
vercel git disconnect       # turn auto-deploy off again
```

The production branch is not printed by any CLI command — read it in the
dashboard at Project → Settings → Git → Production Branch.

**Order for a schema change: `npm run db:migrate` first, then push.** The deploy
runs no migrations, so pushing first puts new code on the old schema.

## Environment

Local values live in `.env.local` (gitignored); `.env.example` names every key.
Production values live in the Vercel project, not in any file.

```bash
vercel env ls                       # what is set, without revealing values
vercel env add NAME production      # add or replace one; value read from stdin
vercel env pull .env.local          # copy the cloud values down (overwrites the file)
```

`DATABASE_URL` (pooled, host has `-pooler`) and `DATABASE_URL_UNPOOLED` (direct)
are not interchangeable — swapping them fails only under load. `AUTH_SECRET` is
deliberately a **different** value in the cloud, so a localhost session cookie is
not valid in production. `AUTH_URL` is unset; Auth.js reads the deployment origin.
