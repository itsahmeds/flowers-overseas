# Pointer amendments 013, 016 and 010b: spec writer's self-checks (2026-10-22)

Written beside `specs/013-payments-order-state-machine.md` §14 A-founder-2026-10-22, `specs/016-routing-notifications.md` §14 A-founder-2026-10-22 and `specs/010-checkout.md` §14 A-founder-2026-10-22b. No advisor ran (work order 2026-10-22: no advisor or reviewer agents). Each amendment itself carries the effect on the open tasks.

## Spec 013 §14 A-founder-2026-10-22 (payment per purchase)

- *Building:* every rewrite keeps one-order behaviour identical, so the existing fixtures stay valid; the one schema change is additive except `payment.order_id`, whose drop is guarded and whose readers move to `paymentForOrder`. Risk: TASK-254 (PR 287, in review) may reference `payment.order_id` in Drizzle types; TASK-350 regenerates them and must grep for it.
- *Google:* no indexable surface, no new URL, no script on an indexable page.
- *Law and compliance:* price shown = price charged holds as one integer from Element to intent; refunds stay on the original method and can never exceed what the buyer paid for that delivery; Stripe still receives no recipient data; a live payment can never be rolled back by a migration.
- *Customer:* one charge, one Pay button amount; a delivery that cannot be made is refunded alone and the others continue untouched; the confirmation shows each delivery's own state and no failure wording on a paid block.

## Spec 016 §14 A-founder-2026-10-22 (one B1 per purchase)

- *Building:* the change is one source-key rule and one child table in a migration nobody has built yet; the existing idempotency rules (AC-19) already make N deliveries collapse into one send, so no lock or new job is added. Risk: TASK-327 must now wait for TASK-347's `purchase` table; the plan's migration order (TASK-347 before TASK-337 and TASK-327) already gives that.
- *Google:* no page, URL or indexable HTML changes.
- *Law and compliance:* one durable-medium confirmation covers every contract of the purchase, with each delivery's price and the total charged; every amount is read from the order, the purchase or the refund row, never recomputed; no new personal data category or processor.
- *Customer:* one "thank you" email for one checkout, each delivery listed with its own date and tracking link; a later problem with one delivery is told about that delivery alone, by reference, with its own amount, and florists never learn about the buyer's other gifts.

## Spec 010 §14 A-founder-2026-10-22b (accounts at checkout)

- *Building:* no migration; one seam to read and one to write, both spec 018's; two server actions with Zod; the new row waits only for tasks already planned, and nothing on the ordering path waits for it. Risk: TASK-344 must accept `return=checkout` and offer a sign-out callable from checkout; item 15 names both.
- *Google:* nothing indexable changes; the one new link sits on a disallowed, `noindex` page and points to a `noindex` page.
- *Law and compliance:* guest checkout remains complete; saving a recipient is an unticked, explicit act under spec 018's LIA, minimised and excluded for health and funeral addresses; no opt-in of any kind in checkout; no personal data in URLs or logs; signing out at a shared device clears what the last person typed.
- *Customer:* a returning buyer types less (name, phone, recipients), and a guest is never asked to sign up; the save label reads naturally before a name is typed and says exactly what is kept.
