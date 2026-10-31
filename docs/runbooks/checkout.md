# Runbook: the checkout (demo phase)

Spec 010 (TASK-204 to TASK-208). The checkout runs on `/{locale}/checkout` and its confirmation
on `/{locale}/checkout/done`, both server-rendered per request, `no-store`, `noindex, nofollow`.
In Phase 0 every order it places is a **demo** order: nothing is charged and nothing is delivered.

## Opening and closing the demo per country

The demo opens per destination country with data, never with a deploy.

1. Admin, **Flags** (`/admin/flags`): `checkout.open` with a **country** scope for the
   destination (for example `PL`) on. The global `checkout.demo_guard` stays **on** for the whole
   demo phase.
2. The country's picker state must be `preview` (spec 009): the product page then shows
   "Try a demo order" and "Add to basket". In `unavailable` there is no control.
3. Check: open a product page for that country, press "Try a demo order", walk the three steps
   with "Use sample details", place, and see the `FO-XXXX-XXXX` reference on the confirmation.
   The order appears in the admin order list as `demo`.

To close: `checkout.open` off for that country. The effect is immediate for new posts; a cached
product page keeps its button for up to an hour and the button then leads to the closed state
("We are not taking orders for {country} yet. Ordering opens soon."), never to an error.

## Production data before the first production demo order

Placement resolves every line against the database: the product by SKU, the destination by ISO
code, each add-on by key, and a demo florist for the routing. Before the first production demo
order, seed production **insert-only** from the committed dataset:

```sh
APP_ENV=production pnpm db:seed --insert-only --dry-run   # read the counts first
APP_ENV=production pnpm db:seed --insert-only
```

`--insert-only` adds what is missing and changes nothing that exists (a plain seed refuses to run
in production). A product page whose SKU has no `product` row places nothing: the buyer sees
"We could not place this order" and the log line `checkout.place_refused` carries the code
(`product_not_in_database`, `country_not_in_database`, `addon_not_in_database`).

The environment also needs `QUOTE_SIGNING_SECRET` (`openssl rand -hex 32`, one value per
environment; `railway-cloudflare-setup.md`). Without it a deployed server signs no price, so
every "Try a demo order" returns to the product page and the log line `checkout.refused` says
`no_price`. CI's checkout origin makes a random one per run.

## The daily cap

At most `DEMO_DAILY_ORDER_CAP` demo orders (200, `src/config/checkout.ts`) per UTC calendar day
across the deployment. Over it, step 3 shows the cap notice in place of the place button and
writes nothing; the next UTC day accepts again. Reaching the cap logs `checkout.demo_cap_reached`
and sends one Sentry warning per UTC day. A placement slower than 2 s logs `checkout.place_slow`.
Changing the cap is a reviewed one-line config change.

## Retention per environment

`retention.sweep` (`src/jobs/retention.ts`) applies three spec 010 rows of `retention_policy`:

| Key | Production | Staging and PR | What happens |
|---|---|---|---|
| `checkout_draft_personal` | 1 day | 1 day | the buyer, and every line's recipient and card, cleared after 24 hours of no activity; the lines stay |
| `checkout_draft` | 30 days | 30 days | the basket and its lines deleted 30 days after the last change |
| `demo_order_personal` | 1 day | **7 days** | demo and test orders pseudonymised after placement: snapshots redacted, the `recipient` and `customer` rows they alone created redacted; order, lines, events and purchase kept; a `live` order never touched |

The migration seeds the production figure (1 day). On staging and PR databases set the 7-day
figure once after migrating:

```sql
UPDATE retention_policy SET retention_days = 7 WHERE key = 'demo_order_personal';
```

Check a run without writing: the sweep's dry run reports the same counts it would write.

## The refused-post echo cookie

A refused post (field errors, "Use sample details", the cap) answers with a 303 back to the same
screen and carries the posted values and messages once in `fo_checkout_echo`
(`HttpOnly; Secure; SameSite=Lax`, path `/{locale}/checkout`, 5 minutes). The next post of any
checkout form deletes it. This is what lets every step work with JavaScript off.

## What turning the guard off requires

`checkout.demo_guard` off is the step from demo to real orders. It requires, all of them:

- spec 013's live payment step registered (`registerPaymentStep`), with its webhook;
- `legalReadiness(locale, buyerCountry)` true: the company registered in `src/config/company.ts`,
  the privacy page, and the terms and cancellation documents in force and lawyer-reviewed;
- the destination `live` (a florist taking orders) and its VAT rates signed off
  (`docs/compliance/vat-rates.md`);
- the founder's approval of the checkout copy (`pnpm i18n:check --summary` lists what is still
  `reviewed: false`).

With the guard off and a destination still in `preview`, the checkout is **closed**, not demo.

## Rollback

Close the demo (above). Code: `git revert` of the task commits. Demo orders are disposable.
