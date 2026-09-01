# Glossary

Domain terms as **this codebase** uses them. The point is to pin down words that
mean something slightly different here than they do generally, and to stop the
same concept acquiring three names across the code.

Add an entry the moment you notice yourself hesitating between two words for
the same thing.

| Term | Means here | Not to be confused with | Where it lives in code |
| --- | --- | --- | --- |
| _User_ | A person with an account. The owner of every piece of training data; the only identity concept in the system. | _Account_ — in this codebase that is an Auth.js table linking a user to an OAuth provider, not a synonym for user. | `users` table (Auth.js) |
| _Session_ | **Ambiguous — always qualify it.** Use _workout session_ for training, _auth session_ for sign-in state. Never bare "session" in a name, and never for a _routine_ — a saved list of exercises is a routine, not a session. | — | `workout_sessions` table / Auth.js `sessions` table |
| _Workout session_ | One visit to the gym: a start time, an end time, and an ordered list of exercise entries. A **record** of what happened. | _Routine_, which is the plan it may have been started from. A workout session never points back at one. | `workout_sessions` table |
| _Exercise_ | A **definition** of a movement in the catalog ("Back Squat"), not an instance of doing it. | _Exercise entry_ — the performance of it inside a session. | `exercises` table |
| _Global exercise_ | A seeded catalog exercise, visible to every user. `owner_id IS NULL`. | _Custom exercise_ | `exercises` table |
| _Custom exercise_ | An exercise created by and visible to one user. `owner_id` set. | _Global exercise_ | `exercises` table |
| _Exercise entry_ | One exercise performed within one workout session, carrying its order in that session and its own notes. The row between session and sets. | _Exercise_ (the definition) | `session_exercises` table |
| _Routine_ | A reusable, named, ordered list of exercises kept between workouts ("Push Day"). A **plan**, not a record: it holds no reps, no weights and no dates. Starting one copies its exercises into a new workout session, and the two are unrelated from that moment on. | _Workout session_ (what actually happened), and _program_ — nothing here schedules routines across weeks. | `routines` table, `src/server/services/routines.ts` |
| _Prebuilt routine_ | One of the established programmes shipped with the app ("StrongLifts 5×5 · Workout A"). Content in `src/lib/prebuilt-routines.ts`, not a row, and nobody's: copying one writes an ordinary _routine_ owned by the user, and nothing links the two afterwards. | _Routine_ (what a copy becomes), and _program_ — a prebuilt routine is still one day, not a schedule. | `src/lib/prebuilt-routines.ts` |
| _Routine exercise_ | One exercise's place in a routine, carrying its order and its own notes. The row between routine and catalog. | _Exercise entry_, which is the same shape one level over in the log and holds sets. | `routine_exercises` table |
| _Set_ | The leaf record: reps at a weight, within an exercise entry. Ordered by `position`. | The JavaScript `Set` type — do not name a variable `set` where both could be meant. | `sets` table |
| _Working set_ | A set that counts toward volume and personal records: `is_warmup = false`. | _Warm-up set_ — stored identically, excluded from every statistic. | `sets.is_warmup` |
| _Volume_ | Total `reps × weight` across working sets, over a chosen window. Kilograms. | Set count, session count — say so explicitly if that is what is meant. | `findWeeklyVolume` in `src/server/db/queries/progress.ts` |
| _Personal record (PR)_ | The heaviest working set recorded for one exercise by one user. Per-user, never global. Measured, never estimated — nothing here calculates a one-rep max from a set of eight. | _Top set_, which is the same measure over a day rather than over all time. | `findPersonalRecords` in `src/server/db/queries/progress.ts` |
| _Top set_ | The heaviest working set of one exercise on one day — whatever the reps were. What the strength chart plots, one point per day trained. | A _personal record_, which is the heaviest ever rather than the heaviest that day. | `toStrengthPoints` in `src/server/services/progress.ts` |
| _Range_ | How far back the progress screen looks — 1 week, 1 month or 1 year — and, inseparably, how finely it is cut: days, days, months. One range drives every card on the screen. | A _window_ in the loose sense; here it always means one of those three. | `src/lib/range.ts` |
| _Bucket_ | One slot of a range: a day or a month. Every bucket of a range appears on a chart, including the ones with no training in them. | A _workout session_ — several can fall in one bucket, and most buckets hold none. | `bucketStart` in `src/lib/range.ts` |
| _Weight_ | Always kilograms, always `numeric`, as stored. | The _display unit_ — what the user is shown. | `sets.weight` |
| _Display unit_ | The user's chosen unit for reading and typing weights: `kg` or `lb`. A presentation concern only; nothing is stored in pounds. | _Weight_ (always kilograms) | `users.weight_unit`, `src/lib/weight.ts` |
| _Theme_ | One named set of values for the colour role tokens, chosen by the user and applied as `data-theme` on `<html>`. Six exist. Colour only: no theme changes type, spacing or radius. | _Dark mode_ — two of the six themes are dark, but darkness is a property of a theme rather than a setting of its own. | `users.theme`, `src/lib/theme.ts`, the `[data-theme=...]` blocks in `src/app/globals.css` |
| _Role token_ | A CSS custom property named for the job a colour does (`--brand` is confirmation and progress, `--primary` is "begin"), not for the colour it currently holds. What every component reads. | A hue name. `--rose` is the exception that kept its hue name and is decorative in every theme. | `src/app/globals.css` |
