# Notes on spec 030b §14 A-founder-2026-10-22 (contracts, supply, my bouquets)

For the orchestrator and `/plan-tasks`. Not an advisor memo; it records what sits beside the amendment text.

## Status

The founder approved the request (his words are quoted in spec 030b §14). He has not approved the amendment text. §14 and the header say **proposed (awaiting the founder's approval of its §13 defaults Q15 to Q28)**. The existing approval of 2026-10-22 ("crm ok") covers AC-1 to AC-35 only. The amendment's own draft claimed "approved"; that was changed on the orchestrator's instruction.

## Task-row effect (030b is not yet planned)

`/plan-tasks` creates rows 4 to 6 beside rows 1 to 3 (text in §12 "Suggested tasks").

- Task 4, Contracts: AC-36 to AC-44, AC-57 and AC-58 in part. Breaker class: auth and security, migrations and data flows, compliance. Depends on task 3 (tab bar, `offboarded_at`, `textHasContactDetails`, the 030b mask list), TASK-082 and spec 016's founder layout.
- Task 5, Supply: AC-45 to AC-51, AC-57 in part. Breaker class: money and migrations. Depends on tasks 2 and 3 and spec 012b slice A task 5 (and its A.2 import task for the import hook).
- Task 6, My bouquets: AC-52 to AC-56, AC-58 in part. Breaker class: auth and security (it reads partner-scoped money, so not review-only). Depends on spec 026a task 1 only, so it can ship first.
- Tasks 4 and 5 both touch the partner page's tab bar and `messages/admin/en.json`: one agent, or in sequence.

## Design artboards (§5.3.1 items 11 to 20)

The designer resuming 030b in `.claude/state/designer-030b/` draws them in the same PR as items 1 to 10: contracts tab, partner detail tab bar, partners list column, prices tab additions, product editor Made by tab, Supply matrix, florist "My bouquets" (mobile first, `pl` sample text), florist inbox nav link, the two founder reminder emails, and the component and flow additions.

## Requests on other specs (pointer amendments, written when this lands)

Spec 012b (supplier save and import write `product_origin`; Made by tab), spec 002 (`contract` object kind, `downloadName` on `getSignedUrl`), spec 011 and 026a (route `bouquets`, nav link, RoPA clause), spec 012 (Agreement column, "Contracts due", terms sync), spec 019 (access request includes `partner_contract`).

## Found while writing

- 030b's header said "approved" while "Approved by" said pending (fixed in the header rows).
- 030b's old §14 was the Self-check; it is now §15 and §14 is Amendments.
- `product_origin` is its own table, not a `product` column, because `product` is readable by the public and build roles.
- The existing non-goal about florists seeing their own figures read slightly differently from the text the amendment expected to replace; it was replaced as the amendment instructs.

## Open outside this spec

The founder's company registration may change the contracting entity of the florist agreement; `template_version` records which template each florist signed.
