ADVISOR: GO WITH FIXES

# Spec 002 amendment A6: the order machine as rows (draft, PR 209)

**1. In one sentence.** A6 writes `plan/11` §2's order diagram out as 73 data rows. I counted them and the count is right. It gives every state a buyer label and makes the status-write switch last only for one transaction. The business rules (D1 to D6) are sound. It gets "with fixes" because four small gaps would surface later as bugs or as an unclear refund page, and because spec 010 must be amended before TASK-202 starts.

**2. Verdict: GO WITH FIXES.** Approve once these are in A6:
- **F1 (A6.7 a, AC-35).** Add: "`transition` resets both settings to `''` (with `set_config(…, '', true)`) right after its one `UPDATE`, and the trigger treats `''` as unset." Add one AC-35 case: a raw status `UPDATE` later in the same transaction raises `ORDER_STATUS_DIRECT_WRITE`. Spec 010's demo flow runs `place`, `authorised` and `routed` in one transaction (010 §5.2), so without this a leftover switch can let a later write in that transaction through.
- **F2 (A6.3 rows 30–31).** Add `closed` to the from-set of both refund rows, making 75 rows, and update AC-14. Otherwise, once the 72-hour window has passed, a refund (say for a returned vase under the add-on withdrawal right, `plan/07` §2.1 ⚖️) can only be recorded by filing a false "dispute".
- **F3 (A6.3 note).** An immediate-charge order emits `order.captured` twice (row 2, then row 14 with no money moving; spec 013 draft AC-14). Add: "money facts come from `payment` rows; no subscriber treats `order.captured` as a sale."
- **F4 (A6.4).** Add: "whenever a refund has succeeded, the tracking page and the buyer email show 'Refunded {amount} on {date}'", and name the spec that owns it (010 or 013).
- **F5 (A6.10).** Say that a spec 010 amendment must be approved before TASK-202 starts, and add it to TASK-202's dependencies. **Must have:** (1) AC-22/T-22's set equality uses A6.6's 28 transition events (as written, it compares against the whole `plan/11` catalogue, so it fails against A6's seed); (2) `transition` sets `app.transition_event` (without it, every transition fails amended AC-13); (3) the "flag on, no event" refusal applies to `UPDATE` only, or `place` sets `order.placed` (010 §5.1's insert trigger). **Should have:** (4) `appendEvent` refuses events that have rows; (5) `transition` checks `allowed_actors`, which is one array comparison. AC-14 only checks that the seeded rows match A6's table. Nothing actually refuses the wrong actor today. The spec 013 draft conflicts (A6.10 i–vi) block nothing yet. They are fixed when 013 is revised.

**3. The four hats**
- **Building.** (a) The switch can stay on for the rest of the transaction (F1). (b) Spec 010 hard conflicts (F5 1–3). (c) The double `order.captured` (F3). The transaction-local setting itself is safe. Neon pools connections in PgBouncer transaction mode and does not support session `SET` there ([Neon](https://neon.com/docs/connect/connection-pooling)). `set_config(…, true)` lasts "only … during the current transaction" ([Postgres 16](https://www.postgresql.org/docs/16/functions-admin.html)). `src/lib/db.ts` already sets the RLS values this way.
- **Google.** No concern.
- **Law.** (a) Flowers are exempt from the 14-day withdrawal right (CRD Art. 16(d); [UK CCR reg. 28(1)(c)](https://www.legislation.gov.uk/uksi/2013/3134/regulation/28)). D4's free cancellation goes beyond that, so the terms must say the contract forms on capture and that we may cancel if no florist accepts (`plan/07` §2.3). A lawyer must sign off the terms, as `plan/07` §11 already says. This memo is not legal advice. (b) Add-on withdrawal after closing (F2). (c) Calling a refunded order "closed" is honest only if the refund is shown beside it (F4).
- **Customer.** (a) D3 stops a gift halfway if a buyer disputes a charge they did not recognise. A clear card-statement descriptor matters. (b) D2 shows "cancelled" on the delivery day, so the message should offer a one-tap reorder [inferred].

**D1–D6 in plain words**
- **D1 Yes.** A small refund (missing add-on, late delivery) should not stop the flowers.
- **D2 Yes.** No capture means no contract (`plan/07` §2.3). Tell the buyer and the florist at once.
- **D3 Yes, on two conditions.** Only a real chargeback stops fulfilment, not a Stripe "inquiry" or "early fraud warning" (`warning_*` statuses, [Stripe](https://docs.stripe.com/disputes/how-disputes-work)). If fulfilment stopped before delivery, accept the chargeback rather than fight it.
- **D4 Yes.** Card holds last 7 days for Visa and Mastercard online payments ([Stripe](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)), so the system cancel only affects orders no florist took within about 6 days. Nothing is charged.
- **D5 Yes**, never "cancelled", with F4.
- **D6 Yes**, no closing without a photo. The photo is our chargeback evidence (`plan/06` §2.3).

**4. Questions to ask before approving**
1. When a chargeback stops an undelivered order, do we always accept it?
2. After a failed capture, does the buyer get a "pay again" link, or only "order again"?
3. How long after delivery with no photo before I am alerted (spec 025)?
4. Is the add-on withdrawal question (`plan/07` §11 item 3) with the lawyer before Phase 1?
5. Who writes the spec 010 amendment, and when?

**5. What looks right.** The order rules live in data and their tests are built from A6's table. "Terminal" is a rule that is checked, not a hand-kept list. The amendment reads the diagram faithfully and fixes its gaps in the buyer's favour (D1, D4).
