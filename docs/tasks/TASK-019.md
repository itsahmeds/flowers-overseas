# TASK-019 — Schema `orders` + `payments` (migration `0007`) and the state-machine reference data: `order_status`, `order_transition` seeded from `plan/11` §2, `"order"`, `order_line`, `order_event`, `order_assignment`, `substitution_note`, `delivery_proof`, `review`, `payment`, `refund`, `webhook_inbox`

Row: `TASKS.md` → TASK-019. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-019-schema-orders-payments`. Reference rows are data, not code, so spec 015 reads guards instead of hard-coding them; AC-14 asserts set equality both ways against a fixture list transcribed from `plan/11` §2, and every state carries a buyer-visible projection. `order.recipient_snapshot` is the history-preserving snapshot of `plan/11` §3 and the one place recipient contact survives the retention sweep, pseudonymised (§8). `webhook_inbox` implements store-before-process ahead of 013. Seed inserts zero `review` rows (§6: a fabricated `aggregateRating` is impossible by absence of data). Triggers are TASK-020. Tests: T-14.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/11`

## Carry-forwards

- **From `/plan-tasks` of specs 010–012 (2026-10-05, ruling R8; `/review 191` nit 8):** `order_transition.event` holds the `plan/11` §2 catalogue names (`order.authorised`, `order.routed`, `assignment.accepted`, `order.captured`…), never the diagram's arrow labels; and migration `0007` carries spec 010 §5.1 A's `"order".mode text NOT NULL CHECK (mode IN ('demo','test','live'))` with no default, `"order".buyer_snapshot jsonb NOT NULL`, and a nullable `"order".terms_version` with `CHECK (mode <> 'live' OR terms_version IS NOT NULL)`, each with §5.1 A's rollback line.
- **From TASK-018 (PR 200).** `payout_line.order_id` (migration `0005`) has no foreign key, because
  `"order"` did not exist yet. Migration `0007` adds `payout_line_order_id_order_id_fk` (`ON DELETE
  RESTRICT`) and its rollback drops it; `db/schema/partners.ts` gains `.references(() => order.id)`
  in the same commit. `payout_line_order_once_idx` is a partial unique index (`WHERE kind = 'order'`):
  it cannot serve that FK's `RESTRICT` check, so measure whether a plain `(order_id)` index is needed
  once spec 011's demo-order deletes run. Spec 010 §5.1 A's `ASSIGNMENT_MODE_MISMATCH` trigger can
  rely on `fulfillment_partner.status` being one of `demo`, `onboarding`, `active`, `paused`,
  `offboarded`, with no default.
- **From TASK-018, round 1 of PR 200 (review nit 3).** A tripwire is already in
  `tests/unit/schema-partners-customers.test.ts` ("the deferred foreign keys cannot be forgotten").
  Once a migration creates the parent table, that test fails until a migration adds payout_line_order_id_order_id_fk. When you
  add it, also add the live catalogue assertion (`pg_constraint` by name, with its delete rule) to
  the integration suite, and add the row to `tests/fixtures/schema-foreign-keys.ts`.

## Escalations

### E1 (2026-10-12, feature PR TASK-019…023): `plan/11` §2 does not fit `order_transition` as the spec defines it

Raised before any code was written. The work order says to stop on exactly this. The spec gives
`order_transition(from_status, event, to_status, requires_actor, PRIMARY KEY (from_status, event))`
and AC-14 asks for "a row for every arrow". Ruling R8 says `event` holds only `plan/11` §2
catalogue names. The diagram cannot be transcribed under all three without decisions nobody has
made yet:

1. **Two targets for one (from, event).** "any post-paid ──refund_request──▶ refunded_partial |
   refunded_full" breaks the primary key. The same happens with `chargeback_open ▶ won | lost`
   if both use one event.
2. **Arrows with no catalogue event:** `placed ▶ abandoned` (draft expiry),
   `no_partner_available ▶ manual_reroute`, `no_partner_available ▶ cancelled`,
   `delivery_failed ▶ redelivery_scheduled`, `redelivery_scheduled ▶ cancelled_refunded`, and
   `refunded_* ▶ closed` ("non-terminal until closed"). The catalogue's `order.chargeback_*` is a
   wildcard with no concrete names.
3. **"any post-paid" names no set of states.**
4. **The source of `payment_failed` is ambiguous.** The `┌──` line sits over the `route` arrow:
   it could come from `placed` or from `authorised`, and `plan/01` §4 says `paid`.
5. **The arrow into `paid_unrouted`** (immediate-charge methods) has no label and no event.
6. **Terminal flags and buyer projections are not given per state.** The design rules list only
   the linear projection. "chargeback_won | chargeback_lost (terminal)" could mean one or both.

