# Runbook: discount codes

| Field | Value |
|---|---|
| Severity | P2 (a code that sells below cost, or a wrong total at checkout); P3 for a wrong figure in the list |
| Detect | The codes list (`/admin/discounts`); Sentry warning `discounts.guessing` (more than 100 failed code attempts in 10 minutes, from TASK-447); the cost preview's warning rows |
| Owner | founder; the accountant for every VAT question; the lawyer for reduction claims |
| Last tested | not yet (fill at the staging exit signal of spec 047 §12) |

Spec 047. A discount code is a promotion we pay for: the florist's pay never changes. The buyer
types it on the last checkout step; the product page, its schema, the sitemap and any product
feed always keep the public price. Codes are data: making, disabling and turning one back on is
done in admin, never in code. The checkout control is switched per destination by the flag
`checkout.discount_codes` (off by default).

## 1. Create a code

1. Admin, **Discounts**, **New code** (role `admin`; `finance` can read codes but not change them).
2. **Code**: 6 to 32 letters and digits; case, spaces and hyphens are ignored ("polonia-10" is
   `POLONIA10`). **Generate** proposes 10 characters without look-alikes (no I, L, O, U, 0, 1) for a
   code that should be hard to guess. Polish letters are refused on purpose: buyers abroad type on
   other keyboards.
3. **Campaign**: who the code is for ("Polish Saturday school, Ealing"). Internal only: buyers
   never see it; the list, the finance view and analytics use it.
4. **Offer**: a percent (1 % to 50 %) or an amount off per currency. An amount off is at most half
   of that currency's minimum order, and a currency without an amount does not take the code.
5. **Starts** and **Ends** are entered in UK time by default (Europe/London, shown beside the
   field; change the zone per code if needed) and stored in UTC.
6. **Total uses** (optional) and **Uses per buyer email** (default 1; "anna+1@" and "Anna@" count
   as one buyer). Uses are live orders only; demo and test orders never count. An order that is
   never paid, or is cancelled before preparation, gives its use back; a refund of a delivered
   order does not.
7. **Destinations** and **Bouquets**: empty means all. A code is limited by where the flowers go,
   never by where the buyer lives.

## 2. The two warnings, before saving

- **Cost preview, below cost**: for every bouquet and destination in scope, the price, the
  discount, the VAT on what the buyer pays, our highest mapped florist pay and the margin after
  the discount. A red row means that bouquet would sell at or below what we pay the florist. You
  can still save (we absorb it); narrow the bouquets or lower the offer if that was not intended.
  "Not mapped" means no florist has a payout for that bouquet there yet.
- **A lower price in the last 30 days**: a bouquet in scope had a lower price within 30 days. A
  public "10 % off" is measured against that lower price (EU Omnibus Art. 6a; the UK's pricing
  rules). Narrow the bouquets, or announce the amount without a percentage.

## 3. Announcing a code

- Buyer pages never show a percentage, a strike-through or a "was" price; the discount appears only
  as its own line with the amount taken off.
- In a poster or community post, state the limits that can refuse the code: the end date, the
  minimum order, the destinations, the bouquets, once per buyer.
- Quote a percentage only if the reduction-claim warning is clear for every bouquet in scope.
- Never share a code as a link: no URL accepts a code.

## 4. Disable a code

**Disable code** on the code's page stops it at once, also for buyers who applied it and have not
paid yet: their last checkout step shows the new total before they pay. A disabled code answers
like a code that does not exist. **Turn back on** reverses it. To switch the whole feature off for
a destination, turn `checkout.discount_codes` off in **Flags**.

After a code's first counted live use its offer (code text, kind, percent, amounts) is fixed; make
a new code to change it. Dates, caps, status, campaign, note, minimums and scope stay editable.

## 5. Reading its cost

- The list shows, per code, live uses against the cap and the discount given per currency (live
  orders whose own status still counts).
- The code's page shows the same under **So far**, with who created it and who changed it last;
  every change is in the audit log (`discount.create`, `discount.update`, `discount.disable`).
- Per order figures (price before discount, discount, charged, VAT, florist pay, margin after
  discount, in the order currency and the base currency) are `discountFinanceRows`, rendered by
  spec 030b's finance view once it ships.

## 6. What the lawyer and the accountant confirm

| Who | Question | Answer |
|---|---|---|
| Lawyer | Does a code handed to a community group's members fall outside Omnibus Art. 6a (individualised reduction), and is our no-reference-price display enough under the DMCC Act 2024 and the CMA's guidance? | open |
| Accountant | VAT on what the buyer pays, with the discount spread over the lines by value and each line at its own rate (VAT Directive Art. 79(b); HMRC VAT Notice 700), under the Wyoming LLC | open |
| Accountant | How the invoice shows the discount (spec 018), and that the florist's self-billing statement is untouched | open |

## 7. Rollback

Flags first (immediate): turn `checkout.discount_codes` off, disable codes. Code removal is
`git revert` plus `pnpm db:rollback --to 0036`, which `0037_discount_codes.down.sql` refuses with
`DISCOUNT_ROLLBACK_LIVE_ORDERS` once any live order carries a discount; after that, rollback is
flags only.
