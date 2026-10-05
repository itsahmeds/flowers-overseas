# TASK-215 — Spec 011 florist actions and the delivery photo: `respondToOffer`, `markOutForDelivery`, `markDelivered` and `addDeliveryPhoto` through spec 010's `transition`, the eight event schemas in its registry, the photo pipeline (`sharp`, every metadata field dropped) through the storage seam into the private bucket

Row: `TASKS.md` → TASK-215. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-215`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 7. Owns **AC-27, AC-28, AC-29, AC-30, AC-31**; tests **T-27–T-31**.
- **Commands (§5.2):** `respondToOffer`, `markOutForDelivery`, `markDelivered` (deliver, then photo: two events), `addDeliveryPhoto`. Each reads the assignment under the member's partner context (404 if hidden), then opens a system transaction that locks order and assignment `FOR UPDATE`, re-checks partner, state and deadline, updates `order_assignment` where it applies, and calls spec 010's `transition` with `partner:{partnerId}` and `payload.by_user_id`. A repeat writes nothing. Errors `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_EXPIRED`, `ASSIGNMENT_ALREADY_ANSWERED`, `ORDER_STATE_CHANGED`.
- **Ruling R1:** register the eight V1 schemas (`assignment.accepted`, `assignment.declined`, `order.no_partner_available`, `order.captured`, `order.in_production`, `order.out_for_delivery`, `order.delivered`, `order.photo_uploaded`) in TASK-202's registry under the catalogue names; no arrow label, no new event type, no direct status, event or outbox write; two concurrent accepts give one event.
- **After accept or decline:** TASK-214's `AcceptedOrderEffect` (the demo effect writes `order.captured` then `order.in_production`, or `order.no_partner_available` after a decline).
- **The photo (§2, §5.2):** MIME from magic bytes; at most 15 MiB, bounded while streaming; `sharp` rotates, resizes to 2000 px and re-encodes to JPEG with every metadata field dropped (`sharp` added as a direct dependency if it is not one); `objectKey("delivery_proof", assetId, "original")` in `R2_PRIVATE_BUCKET` through `src/lib/storage.ts`; `media_asset` private with `exif_stripped = true`; `delivery_proof.public_use_consent = false`; signed URL of at most 300 s; nothing under `R2_PUBLIC_BASE_URL`. No public-use question (§13 Q6).
- **Env keys (DoD §5; `/review 191` item 2):** this task is the first reader of `R2_PRIVATE_BUCKET` (required where the inbox runs, §12), so it declares it in `.env.example` and `src/lib/env.schema.ts` (validated by `lib/env.ts`) in its own PR and reads it only through `lib/env`. TASK-216 adds it to `config/railway.json` and runs `pnpm env:check` and `pnpm railway:check`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): order status, uploads and private storage. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §2 (actions, the delivery photo, "The order engine"); §5.2 (commands, photo, events); §8 (security); §9 AC-27–AC-31; §12 task 7.
- `specs/010-checkout.md` §5.2 (the engine); `docs/tasks/TASK-017.md`, `TASK-020.md`, `TASK-082.md`, `TASK-214.md`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/florist-inbox-mobile.dc.html`, `docs/design/wireframes/florist-inbox-desktop.dc.html` (the order stages and the photo step). The board draws "Delivered, add the photo" without the em dash (the audit's decision 3; ruling R9).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** TASK-082 is `blocked`; the founder creates the private R2 bucket in the EU jurisdiction with a scoped credential and sets `R2_PRIVATE_BUCKET` (§12 prerequisite 4). Same agent as TASK-214.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
