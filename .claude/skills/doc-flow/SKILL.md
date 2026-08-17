---
name: doc-flow
description: Traces a feature or request path end to end through the codebase and writes or updates its flow document in docs/flows/, including a Mermaid sequence diagram. Use this whenever the user asks to document a flow, explain how a feature works end to end, map a code path, update the flow docs, or says "walk me through" a request, journey, or lifecycle. Also use it proactively right after finishing a feature that adds or changes a route, handler, background job, or webhook, since the flow docs go stale otherwise.
argument-hint: [feature or path name]
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Document a flow

Trace `$ARGUMENTS` through the code and produce `docs/flows/<slug>.md`.

## Steps

1. **Find the entry point.** Grep for the route, handler, job registration, or
   event subscription. If several candidates match, ask which one rather than
   guessing.
2. **Follow the path by reading the actual code.** Every hop: what is called,
   what is transformed, what is persisted, what is emitted. Do not infer a hop
   from a filename — open the file.
3. **Stop at the boundary.** External services, the database, the queue. Note
   what crosses, not what happens on the far side.
4. **Check for an existing doc.** If `docs/flows/<slug>.md` exists, update it in
   place and preserve any human-written notes under Gotchas. Do not overwrite
   the file wholesale.
5. **Write it** using the template in `docs/flows/README.md`: trigger, Mermaid
   sequence diagram, numbered step-by-step with `file:function` references,
   files table, failure modes, gotchas. Set the verified date to today.
6. **Report** in chat: the entry point, the number of hops, and anything the
   trace turned up that looks wrong — dead branches, a swallowed error, an
   ordering dependency that isn't obvious.

## Rules

- Reference real symbols and paths. An invented file path makes the whole
  document untrustworthy.
- Participants in the diagram are components, not files. Keep it to six or
  fewer; collapse detail into a step instead of adding a participant.
- Describe what the code does, not what it should do. If the code contradicts
  `docs/architecture.md`, say so in the chat report rather than quietly
  documenting the intended behaviour.
- If the flow crosses a boundary that architecture.md doesn't mention, flag it —
  that file probably needs an update too.
