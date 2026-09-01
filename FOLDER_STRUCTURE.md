# Project Architecture & Folder Structure

> **Instructions for AI assistants:** This file is the source of truth for where code
> lives in this repository. Before creating a new file, follow the decision tree in
> "Where does this file go?". Before finishing a task, run the "Review checklist".
> If a change cannot be made without violating a rule here, say so instead of
> silently breaking the rule.

This describes a Next.js App Router project with a server-side domain layer.
Sections 1–9 are the rules; section 10 lists the features that exist today.

---

## 1. Core principle

**Group by feature, not by file type.**

A flat `components/`, `hooks/`, and `utils/` folder works until roughly ten features,
then it stops scaling: unrelated things pile up in the same folder and nothing tells
you which parts belong together. Most client code therefore lives in
`src/features/<feature>/`, and the top-level technical folders hold only genuinely
shared code.

---

## 2. Top-level layout

```
src/
├── app/          # Routing layer ONLY (see section 3)
├── features/     # Most client application code lives here
├── components/   # Shared, generic UI used by 2+ features
├── hooks/        # Shared hooks used by 2+ features
├── lib/          # Shared client/isomorphic code: fetch client, formatting,
│                 #   units, validation schemas, API contract types
├── server/       # Server-only domain layer (see section 3.1)
├── types/        # Ambient/global type declarations
└── testing/      # Test setup, factories, global setup
```

Not every folder has to exist. Create one when there is something to put in it —
do not scaffold empty folders. `hooks/` does not exist yet; add it when a hook is
used by a second feature.

### Inside a feature

```
src/features/<feature>/
├── api/          # Request functions + query/mutation hooks for this feature
├── components/   # Components scoped to this feature
├── hooks/
├── types.ts
└── utils/
```

Same rule: include only the folders the feature actually needs. Today every feature
is `components/` alone, except `progress`, which also has `utils/`.

### Why so much still lives in `lib/`

`lib/` is not a junk drawer here — everything in it is imported by at least two
features, or by `src/server/**` as well as the UI, which by rule 3 of the decision
tree makes it shared:

| Module | Why it is shared, not feature-scoped |
| --- | --- |
| `lib/api.ts`, `lib/queries.ts` | The fetch client and TanStack Query keys — used by `training`, `routines` and `account`. |
| `lib/types/*.ts` | The REST contract's shapes. A client component may not import `src/server/**`, so these are the seam between server and UI, read by routes, features and services. |
| `lib/validation/*.ts` | Zod schemas used by `src/app/api/**` route handlers and by `src/server/auth.ts`. |
| `lib/weight.ts`, `lib/theme.ts`, `lib/muscle-groups.ts`, `lib/range.ts`, `lib/month.ts`, `lib/time-zone.ts` | Domain vocabulary and pure arithmetic shared by the UI and the server layer. |
| `lib/prebuilt-routines.ts` | Static content read by both `features/routines` and `src/server/services/routines.ts`. |
| `lib/format.ts`, `lib/utils.ts`, `lib/mascots.ts` | Presentation helpers used app-wide. |

Do not move one of these into a feature to "tidy up": `src/server/**` may not import
from `src/features/**` (rule 5.2), so the move would break the boundary that matters.

---

## 3. Routing layer — Next.js App Router

`app/` is for routing only: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`,
`route.ts`, and thin composition of feature components. Business logic, data access,
and non-trivial UI belong in `features/` or `server/`.

```
src/app/
├── layout.tsx
├── page.tsx                # Home
├── _lib/                   # Route-layer helpers (session, preferences, theme)
├── api/
│   ├── _lib/               # HTTP-layer helpers (respond, params)
│   └── <resource>/route.ts
├── sign-in/ , sign-up/
└── (tabs)/                 # Route group — the signed-in shell with the tab bar
    ├── layout.tsx
    ├── workout/ , history/ , progress/ , routines/ , settings/
