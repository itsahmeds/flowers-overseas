# TASK-044 — `formattingTag` split for `en`: add `formattingTag` (default = `bcp47`, refined to be `Intl.Locale`-parseable and to share `bcp47`'s primary language subtag) to `LocaleConfigSchema`, set `en` → `en-150`; `tagFor()` in `format.ts` and `collator()` read it; `toLocaleRow` gains `formatting_tag` (AC-4 pin and spec 002 §5.1 `locale` table amended); `en` rows added to the date/time/number/week-start tables in `tests/unit/i18n-format.test.ts`

Row: `TASKS.md` → TASK-044. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-044-en-formatting-tag`. Decision (orchestrator under founder delegation, 2026-09-08): two-field approach — document language tag `bcp47` unchanged, new `formattingTag` for `Intl`; `en-150` chosen over `en-IE` (pan-European intent, already in `hreflangAliases`). Must land before TASK-039 bakes tags into `alternatesFor()` and before spec 004's date picker reads week start (`Intl.Locale.getWeekInfo`). Also pin the previously unasserted `en` outputs so the change is visible as a test diff. Spec 002 §5.1 amendment: `locale.formatting_tag` column (recorded in spec 003 §14 by TASK-043). **Implemented on `task/TASK-044-en-formatting-tag`, PR #19, `in_review` 2026-09-08.** `formattingTag` is optional when authored and defaulted to `bcp47` in a transform (a per-field `z.default()` cannot see another field), then refined to be a canonical tag `Intl.Locale` accepts and to share `bcp47`'s primary language subtag — which also rejects Unicode extensions such as `en-u-kf-upper`, whose `baseName` does not round-trip; a later spec needing a collation keyword in the formatting tag must relax that. `en` renders European conventions now (`14/02/2027`, `14:00 Central European Time`, `a, b and c`, `45.00 £`, `getWeekInfo().firstDay === 1`) with the plain-`en` answers (`02/14/2027`, `02:00 PM`, `a, b, and c`, `£45.00`, `firstDay === 7`) pinned as negative assertions so a revert to `bcp47` fails a test. Three deviations in the PR body: ICU gives `en-150` the delivery date `Sat, 13 Feb` (comma), not the `en-GB` `Sat 13 Feb` the row predicted, and both are pinned side by side; the three `en` rows of `tests/fixtures/index.ts` are relabelled `en-150` with the two foreign-currency values updated (`45.00 £`, `45.00 PLN`) because the fixture is by contract the module's own output, shape untouched for spec 002 AC-34; and neither spec file was edited — spec 003 AC-4's key list and spec 002 §5.1's column list are TASK-043's §14 amendments (noted on that row). No barrel export added (AC-3 list untouched), no new dependency; `LocaleConfigInput` (`z.input`) is exported from `src/config/locales.ts` only. Unit 769 green (+10); e2e 50 passed re-run against the production build with `/en` → `lang="en"` (AC-6 unmoved); CI 19/20 green, `lighthouse` red and informational (the pre-existing 304 KB script budget carried by TASK-043).

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/fixtures/index.ts`
- `src/config/locales.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#19](https://github.com/itsahmeds/flowers-overseas/pull/19); `/review` pass recorded in `TASKS.md`.
