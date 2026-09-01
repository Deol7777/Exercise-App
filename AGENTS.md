<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository guidance

Read [CLAUDE.md](CLAUDE.md) before making changes. It contains the current
product context, commands, invariants, and documentation contract.

[FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) is the source of truth for file
placement and import boundaries. Read [docs/architecture.md](docs/architecture.md)
for the server layering and data-model rules, and [docs/glossary.md](docs/glossary.md)
before naming a domain concept.

Keep this file concise: put detailed, evolving project context in `CLAUDE.md`
and architecture or vocabulary detail in the documents above. The Next.js block
at the top is generated and must remain intact.

## Git workflow

When the user asks to stage work, stage every relevant file for that feature and
provide a descriptive proposed commit message that makes the meaningful change
clear from the commit history. Never create a commit; the user creates all
commits.
