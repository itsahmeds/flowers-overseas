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
- **From `/review` round 2 and `/break` round 2 of PR 210 (2026-10-14).** For this task, `respondToOffer`: record `timeout` at `sla_expires_at`, because until it does a florist reads an open offer (`response IS NULL`) through `partner_order` and `partner_order_line`; and close partner visibility of a cancelled order whose offer is still open. An answer after `sla_expires_at` and before the engine's `timeout` is a case to settle against spec 011 and test; read what it says before writing the handler.
- **From TASK-257/258 (2026-10-24, PR 405):** `OrderCapturedV1` and `OrderInProductionV1` are already registered in `src/modules/payments/events.ts`, because spec 013 writes rows 2 and 16 first. The registry refuses a second registration: import these two schemas from there, do not register your own.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02: built on main `cef7c35e6`, branch `task/TASK-215-florist-actions`, PR 452. Commands in `src/modules/orders/florist-actions/` (not in the `orders` barrel: importing it registers six event schemas and imports `payments` for spec 013's two), the photo pipeline in `src/modules/orders/photo/`, routes under `{base}/api/orders/[assignmentId]/{respond,dispatch,photo}`, pages `{base}/orders/[assignmentId]/{decline,photo}`, actions docked on the order page. No migration. Tests: unit `florist-actions.test.ts` (16), integration `florist-actions.test.ts` (6) green on a throwaway PG16.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 452. `respondToOffer`, `markOutForDelivery`, `markDelivered` and `addDeliveryPhoto`: a partner-context read (404 when hidden), then one system transaction that locks the order and the assignment `FOR UPDATE`, re-checks partner, answer, state and deadline, updates `order_assignment`, calls spec 010's `transition` with `partner:{id}` and `by_user_id`, and runs TASK-214's `AcceptedOrderEffect` in the same transaction. Six event schemas registered (`assignment.accepted`, `assignment.declined`, `order.no_partner_available`, `order.out_for_delivery`, `order.delivered`, `order.photo_uploaded`), spec 013's `order.captured` and `order.in_production` reused. The photo: MIME by magic bytes (JPEG, PNG, WebP), 15 MiB bounded while streaming, `sharp` rotate, 2000 px, JPEG with no metadata, `originals/delivery_proof/{assetId}` in `R2_PRIVATE_BUCKET` (read through `r2EnvironmentFrom()`), orphan deleted if the write fails; the florist sees it through a 300 s signed URL read by a same-origin route (CSP keeps `img-src 'self'`). The actions offered are read off `order_transition` (partner rows from the current status). `proxyClientMaxBodySize` raised to 16 MB (the proxy truncated bodies at 10 MB). No migration. Tests: unit 16, integration 6; 17 mutations each turned a named test red. No local build, no browser run (no CI wait, founder 2026-11-02).

**Carry-forwards (2026-11-02, from the implementer's self-review, PR 452):**
- *T-30's staging e2e half* (the signed URL on real R2 works and expires; the public origin answers 404 for the key) is TASK-216's close-out run: it needs staging's `R2_PRIVATE_BUCKET` and a signed-in demo member.
- *Screenshots against `florist-inbox-*`* (decline step, dock, photo step, photo received) were not taken: the pages need a signed-in member and a database; no build was run locally (battery rule). TASK-216's visual baselines cover them.
- *`R2_PRIVATE_BUCKET` in `env.schema.ts`*: not added. The key is already declared by TASK-082 in `.env.example` (commented, optional) and read only by `r2EnvironmentFrom()`; the orchestrator's dispatch said to read it through that seam and add no key. TASK-216 still adds it to `config/railway.json`.
- *Event registration lives outside the `orders` barrel.* Any other process that writes `order.no_partner_available` or the florist events (TASK-328's routing jobs) must import `@/modules/orders/florist-actions` (or move the registration) first.
- *An answer between `sla_expires_at` and spec 016's `timeout`* is `ASSIGNMENT_EXPIRED` and writes nothing, settled against spec 011 §3 ("nothing moves it"); the command does not record the timeout.
- *Copy for the founder:* thirteen new `floristInbox.*` strings, all Appendix A verbatim except "Delivered, add the photo" (no em dash, the audit's decision 3) and the photo's alt text "Your photo of the delivered bouquet" (the artboard's drawn label); `en` `reviewed: false`, `pl`/`de` machine drafts.
- *`i18n:check` reports `nav.category.ourSelection` and `nav.send` unused*: both are on main already, not from this diff.
