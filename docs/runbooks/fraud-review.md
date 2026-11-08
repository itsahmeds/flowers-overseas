# Fraud pre-checks and review (spec 021)

The pay-step checks before any money moves, the card-testing pause and the hash key. Code:
`src/modules/risk/` (`prePayCheck`, `detectCardTesting`, `scoreOrder`, `reviewDeadline`), the
numbers in `src/config/risk.ts`, migration `0043_risk_021`, job `risk.monitor` (every minute from
the tick). The gate before routing, the review queue, early fraud warnings, the evidence pack and
the Radar rules (R1 to R10) join this runbook with TASK-494 and the records task of spec 021 §12.

## Before the first live order (founder checklist)

1. Railway env `RISK_HASH_KEY` on staging and production, **different per environment**:
   `openssl rand -base64 32` (exactly 32 bytes). Without it the blocklist and the "three unpaid
   orders in 24 hours" checks are skipped and every skip logs `risk.hash_key_missing`; the payment
   pause still works.
2. Flags in `/admin/flags`: `risk.gate` on (default), `risk.strict` off, `risk.pay_pause` off.
3. A Sentry or push rule for `risk.*` alerts (spec 025 routes them once it lands).

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

## Key rotation

Rotating `RISK_HASH_KEY` forgets every stored hash: blocklist entries and the unpaid-order count
start again from empty. Rotate only on a suspected leak, and re-add the blocklist entries by hand.
