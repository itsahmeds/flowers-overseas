# TASK-279 — No consent banner while nothing needs consent

Row: `TASKS.md` → TASK-279. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19d (founder "yes yes", 2026-10-19), clause 10 **Owner**: "the reader (clause 1), the
layout wiring, the banner-off path and the footer activation (clause 2), the restated tests below, the
`consent-active` project (clause 8), the runbook steps (clause 3), with spec 003's popup gate and spec 041's two test
restatements in the same feature PR."

- **ACs owned (as 19d amends them):** AC-6, AC-9, AC-13, AC-17 (a), (b) and (d), AC-19, AC-20 (equal prominence in
  `consent-active`; the footer panel pre-enables nothing), AC-21, AC-22, AC-27 (the panel baselines on the committed
  build, the banner baseline in `consent-active`, popup baselines deleted), AC-39, AC-48 (overlay bullet), AC-55 (the
  popup bullet). Tests T-08, T-11, T-15, T-19 (committed (a), `consent-active` (b), unit (d)), T-21, T-22 (prominence
  half), T-23, T-24, T-29, T-41, T-53 (overlay case), T-60 (popup chunk). Clause 9: every "chunk not requested"
  assertion first proves the chunk file exists and later sees it requested.
- **Not here:** AC-17 (c), AC-20's disclosure clause and the compact form are TASK-281 (blocked on copy). The panel
  this task opens from the footer is today's panel until TASK-281 lands.
- **Spec 041's two restatements (AC-13/T-13, AC-29/T-31):** the cookie page is TASK-183's and not built, and
  `company.controller` has no key. Build the shared `data-fo-consent-reopen` behaviour here so the cookie page's
  button gets it for free; the e2e restatements land with TASK-183 (AC-13) and TASK-281/TASK-183 (AC-29). Say so in
  the PR as a declared deviation from clause 10's "same feature PR".
- **Feature PR:** TASK-280 (spec 003 19d, the popup gate) ships in this PR; branch `task/TASK-279-...`, the
  description closes both IDs.
- **Review class: keeps the breaker** (consent and compliance, a CI workflow, i18n behaviour every visitor meets).
- **Runbook:** clause 3's before-the-flip steps (a) to (e) go into `docs/runbooks/analytics-consent.md` §1;
  procedural, not code gates. The lawyer's ruling on advanced vs basic Consent Mode is a carry-forward, not a gate.
- **Esc stack (A-founder-2026-10-19c clause 4, restated by 19d clause 5):** AC-17 (d) in
  `tests/unit/locale-gate.test.ts`.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/004-design-system-layout.md` `## 0. Index`, then §14 A-founder-2026-10-19d (and -19c clauses 2 and 4)
- `specs/003-i18n-foundation.md` §14 A-founder-2026-10-19d (TASK-280's half)
- `docs/design/wireframes/consent-compact-{desktop,mobile}.dc.html` (§1, §2)
- `docs/codebase-map.md` (consent island and loader, `src/modules/analytics`, `src/config/cookies.ts`)
- `docs/runbooks/analytics-consent.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-244 (PR 253): it owns the deferred set and `LanguagePopupLoader`'s deferral, which AC-55's popup
  bullet and T-60 extend. Never beside TASK-244 or TASK-281.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** carry for the brief's Result: the founder's lawyer reviews "no banner while only essential cookies" and the
  real production cookies against the register (an edge cookie set by Cloudflare is not in the register) after
  go-live (19d Compliance, carry-forward (1)).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-23 (implementer, to the orchestrator): the new `consent-active` job is in `ci.yml`, so `scripts/branch-protection.ts` derives it as a required check; GitHub requires it in fact only after `pnpm branch-protection` is re-applied (founder's act, `docs/runbooks/branch-protection.md`). Skipped (passing) without `ci:full`. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-23: worktree `../fo-wt-279`, branch `task/TASK-279-consent-and-menu` (also closes TASK-282; TASK-280 is its own PR per the orchestrator's order). Reader `consentSources()` + unit table, layout wiring, loader/island prompt and footer activation, `consentEscape.ts` written. Next: unit tests for the Esc stack and layout render, e2e restatement, `consent-active` project and CI job, Menu (TASK-282).
- 2026-10-23: unit (reader table, source scan, layout render, Esc stack), the committed-build e2e suite, the `consent-active` project, job and runbook steps, T-60's build-output check all written; local build in the slot: the touched e2e, a11y and consent-active suites green, mutations red (PR 352 `## Self-review`). Next: linux baselines from `visual:baselines`, then ready + `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#352](https://github.com/itsahmeds/flowers-overseas/pull/352), with TASK-282. `consentSources(env)` (analytics barrel) is the one reader: the locale layout calls it once for the GA4 tag's id and the banner's `prompt`. With nothing active (today) no sheet mounts and the island's chunk is not requested until "Cookie settings" is activated, which opens the settings panel (today's panel) with focus inside; `Esc` closes it and returns focus; one `Esc` acts on one layer (`consentEscape.ts`). Tests: unit `consent-sources.test.ts` (10), `app-shell.test.tsx` (+3 layout renders), `locale-gate.test.ts` (+4 Esc stack), `ci-workflow` and `branch-protection` updated; e2e `tests/e2e/consent-banner.spec.ts` rewritten for the committed build (25, AC-17 (a) with clause 9's chunk matcher and positive control), the banner-shown suite moved to `tests/consent-active/` (56 cases incl. a11y, visual, popup order, AC-6, AC-48), T-60's build-output check in `deferred-chunks.spec.ts`; CI job `consent-active` builds with `G-FIXTURE00` and aborts every Google request. A local build was run in the slot to run the new e2e and to mutate the built output (no CI round trip per mutation). **Handed on:** AC-17 (b)'s non-intersection clause needs the compact placement (TASK-281; runbook §1 (a) makes it a precondition of any flip); AC-17 (b)'s no-gate clause, AC-13, AC-39/T-41, AC-55/T-60's resource-timing half and the popup baselines' deletion need the popup gate (TASK-280, its own PR); spec 041's AC-13/T-13 and AC-29/T-31 restatements land with TASK-183/TASK-281 (the shared `data-fo-consent-reopen` behaviour is built here). Carried for the lawyer (19d carry-forward (1)): "no banner while only essential cookies" and the production cookies against the register (Cloudflare's edge cookie is not in it).
