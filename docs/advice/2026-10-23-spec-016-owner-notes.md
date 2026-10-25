# Spec 016 owner-first amendment: notes for the orchestrator (2026-10-23)

Written beside `specs/016-routing-notifications.md` §14 A-founder-2026-10-23 (the bouquet's own florist is offered first). Notes outside the appended spec text; the spec text itself carries the rule, AC-50 to AC-58 and T-50 to T-58. Stacked on PR 341 (AC-44 to AC-49 live there).

## Effect on the task rows (the orchestrator edits `TASKS.md` and each brief)

- **TASK-327** (pure rules): gains `rankCandidates(candidates, ownerPartnerId)` and `ownerOfOrder`; AC-50, AC-51 (T-50, T-51). No new dependency: both are pure.
- **TASK-331** (pipeline): gains AC-58 (T-58), the handler-level statement that V1 leaves in the run that handles `assignment.offered`.
- **New row, "Spec 016 owner first in the cascade"** (backend, ID by the orchestrator), placed after TASK-328: `catalog.productOwners`, the read in `order.route`, the log fields; AC-52 to AC-57 (T-52 to T-57). Depends on TASK-328 and on spec 030b's `product_origin` task, which has no row yet (`/plan-tasks` for 030b creates it). If spec 030b's task has merged before TASK-328 starts, the orchestrator may fold this row into TASK-328.
- **TASK-332** (florist templates): unchanged; if O-9 is answered yes it gains the ops offer-copy template and TASK-331 its `notificationsFor` row.
- TASK-328, TASK-329, TASK-330, TASK-333, TASK-334, TASK-335, TASK-336: unchanged.
- Class: every row keeps self-review with the breaker's awkward cases.

## Spec writer's self-check

- *Building:* one pure parameter and one pure helper in TASK-327, one read and two log fields in a new small row after TASK-328; no migration, event, schema or template change. The owner passes the same `eligibleCandidates` as everyone, so no hard filter can be bypassed, and "already offered" ends the owner's turn without new state. Dependency risk: the new row waits for spec 030b's `product_origin`, which has no task row yet; TASK-328 is not held.
- *Google:* nothing indexable changes; `product_origin` stays out of public and build reads.
- *Law and compliance:* no personal data added; 16-3 minimisation untouched (AC-22); buyer copy and price untouched; the florist agreement should state the offer order and allow mapping a second florist to an owner's bouquet (noted, not blocking).
- *Customer:* the buyer's delivery promise is protected by the default cascade; the florist whose bouquet was ordered hears first, by email at once (or 07:30 for a night order), with a reminder at half the time; the founder hears when something goes wrong, and O-9 offers a copy of every offer if wanted.
- *Rules (`CLAUDE.md`):* status only through `transition` (no new write); no IP redirect; no literal strings (no copy added); money untouched; go-live stays data; no PII in logs or URLs; no em dash in this text.
