# Session Summaries

Scannable index of all development sessions. Each day has one entry with timestamped invocation groups.

## How to Use This File

### Marker format
- `[S:YYYY-MM-DD]` — marks a day's entry
- `[S:YYYY-MM-DDTHH-MM]` — marks a specific invocation within that day

### Navigation
1. **Find all sessions:** `grep "\[S:" docs/session-summaries.md`
2. **Keyword search:** `grep -i "keyword" docs/session-summaries.md`
3. **Deep search across all sessions:** `grep -ri "keyword" docs/sessions/`

---

## 2026-09-10 [S:2026-09-10]
**17:29** — 1. Re-check and merge of the 09-09 fix rounds — PRs 36 (consent islands, TASK-051), 37 (price dataset, TASK-062), 38 (seed schemas, TASK-072) re-verified locally after the CI `ready_for_review` event had been consumed; all three squash-merged, with ADR-0017 clarified (projected `seed/data` files carry authored records, `to*Row()` at import time) and the plan/03 §9 seventh-occasion-rule gap recorded as plan/13 B15. 2. Seed lane delivered — TASK-074 price files (PR 39, found `occasions.json` stale on main after PR 37's `17Mai`→`mai17` rename), TASK-077 imagery provenance (PR 42, 31 `ai` assets with reproducible `promptHash`), TASK-078 `media:variants` (PR 44, `sharp` 0.35.4 pinned to one thread for byte determinism), TASK-075 `seed:check` (PR 46, nine rule families and the §11 health report), TASK-076 `seed:diff` (PR 48, committed `seed/snapshot/{table}.json`). 3. Catalogue lane delivered — TASK-063 taxonomy read API (PR 43), TASK-064 tiers/add-ons with CRD Art. 22 preselection absence pinned at type level (PR 45), TASK-065 pricing core (PR 47, full review PASS with an independent 35 007-case BigInt VAT oracle). 4. Homepage hero/finder (TASK-052, PR 40) and seed copy (TASK-073, PR 41) each failed full review once — finder list never closed and consent baselines re-shot over a `next/dynamic` race; two unbacked "next working day" delivery claims — fixed and merged; spec 006 gained §14 A1–A5. 5. Client-JS budget diagnosis — the 10.7 KB blob is a Turbopack static-JSON-import cliff via `error-document.ts` and `messages.ts`, not the provider; TASK-085 widened. 6. GitHub Actions blocked on billing from 17:00 UTC (jobs fail at start with a billing annotation); repo has no branch protection, so merges proceed on local gates recorded in TASKS.md. 7. Session closed at 47/85 with PR 49 (TASK-079) awaiting review, PR 50 (TASK-085) draft awaiting re-check, and fo-wt-066 (TASK-066) mid-build.

Details: [docs/sessions/2026-09-10.md](sessions/2026-09-10.md)
