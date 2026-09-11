# TASK-085 — Client-JS budget option (b): drop `NextIntlClientProvider` and the client message payload from locale documents — the spec 003 suggestion banner island and any other client consumer take translated strings as props from the server; remove the `banner.*`/client message split; keep `useTranslations` server-only; re-measure with `budget:client-js` and a browser

Row: `TASKS.md` → TASK-085. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-085-strings-as-props-no-client-provider`. Brought forward from TASK-056 after TASK-051 measured 132 047 B br on locale documents (975 B over). Expected saving ~10 705 B br. Spec 003 AC-28's banner matrix (T-28) must re-run green unchanged; the consent and finder islands must already be provider-free (verify, do not rewrite). Runs before TASK-053.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `scripts/client-js-budget.ts`
- `src/modules/i18n/error-document.ts`
- `messages/en.json`
- `src/app/global-error.tsx`
- `tests/unit/client-js-budget.test.ts`
- `src/modules/i18n/messages.ts`

## Carry-forwards

- **From `/review 36`:** also fix `scripts/client-js-budget.ts`'s attribution of every island chunk group to the `/` entry (131 672 B charged vs 116 429 B fetched) so the chooser is measured as what a browser fetches. **Scope widened from TASK-052's finding (PR 40, 2026-09-09):** dropping the provider alone will not remove the ~10.7 KB message blob — `src/modules/i18n/error-document.ts` statically imports all of `messages/en.json` for four strings and is reachable from `src/app/global-error.tsx`, which Next attaches to every document; Turbopack tree-shakes that JSON only below a size threshold (≈9.4 KB inlined, ≈10.7 KB shipped whole), so every copy task pays 0 B or 3.4 KB depending on which side of the cliff `en.json` lands. This task must make the error document take its four strings as props (or a dedicated tiny `error.*` messages file) so no page-level JSON import reaches a client graph, and add an assertion to `tests/unit/client-js-budget.test.ts` that no measured chunk contains the `home.*`/`finder.*` catalogue. Measured after PR 40: `/` 132.4 KB, `/en`/`/de` 132.8 KB br (budget 131 072 B; island itself 499 B). **From TASK-073 (PR 41):** the same cliff has a second entry point — `src/modules/i18n/messages.ts` statically imports all four message catalogues and is reachable from a client island (`Photography to supply` found in a client chunk); PR 41's new `media.*`/`catalog.*` keys cost +3.2 KB br on `/`, `/en`, `/de`. Make the catalogue import `server-only` (or per-namespace lazy) as part of this task.

## Escalations

_None recorded._

## Result

Done. PR [#50](https://github.com/itsahmeds/flowers-overseas/pull/50); `/review` pass recorded in `TASKS.md`.
