<!--
Spec 001 §2 "CI" and `CLAUDE.md` "Definition of done". Every section below is mandatory: the
reviewer's checklist starts from what is written here, and an empty section is a failed review,
not a smaller one. Delete no heading. Write "none" where a section genuinely does not apply and
say in one line why.
-->

## Task ID

<!-- TASK-NNN, exactly as it appears in TASKS.md. Must match the `(TASK-NNN)` in the PR title. -->

## Spec path

<!-- `specs/NNN-slug.md`, plus the sections this PR implements (e.g. §5.2, §9). -->

## AC ids covered

<!-- One line per acceptance criterion this PR owns, ticked only when a test or a quoted command
     output in this PR proves it. An AC owned by another task does not belong here. -->

- [ ] AC-NN — how it is proven (test id, file, or quoted output)

## Tests added

<!-- By layer, with counts. `tests/<layer>/`. Say "none" and why if a layer is untouched.
     Skipped tests must be named and justified. -->

| Layer       | Files | Tests | Notes |
| ----------- | ----- | ----- | ----- |
| unit        |       |       |       |
| integration |       |       |       |
| contract    |       |       |       |
| e2e         |       |       |       |
| visual      |       |       |       |
| a11y        |       |       |       |

## SEO / i18n / compliance impact

<!-- One line each, starting with yes or no. "no" is an answer; an empty line is not. -->

- **SEO** (indexability, canonical, hreflang, sitemap, schema, CWV budgets — `plan/02`):
- **i18n** (message keys, locale routing, logical CSS, `Intl` formatting — `plan/03`):
- **compliance** (new data flow → RoPA, lawful basis, price display, geo-blocking, accessibility — `plan/07`):

## Docs updated

<!-- Tick what this PR changed; strike through what it does not need. -->

- [ ] `README.md`
- [ ] `docs/runbooks/…`
- [ ] `docs/adr/…` (new ADR or a superseding one)
- [ ] `docs/compliance/ropa.md`
- [ ] `.env.example`
- [ ] `TASKS.md` row (status, PR link)

## Preview URL

<!-- The Vercel preview for this PR's head commit, plus what was smoke-tested on it and in which
     locales. "Not applicable" only when no deployable code changed. -->

## Review

<!-- Left empty by the implementer. The reviewer records the `/review` verdict here as
     PASS / FAIL with a link to the review comment. A PR merged with this section empty is a
     process failure (`CLAUDE.md` definition of done, item 4). -->
