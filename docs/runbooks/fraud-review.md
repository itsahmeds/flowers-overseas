# Fraud pre-checks and review (spec 021)

The pay-step checks before any money moves, the card-testing pause, the gate before routing and
the review queue, early fraud warnings (EFW), chargebacks, the evidence pack, the Radar rules and
the hash key. Code: `src/modules/risk/` (`prePayCheck`, `detectCardTesting`, `scoreOrder`,
`assess`, `riskGatedRouting`, `decideReview`, `handleEarlyFraudWarning`, `riskOutboxHandler`,
`buildEvidencePack`, `detectSiteVelocity`), the numbers in `src/config/risk.ts`, migration
`0043_risk_021`, job `risk.monitor` (every minute from the tick). Legal basis and balancing:
`docs/compliance/lia-fraud-prevention.md`; records: RoPA rows 23 and 24.

## Before the first live order (founder checklist)

1. Railway env `RISK_HASH_KEY` on staging and production, **different per environment**:
   `openssl rand -base64 32` (exactly 32 bytes). Without it the blocklist and the "three unpaid
   orders in 24 hours" checks are skipped and every skip logs `risk.hash_key_missing`; the payment
   pause still works.
2. Flags in `/admin/flags`: `risk.gate` on (default), `risk.strict` off, `risk.pay_pause` off.
3. A Sentry or push rule for `risk.*` alerts (spec 025 routes them once it lands).
4. Once the Stripe account exists: enter the Radar rules below (R1 to R9; R10 once spec 013 sends
   the buyer's email on a Customer object), run Radar's editor preview on each before saving, and
   report any syntax the editor rejects in the task instead of changing a rule. Create the empty
   Radar list `@fo_review_card_countries` first (R9 refers to it).
5. Subscribe the Stripe webhook endpoint to `radar.early_fraud_warning.created` as well (spec 013's
   list in `src/modules/payments/stripe/events.ts` holds it).
6. Record here whether SCA is mandatory or best effort for each card region once the account
   exists (§13 Q13). Every card asks for 3DS whatever the answer.

## What a buyer sees

| Check | When | Buyer sees |
|---|---|---|
| Disposable email | checkout step 3, `test` and `live` | "Please use an email address you will keep." on the email field |
| Email on the blocklist | "Pay", before any intent | `payments.error.generic`; the order is closed unpaid |
| Three unpaid orders in 24 hours for the email | "Pay", before any intent | `payments.error.generic`; the order is closed unpaid |
| Payment pause (card testing or `risk.pay_pause`) | "Pay", before any intent | `payments.error.unavailable`; the order stays open |
| Fifth declined attempt | after the decline | step 4 "This payment did not go through and nothing was charged", "Start again" and the phone and WhatsApp line |

No buyer text names a check, fraud, a review or a block (`ACCUSATION_PATTERNS`).

## risk-card-testing-suspected

`risk.card_testing_suspected` (P1): in the last 10 minutes at least 10 declined attempts, and
declines at least half of all attempts. In `live` the job also writes a 30-minute `risk_pause`,
so new payments are refused with "Payments are not available right now. Nothing was charged."
until it ends; a second tick inside the pause raises nothing new. In `test` it alerts only.

1. Open Stripe's dashboard, Radar, and look at the declined payments of the last hour (one card
   number tried many times, many cards from one connection).
2. If the burst goes on, turn `risk.pay_pause` on in `/admin/flags`; turn it off when it stops.
3. To end an automatic pause early, delete its `risk_pause` row (admin SQL) or wait 30 minutes.

## Radar rules (entered by the founder, verbatim)

Spec 021 §2 A. Stripe's Radar runs on every payment; these are the rules we add. The block between
the two markers is read by `tests/unit/risk-radar-rules.test.ts` (AC-37): a rule may name only spec
013's intent metadata keys (`src/modules/payments/stripe/params.ts`), and no `Block` rule may name
`:card_country:`, `:ip_country:` or a country list (Geo-blocking Regulation Art. 5(1)).

<!-- radar-rules:start -->
| # | Rule | Why |
|---|---|---|
| R1 | `Block if :declined_charges_per_ip_address_hourly: >= 5` | Card testing from one connection |
| R2 | `Block if :card_count_for_ip_address_daily: >= 4` | Many cards from one connection |
| R3 | `Block if :declined_charges_per_card_number_daily: >= 4` | One card tried again and again |
| R4 | `Block if :email_count_for_ip_address_hourly: >= 4` | Identity cycling |
| R5 | `Block if :dispute_count_on_card_number_all_time: > 0` | A card that has disputed with us before |
| R6 | `Block if :efw_count_on_card_all_time: > 0` | A card reported for fraud before |
| R7 | `Review if :risk_level: = 'elevated'` | Elevated risk reaches our gate as a hold |
| R8 | `Review if :is_anonymous_ip: and ::is_first_order:: = 'true' and :amount_in_eur: >= 100` | Anonymised connection on a first, larger order (VPN alone is normal and is not a rule) |
| R9 | `Review if :card_country: in @fo_review_card_countries and not :is_3d_secure_authenticated:` | The list holds only countries outside the EEA, empty at launch |
| R10a | `Block if :is_disposable_email:` | Only once spec 013 sends the buyer's email on a Customer object (§13 Q6) |
| R10b | `Review if :card_count_for_email_daily: >= 3` | Same condition as R10a |
<!-- radar-rules:end -->