**Proposed transcription (approve or amend, and the work resumes as written).** Keep the PK. Use
catalogue names where one exists, and widen the catalogue where none does, in the
`order.chargeback_*` style. Spec 010 AC-22's catalogue fixture takes the same additions.

| from | event | to |
|---|---|---|
| placed | order.authorised | authorised |
| placed | order.payment_failed | payment_failed |
| placed | order.abandoned *(new)* | abandoned |
| authorised | order.routed | routed |
| authorised | order.captured | paid_unrouted |
| paid_unrouted | order.routed | routed |
| routed | assignment.accepted | accepted |
| routed | assignment.declined | routed |
| routed | assignment.timed_out | routed |
| routed | order.no_partner_available | no_partner_available |
| no_partner_available | order.manual_reroute *(new)* | manual_reroute |
| no_partner_available | order.cancelled *(new)* | cancelled |
| manual_reroute | order.routed | routed |
| accepted | order.captured | paid |
| paid | order.in_production | in_production |
| in_production | order.substitution_proposed | awaiting_buyer |
| awaiting_buyer | order.substitution_resolved | in_production |
| in_production | order.out_for_delivery | out_for_delivery |
| out_for_delivery | order.delivered | delivered |
| out_for_delivery | order.delivery_failed | delivery_failed |
| delivery_failed | order.redelivery_scheduled *(new)* | redelivery_scheduled |
| redelivery_scheduled | order.out_for_delivery | out_for_delivery |
| redelivery_scheduled | order.cancelled | cancelled_refunded |
| delivered | order.photo_uploaded | photo_uploaded |
| photo_uploaded | order.closed | closed |
| delivered, photo_uploaded, closed | order.disputed | disputed |
| disputed | order.resolved | resolved |
| resolved | order.closed | closed |
| disputed | order.chargeback_opened *(new name for the wildcard)* | chargeback_open |
| chargeback_open | order.chargeback_won | chargeback_won |
| chargeback_open | order.chargeback_lost | chargeback_lost |
| P (post-paid, below) | order.refunded_partial *(splits `order.refunded`)* | refunded_partial |
| P | order.refunded_full *(splits `order.refunded`)* | refunded_full |
| refunded_partial, refunded_full | order.closed | closed |

- **P (post-paid):** `paid`, `paid_unrouted`, `in_production`, `awaiting_buyer`,
  `out_for_delivery`, `delivery_failed`, `redelivery_scheduled`, `delivered`, `photo_uploaded`,
  `disputed`, `resolved` and `refunded_partial` (a second partial refund, or partial then full).
- **Status-preserving events,** never `order_transition` rows: `order.placed` (the insert),
  `assignment.offered`, `order.refund_requested`, `customer.created`, `recipient.created`,
  `review.created`, `partner.status_changed`, `country.status_changed`.
- **Terminal:** `payment_failed`, `abandoned`, `cancelled`, `cancelled_refunded`,
  `chargeback_won`, `chargeback_lost`.
- **Buyer projection:**
  - `placed`: placed.
  - `confirmed`: authorised, paid_unrouted, routed, no_partner_available, manual_reroute.
  - `with_florist`: accepted, paid.
  - `being_made`: in_production, awaiting_buyer.
  - `on_its_way`: out_for_delivery, delivery_failed, redelivery_scheduled.
  - `delivered`: delivered, photo_uploaded, disputed.
  - `closed`: closed, resolved, refunded_partial, refunded_full, chargeback_open,
    chargeback_won, chargeback_lost.
  - `cancelled`: payment_failed, abandoned, cancelled, cancelled_refunded.
- **`requires_actor`:**
  - `buyer`: order.authorised, order.payment_failed, order.substitution_resolved.
  - `partner`: assignment.accepted, assignment.declined, order.substitution_proposed,
    order.out_for_delivery, order.delivered, order.delivery_failed, order.photo_uploaded.
  - `admin`: order.manual_reroute, order.cancelled, order.redelivery_scheduled, order.resolved,
    order.refunded_*.
  - `system`: order.abandoned, order.routed, assignment.timed_out, order.no_partner_available,
    order.captured, order.in_production, order.closed, order.chargeback_*.
  - `any`: order.disputed.

The alternative to the new names is to widen the PK to `(from_status, event, to_status)` and let
the payload choose the target. That changes spec 002 §5.1 and the
`transition(orderId, event, …)` signature of spec 010, so it is not proposed.

A smaller note, with no ruling needed: spec 001 §14 A20 asked for a spec 002 amendment (the flag
set transaction-locally only, plus one documented test way to set an order's state). That
amendment is not in spec 002 §14. Its content is unambiguous, so TASK-020 implements it as the
carry-forward states.

**For the resumed run:** test locally on a throwaway PG16 (embedded-postgres binaries with ICU,
as TASK-018 did), never on the shared Neon database. `0011`'s RLS applied there would reach the
live site.

## Result

_Pending._