```

Conventions:

- **Route groups `(name)`** organize routes and let a subset share a layout without
  changing the URL. `(tabs)` is the signed-in shell.
- **Private folders `_name`** opt a folder and its subfolders out of routing.
  `app/_lib/` and `app/api/_lib/` hold routing- and HTTP-layer concerns only —
  `requireAccount`, param parsing, error-to-status mapping.
- **Do not** put feature code in private folders inside `app/`. It fragments the
  feature structure and has to be moved out the moment a second route needs it.
  Keep features in `src/features/` even when only one route uses them today.
- Request interception goes in **`proxy.ts`** at the same level as `app/`.
  (`middleware.ts` was renamed to `proxy.ts` in Next.js 16 and is deprecated.)
  Keep it to redirects, rewrites, headers, and cookies — not auth logic or db calls.
  This project has none today.
- A `page.tsx` should generally be under ~50 lines. If it is growing, the excess
  belongs in a feature component. Several pages exceed this today — see
  "Known deviations".

### 3.1 The server layer

`src/server/**` is a second axis, orthogonal to features, and it keeps its own
strict layering (see `docs/architecture.md`):

```
route handler (app/api/**)  →  domain service (server/services)  →  data access (server/db)
```

- Handlers hold no SQL and no business rules. Services know nothing about HTTP —
  no `Request`, no `Response`, no status codes; they throw typed domain errors.
- `src/server/db/client.ts` is the only place a connection is opened.
- Server components may call a domain service directly, but never query the
  database inline. There are no Server Actions; REST route handlers are the only
  mutation surface.
- **`src/server/**` is server-only** and must stay unreachable from a `"use client"`
  component. It is treated as a shared layer by rule 5.2: features and routes may
  import it, and it may import nothing from either.

---

## 4. Where does this file go?

Answer in order; stop at the first match.

1. **Is it a route, layout, or page shell?** → `src/app/`.
2. **Is it a business rule, a query, or a schema?** → `src/server/` (section 3.1).
3. **Is it used by exactly one feature?** → inside that feature's folder.
4. **Is it used by two or more features, or by a feature *and* `src/server/`?** →
   the matching top-level shared folder (`components/`, `hooks/`, `lib/`, `types/`).
5. **Is it a wrapper around a third-party library?** → `lib/`.
   (The fetch client, the db client, the auth client.)
6. **Still unsure?** → put it in the feature. Promoting later is easy; untangling
   something prematurely shared is not.

### Promotion and demotion

- One feature uses it → it lives in that feature.
- A second feature needs it → **move it up** to the shared folder in the same commit.
- A shared thing turns out to be used by one feature only → **move it down**.

Do not import from another feature to avoid a move. See rule 5.1.

---

## 5. Dependency rules (non-negotiable)

### 5.1 Features must not import from other features

```
❌ import { RoutineList } from '@/features/routines/components/routine-list'
   // inside src/features/training/
```

If `training` needs something from `routines`, either the shared piece moves up to a
top-level folder, or the two are composed together at the route level. Keeping
features independent is what makes them deletable.

`components/nav/start-routine-link.tsx` is the worked example: both `training` and
`routines` render it, so it lives in the shared layer rather than in `routines`.

### 5.2 Dependencies flow in one direction

```
shared (components, hooks, lib, server, types)  →  features  →  app
```

- Shared code may be imported by anything.
- Features may import shared code.
- Routes may import features and shared code.
- **Nothing** imports upward. A component in `src/components/` must never reach
  into `src/features/`. If it needs to, it is not shared — move it into the feature.

### 5.3 The deletion test

Pick any feature folder and imagine deleting it. Only the routes that composed it
should break. If half the app breaks, a boundary has leaked and it needs fixing
before more code is added on top.

---

## 6. Imports

- Use the `@/` path alias for anything outside the current folder. No `../` and no
  `../../../`. Same-folder `./sibling` is fine.
- **No barrel files.** Do not create `index.ts` files that `export *` from a folder.
  They break tree shaking and slow down bundling. Import directly from the source
  file: `import { Button } from '@/components/ui/button'`, and
  `import { sets } from '@/server/db/schema/training'`.
- A narrow `index.ts` that deliberately exports a small public API (not `export *`)
  is acceptable for a feature, but is not the default — ask before adding one.
- Files outside `src/` (`e2e/`, `scripts/`) reach into it with a relative path,
  because they run under Playwright and `tsx` rather than through the Next bundler.

---

## 7. Naming

- **Files and folders:** `kebab-case` — `routine-list.tsx`, `use-click-outside.ts`.
- **Components:** `PascalCase` exports in kebab-case files.
- **Hooks:** `use-` prefix, file and function.
- **Singular folder names** for a thing, plural only for genuine collections:
  `features/training/` (one domain) but `features/`, `components/`, `hooks/`
  (many things). `routine-list.tsx`, not `routines-list.tsx`.
- **Colocated tests** sit next to what they describe:
  `chart.ts`, `chart.test.ts`.
- Avoid `index.tsx` as a component filename — it makes files indistinguishable
  in editor tabs and fuzzy search.
- Check `docs/glossary.md` before naming a domain concept. "Session" is ambiguous
  here — always qualify it *workout session* or *auth session*.

---

## 8. Enforcement

Rules 5.1 and 5.2 are enforced by ESLint, not by convention alone.
`eslint.config.mjs` derives the cross-feature zones from a `FEATURES` array:

```js
const FEATURES = ["account", "auth", "history", "home", "progress", "routines", "training"];

"import/no-restricted-paths": ["error", { zones: [
  // 5.1 — no cross-feature imports.
  ...FEATURES.map((feature) => ({
    target: `./src/features/${feature}`,
    from: "./src/features",
    except: [`./${feature}`],
  })),
  // 5.2 — unidirectional flow.
  { target: "./src/features", from: "./src/app" },
  { target: ["./src/components", "./src/hooks", "./src/lib", "./src/server",
             "./src/types", "./src/utils"], from: ["./src/features", "./src/app"] },
]}],
```

**When adding a new feature, add its name to `FEATURES`.** A feature missing from
that array is unenforced.

---

## 9. Review checklist

Run through this before considering a task complete:

- [ ] Every new file is in the location the section 4 decision tree points to.
- [ ] No feature imports from another feature.
- [ ] No shared-folder file imports from `features/` or `app/`.
- [ ] No client component imports `src/server/**`.
- [ ] Route handlers hold no SQL; services hold no `Request`/`Response`.
- [ ] Anything now used by a second feature has been promoted to the shared layer.
- [ ] New features are listed in `FEATURES` in `eslint.config.mjs` and in section 10.
- [ ] No new barrel files.
- [ ] Imports use `@/`, not `../`.
- [ ] File and folder names follow section 7.
- [ ] Route files stay thin — no business logic added to `page.tsx`.
- [ ] No empty folders created "for later".
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass.

---

## 10. Current features

Keep this list current. It is the fastest way for a new contributor or an AI
assistant to understand the domain.

| Feature | Owns | Routes that compose it |
| --- | --- | --- |
| `training` | Logging a workout: the logger, the entry card, the set stepper, the rest clock, the elapsed timer, finishing a session, starting one | `/workout`, `/workout/[entryId]`, `/` |
| `routines` | User routines and the prebuilt programmes: the list, the editor, the start picker, the prebuilt list and its two actions | `/routines`, `/routines/[id]`, `/routines/start`, `/routines/prebuilt/[slug]` |
| `progress` | Records, charts and the muscle radar, plus the chart-axis maths in `utils/chart.ts` | `/progress` |
| `history` | The month calendar | `/history` |
| `account` | Theme, display unit, account deletion | `/settings` |
| `auth` | The sign-in/sign-up doorway — its shell, its fields — and sign-out | `/sign-in`, `/sign-up`, `/settings` |
| `home` | The greeting | `/` |

Shared UI that is deliberately **not** in a feature: `components/ui/**` (the shadcn
kit), `components/layout/screen.tsx`, `components/nav/tab-bar.tsx`, and
`components/nav/start-routine-link.tsx` (see rule 5.1).

### Known deviations

Recorded rather than hidden, so they are fixed deliberately:

- **Pages over ~50 lines.** `(tabs)/progress/page.tsx` (351) and `app/page.tsx` (279)
  are the worst; `workout/[entryId]`, `history/[id]`, `sign-up`, `history` and `sign-in`
  also exceed it (the two auth pages are now the form and nothing else — the
  chrome around it is `features/auth/components/auth-screen.tsx`). The excess is layout composition, not business logic, but it
  belongs in feature components.
- **No `hooks/` anywhere.** Client state is local to components today.
- **`features/home` owns one component.** It is a real domain, not a premature
  folder, but it will look thin until more lands.

---

## 11. When to escalate the structure

Do not restructure preemptively. Signals that the next step is warranted:

- **`features/` exceeds ~15 entries and they cluster into groups** → introduce
  `src/domains/<domain>/features/<feature>/`. Domain folders group; they hold no
  code themselves. The same boundary rules apply one level up.
- **Shared code needs a hard boundary or is used by more than one app** → extract
  to `packages/shared/` with its own `package.json`.
- **More than one deployable app on the same domain logic** → `apps/` + `domains/`
  + `packages/` monorepo.
- **Cross-feature dependencies keep appearing despite rule 5.1** → consider
  Feature-Sliced Design, which formalizes layers with strict downward-only imports.
  This is a heavier methodology; discuss before adopting.
