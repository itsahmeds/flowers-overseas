# Legitimate interest assessment: fraud prevention (spec 021)

Processing: RoPA row 23 (fraud prevention: pre-checks, scoring and review) and row 24 (chargeback
evidence). Basis: Art. 6(1)(f) UK GDPR and EU GDPR; Recital 47 names fraud prevention as a
legitimate interest. Written for spec 021 §8 (AC-34). The lawyer confirms it with the legal set
(`plan/13` B4, spec 021 §13 Q12).

## 1. Purpose test

- **Interest pursued:** stop stolen cards and card testing before a bouquet is made, protect the
  cardholder whose card was stolen, protect our florists from making orders that are later
  charged back, and defend a dispute with the facts of a delivered order.
- **Whose interest:** ours (losses and dispute fees), the cardholder's (unauthorised payments are
  refunded before they become disputes), the florists' (no work on fraudulent orders).
- **Lawful and specific:** fraud prevention is a recognised legitimate interest; card schemes and
  Stripe's terms expect merchants to screen payments.

## 2. Necessity test

- **Each signal is tied to a known fraud pattern** (spec 021 §5.2's signal table): velocity of
  cards per email and emails per card, many recipients for one buyer, a first large order, an
  order for today, a card message asking for urgency or money, Radar's own risk level, an early
  fraud warning, an earlier chargeback.
- **Keyed hashes instead of raw values:** the email, the card fingerprint and the recipient's
  address are stored only as HMAC-SHA-256 hashes under `RISK_HASH_KEY`; no raw identifier is kept
  by the risk module, and the card message is read in memory for a yes or no answer, never stored.
- **No IP or device data of our own:** Radar processes connection and device signals under
  Stripe's own controllership; we read only Radar's outcome.
- **Less intrusive alternatives considered:** relying on Radar alone leaves us blind to a stolen
  card used for a gift to someone else (the main relay pattern) and to a buyer who disputed with
  us before; holding every order for a person would delay honest orders at night.
- **Chargeback evidence** (row 24) is built only when a dispute exists, from the order's own
  records, and holds only what the card network asks for: the timeline, the 3DS result, the
  delivery address and photo, and the terms the buyer agreed to.

## 3. Balancing test

- **Reasonable expectations:** a buyer paying by card expects fraud checks; the privacy page says
  so in plain words (spec 041 requirement, below). A recipient's data is reduced to an address
  hash kept 90 days.
- **Impact:** a held order is delayed for at most 12 hours and never past its safe offer time; the
  buyer sees nothing negative. A refusal at the pay step takes no money. A cancellation is always a
  full refund to the original method.
- **No profiling beyond the order:** scores and signals are not used for marketing, pricing or any
  decision other than this order's payment; they are excluded from access exports where the law
  allows (spec 018), and kept 12 months.
- **Automated decisions (Art. 22):** two paths cancel without a person, a blocklist match and an
  early fraud warning, plus the deadline default. They rely on Art. 22(2)(a) with the Art. 22(3)
  safeguards: the buyer can reach a person by phone or WhatsApp, the founder reviews the order and
  can lift a blocklist entry (`docs/runbooks/fraud-review.md`).
- **Safeguards:** RLS with system and admin policies only, every admin decision audited, no
  personal value in logs, alerts or URLs (AC-32), retention enforced by `retention.sweep` (AC-33).

**Conclusion:** the interest is legitimate, the processing is necessary and limited to keyed
hashes and order facts, and the balance favours processing with the safeguards above.

## 4. DPIA screening

Small scale (a single-founder shop), no special category data, no systematic monitoring of public
areas, no large-scale profiling, no new technology beyond keyed hashing. Automated decisions affect
only the one order and are always reversible by a person with a full refund. A full DPIA is not
expected; the lawyer confirms with the legal set.

## 5. Requirement on spec 041 (privacy page)

The privacy page gains (recorded in `docs/tasks/TASK-495.md` "Result" for spec 041's next task):

1. A fraud-prevention paragraph: we check card payments for fraud using keyed hashes of the email,
   the card and the delivery address, kept 12 months (the address 90 days); some orders are
   checked by a person before a florist is asked; an order may be cancelled and refunded in full
   automatically when the bank reports the card as stolen or the email or card disputed a payment
   with us before; anyone can ask for a person to look at the decision by phone or WhatsApp
   (Art. 13(2)(f)).
2. In the recipient section: if a bank disputes a payment, we share the recipient's name, the
   delivery address and the delivery photo with Stripe and, through it, the card network and the
   issuing bank, to show the order was delivered.
