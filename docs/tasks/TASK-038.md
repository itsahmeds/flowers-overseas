# TASK-038 — Catalogues and `i18n:draft`: `messages/en.json` completed for the shell namespaces (`meta`, `chooser`, `banner`, `errors`, `a11y`), the `en-gb` thin override, `de` and `pl` machine drafts, the `messages/*.meta.json` manifests, `MessagesSchema` / `MessageMetaSchema`, next-intl typed-key augmentation generated from `en.json`, and `DraftProvider` + `echoDraftProvider` behind `pnpm i18n:draft`

Row: `TASKS.md` → TASK-038. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-038-catalogues-i18n-draft`. Resolved inputs: §13 Q5 (`en-gb` is a thin override; a redundant override fails `i18n:check`), Q7 (deterministic echo stub — no LLM, no API key, no network, proven by MSW `onUnhandledRequest: "error"`) and Q10 (honest unreviewed echoes are acceptable on the protected preview). §7 plurals: Polish is the acid test and `1 kwiaciarnia / 2 kwiaciarnie / 5 kwiaciarni` at counts 1, 2, 5, 22, 25 and 1.5 must resolve through the real catalogue, not a fixture (AC-20). Two consecutive `i18n:draft --locale pl` runs are byte-identical, every written key carries `source: "machine"`, `reviewed: false` and a `sourceHash`, and a key whose meta says `reviewed: true` is never overwritten. `sourceHash` is the drift record that flips dependants stale when an English string changes. `MessageMetaSchema`'s field names equal spec 002's `message_catalog` review columns (pinned by AC-4 on TASK-033) so spec 012 mirrors them rather than translating them. Substantive `de`/`pl` copy is founder plus native-reviewer work (`plan/13` B12) and explicitly not a task here (§3). Tests: T-20, T-23. Implemented: `MESSAGE_META_COLUMNS` pins the five `message_catalog` review columns and names `retained` repo-only — spec 002 §5.1 declares no `retained` column, verified in the PR body rather than invented; `i18n:draft` also refuses to overwrite `source: "human"` (reported stale instead) so an English edit cannot replace the authored `de`/`pl` plural forms with an echo. CI 19/20 with informational `lighthouse`.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/13`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#20](https://github.com/itsahmeds/flowers-overseas/pull/20); `/review` pass recorded in `TASKS.md`.
