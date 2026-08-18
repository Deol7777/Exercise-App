# Glossary

Domain terms as **this codebase** uses them. The point is to pin down words that
mean something slightly different here than they do generally, and to stop the
same concept acquiring three names across the code.

Add an entry the moment you notice yourself hesitating between two words for
the same thing.

| Term | Means here | Not to be confused with | Where it lives in code |
| --- | --- | --- | --- |
| _User_ | A person with an account. The owner of every piece of training data; the only identity concept in the system. | _Account_ — in this codebase that is an Auth.js table linking a user to an OAuth provider, not a synonym for user. | `users` table (Auth.js) |
| _Session_ | **Ambiguous — always qualify it.** Use _workout session_ for training, _auth session_ for sign-in state. Never bare "session" in a name. | — | `workout_sessions` table / Auth.js `sessions` table |
| _Workout session_ | One visit to the gym: a start time, an end time, and an ordered list of exercise entries. | _Program_, _workout template_ — neither exists; nothing is prescribed in advance. | `workout_sessions` table |
| _Exercise_ | A **definition** of a movement in the catalog ("Back Squat"), not an instance of doing it. | _Exercise entry_ — the performance of it inside a session. | `exercises` table |
| _Global exercise_ | A seeded catalog exercise, visible to every user. `owner_id IS NULL`. | _Custom exercise_ | `exercises` table |
| _Custom exercise_ | An exercise created by and visible to one user. `owner_id` set. | _Global exercise_ | `exercises` table |
| _Exercise entry_ | One exercise performed within one workout session, carrying its order in that session and its own notes. The row between session and sets. | _Exercise_ (the definition) | `session_exercises` table |
| _Set_ | The leaf record: reps at a weight, within an exercise entry. Ordered by `position`. | The JavaScript `Set` type — do not name a variable `set` where both could be meant. | `sets` table |
| _Working set_ | A set that counts toward volume and personal records: `is_warmup = false`. | _Warm-up set_ — stored identically, excluded from every statistic. | `sets.is_warmup` |
| _Volume_ | Total `reps × weight` across working sets, over a chosen window. Kilograms. | Set count, session count — say so explicitly if that is what is meant. | `findWeeklyVolume` in `src/server/db/queries/progress.ts` |
| _Personal record (PR)_ | The heaviest working set recorded for one exercise by one user. Per-user, never global. | Estimated one-rep max — a calculation, not a record; not currently derived. | `findPersonalRecords` in `src/server/db/queries/progress.ts` |
| _Weight_ | Always kilograms, always `numeric`, as stored. | The _display unit_ — what the user is shown. | `sets.weight` |
| _Display unit_ | The user's chosen unit for reading and typing weights: `kg` or `lb`. A presentation concern only; nothing is stored in pounds. | _Weight_ (always kilograms) | `users.weight_unit`, `src/lib/weight.ts` |
