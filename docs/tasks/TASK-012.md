# TASK-012 — Docs and ledger: README rewrite (≤8 commands, <15 min), `docs/runbooks/local-setup.md` + runbook index, `docs/architecture.md` (Mermaid + module table with owning spec), `.claude/settings.json` allow-list, TASKS.md open-decisions parser test, branch-protection runbook section

Row: `TASKS.md` → TASK-012. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-012-docs-ledger`. Architecture doc records CSP deferral to 004 (§8) and the `<html lang="en">` 003 removal item (§7). Tests: T-31 (manual, timed by reviewer), T-32. Spec exit signal: this PR merged with recorded `/review` PASS (§12). Spec 001 text corrections queued: Stylelint rule name (TASK-003 review) and §5.2 `middleware.ts` → note Next 16 `proxy.ts` deprecation; rename itself is a spec 003 task that must also widen `fo/no-geo-redirect`'s filename matcher and AC-8 fixtures; AC-23's clause "the run passes on the empty shell" is unsatisfiable while `/` has no painted content (Lighthouse aborts with `NO_FCP` before any metric exists) — reword to "assertions configured as errors; no budget regression once measurable (spec 004)". Also queue: AC-26/T-27 "temp clone" → "isolated temp project with `CLAUDE_PROJECT_DIR` redirection" to match the implementation. From review of PR #11: spec corrections for `required_approving_review_count: 0` (solo founder), `lighthouse` exclusion while informational, `strict: false` contexts, `pnpm run audit` naming, job-order (`seo-validate`/`dev-os-check` on typecheck; `env:check` as lint step); README troubleshooting must state that without gitleaks installed `pnpm test` reports 5 skipped; verifier should also assert `dismiss_stale_reviews`, `required_conversation_resolution`, `delete_branch_on_merge`. Open founder decision: branch protection needs GitHub Pro (private repo on Free returns 403) — option 1 upgrade (recommended) or option 3 record unenforced protection as a deviation. **Done 2026-09-08 (PR #12):** README rewritten (7 numbered setup commands, every `package.json` script documented once, troubleshooting incl. the 5 gitleaks-absent skips, the `proxy.ts` deprecation and Lighthouse `NO_FCP`); `docs/runbooks/local-setup.md` + runbook index table; `docs/architecture.md` (Mermaid, 11-module table checked against the `check-layout` manifest and each barrel's owning-spec comment, five deferred decisions); `.claude/settings.json` allow-list extended with build/format/env:check/dev-os:check; T-32 ledger parser (`scripts/tasks-open-decisions.ts`) — which found and fixed an unescaped `| TASK-NNN |` in the log's `/review 10` row; verifier now asserts `dismiss_stale_reviews`, `required_conversation_resolution`, `delete_branch_on_merge`; spec 001 §14 records all ten queued corrections (§1–§13 untouched). **T-31: 8 s** clone → healthy `/api/health` (27 s including `lint`+`typecheck`+`test`), warm pnpm store and local remote — budget 15 min. Tests: 540 unit (44 new/extended), 0 skipped with gitleaks. CI 18/19 (`lighthouse` informational-red, `NO_FCP`). **Escalations:** (a) founder decision still open on branch protection (GitHub Pro vs recorded deviation), (b) this PR widens the session permission allow-list per spec §2 and asks for explicit human confirmation.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/runbooks/local-setup.md`
- `docs/architecture.md`
- `scripts/tasks-open-decisions.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#12](https://github.com/itsahmeds/flowers-overseas/pull/12); `/review` pass recorded in `TASKS.md`.