Radar's "review" does not stop the charge: under automatic capture it is a signal only, and our
gate reads the outcome and holds the order (signal S2). No rule blocks on card country, on a
country mismatch, or on destination.

**`@fo_review_card_countries`** (Radar list, R9). Countries outside the EEA only, ISO 3166-1
alpha-2, one per line between the markers; empty at launch. Adding an EEA code turns the rule
test red.

<!-- fo_review_card_countries:start -->
<!-- fo_review_card_countries:end -->

## The review queue (`/admin/risk`)

A paid order is assessed before any florist sees it (`risk.gate` on). A score of 40 or more, any
order of EUR 300 or more, or Radar's review outcome holds it: one `pre_routing` review, alert
`risk.review_opened`, nothing offered to a florist, nothing shown to the buyer.

- **Deadline:** at most 12 hours after the hold, and at least 3 hours before spec 016's routing
  deadline; under 30 minutes left, the default applies at once. `risk.review_due_soon` fires
  60 minutes before.
- **Default at the deadline** (`risk.review_auto_decided`): liability shift and a score under 70
  release the order to florists; anything else cancels and refunds in full, without a block.
- **Approve** releases it; **Cancel and refund** refunds in full (no block); **Cancel, refund and
  block** (admins) also tells Stripe the payment was fraudulent and blocklists the email and card
  hashes for 12 months.
- `risk.gate` off is shadow mode: every order is still assessed and recorded, none is held.

## Early fraud warnings (EFW)

The card network tells Stripe a card was used without permission; `webhook.process` hands the
warning to `handleEarlyFraudWarning`, one order at a time:

| Order status | What happens |
|---|---|
| `placed`, `authorised` | nothing yet; the gate sees the warning (D2) and cancels |
| `paid_unrouted`, `routed`, `no_partner_available`, `manual_reroute` | cancelled and refunded in full with `fraud_confirmed` (Stripe `fraudulent`), email and card blocklisted, `risk.auto_cancelled` |
| `accepted` | the inbox row fails `ORDER_IN_HANDOVER` and retries until the order is `paid` |
| `paid` | a post-routing review, deadline 60 minutes before production starts; "Keep the order" or "Refund in full"; at the deadline a full refund (`auto_refunded`) |
| `in_production` or later | a post-routing review with no deadline, `risk.efw_after_routing` |
| `chargeback_open`, cancelled or refunded | nothing |

### risk-efw-after-routing

`risk.efw_after_routing`: the bouquet is being made or delivered. Open the order from the review.
Either refund from the order page now (an EFW refunded before a dispute avoids the dispute and its
fee), or keep the evidence pack ready for the dispute that may follow.

## Chargebacks

`order.chargeback_opened` reaches the `risk` outbox target. A dispute with reason `fraudulent`
puts the order's email and card hashes on the blocklist (`source = 'dispute'`) and closes any open
review as superseded; any other reason writes nothing. Radar's R5 blocks the card at Stripe too.

### Uploading the evidence pack (by hand, §13 Q8)

1. The `payment.dispute_opened` alert links to the order page in admin.
2. In the order's Risk card, **Download evidence pack** (admins, `risk.evidence`). The PDF is built
   from the order's records at that moment and stored nowhere; the download writes one audit row.
3. In Stripe's dashboard, open the dispute, upload the PDF as the evidence file, and submit before
   `evidence_due_by`. It holds the timeline, the 3DS result, the delivery address and photo, and
   the cancellation terms the buyer agreed to; never the card message, a phone or the florist.

## Lifting a blocklist entry on a buyer's request

A buyer refused at the pay step can ask for a person (Art. 22(3)). Look up their order in admin,
read why it was blocked (the review's reason or the dispute), and if the block was wrong delete
the two `risk_blocklist` rows of that order's email and card hashes (admin SQL, audited by the
trigger):

```sql
DELETE FROM risk_blocklist
WHERE hash IN (SELECT hash FROM risk_identity WHERE order_id = '<order uuid>'
               AND kind IN ('email', 'card'));
```

Then tell the buyer they can order again. Never paste the email into SQL: the list holds only
keyed hashes.

## risk-velocity-site

`risk.velocity_site`: more than 5 `live` orders paid within an hour by email addresses never seen
before, on a day that is not a major occasion at the destination. Look at the orders; if they look
like one person, turn on `risk.strict` in `/admin/flags` for the evening.

## The daily counter line

On the first tick of each UTC day `risk.monitor` writes `risk.daily` log lines: assessments by
decision, reviews by outcome (the automatic decisions among them) and pauses of the day before.
After 100 live orders, read them with the founder to tune the thresholds (§13 Q9).

## Key rotation

Rotating `RISK_HASH_KEY` forgets every stored hash: blocklist entries and the unpaid-order count
start again from empty. Rotate only on a suspected leak, and re-add the blocklist entries by hand.
