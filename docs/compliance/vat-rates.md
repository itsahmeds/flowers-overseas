# VAT rates per destination — the authored figures and their status

The rates the application prices with are authored in one place,
`src/config/catalogue/prices.data.ts` (`DESTINATION_PRICING`, TASK-062): two per destination, the
**flowers** rate that every `country_price` row carries and the **standard** rate that every
`addon_country_price` row carries. This file is the compliance record of where each figure came
from and whether an accountant has confirmed it, because a rate is a number a buyer's invoice is
built from and not an implementation detail.

`plan/06` §4 item 4 puts "treatment of add-ons (chocolates 23% vs flowers 8% in PL: mixed-rate
invoices)" on the must-confirm list for the accountant **before the first paid order**. Poland is
the only destination that figure is documented for, and it is the only destination that is `live`.

| Destination | Status (`src/config/countries.ts`) | Currency | Flowers | Standard (add-ons) | Status of the figure |
|---|---|---|---|---|---|
| PL | `live` | PLN | 8% (800 bp) | 23% (2 300 bp) | **Documented** — `plan/06` §4 item 4 and §3's place-of-supply table ("Polish VAT (8% flowers) on a domestic supply"). Still on the accountant's must-confirm list for the *mixed-rate invoice* mechanics, not for the rates themselves |
| DE | `demo` | EUR | 7% (700 bp) | 19% (1 900 bp) | **Provisional — accountant to confirm** |
| FR | `demo` | EUR | 20% (2 000 bp) | 20% (2 000 bp) | **Provisional — accountant to confirm** (cut flowers authored at the standard rate) |
| ES | `demo` | EUR | 10% (1 000 bp) | 21% (2 100 bp) | **Provisional — accountant to confirm** |
| IT | `demo` | EUR | 10% (1 000 bp) | 22% (2 200 bp) | **Provisional — accountant to confirm** |
| RO | `demo` | RON | 19% (1 900 bp) | 19% (1 900 bp) | **Provisional — accountant to confirm** (flowers authored at the standard rate) |
| NL | `demo` | EUR | 9% (900 bp) | 21% (2 100 bp) | **Provisional — accountant to confirm** |

## Why a provisional rate is safe to hold in the tree

No order can be placed into a `demo` destination (spec 005 §2 "Availability"), so no invoice and
no payment depends on any of the six provisional rows. They exist so that a country go-live is a
data flip rather than a code change (`CLAUDE.md`) — and this table is the gate on that flip: a
destination moves from `demo` to `live` only once its two rates are **confirmed by the accountant
in writing and this row is updated with the date and the source**, together with the rest of the
`plan/06` §4 list for that country.

Six of the seven reduced/standard splits above also assume the *reduced* rate applies to cut
flowers and made-up floral goods rather than to the whole basket; where the reduced rate is not
available (FR, RO as authored) the flowers rate is set equal to the standard rate, which
over-states rather than under-states the tax and cannot produce a shortfall.

## What the code guarantees regardless of the figures

- Add-ons carry the **standard** rate, never the flowers rate: `pnpm catalogue:check`'s
  `addon-price` mode fails on any `addon_country_price` row whose `vatRateBp` is not its
  destination's `standardVatRateBp` (PL chocolates at 8% is the fixture, spec 002 §14 A1 (a),
  spec 005 §13 Q3).
- Every retail row carries its destination's `flowersVatRateBp`
  (`tests/unit/catalogue-prices.test.ts`).
- The rate is a **basis-point integer** on the row and the price is VAT-inclusive, so the
  decomposition is derived from the row rather than from a constant in a component (spec 005 §2
  "Pricing"; the arithmetic is TASK-066's `vatBreakdown`).

## When to change this file

- The accountant confirms a country's rates → update the row with the date and the source, and
  say so in the PR that flips the country to `live`.
- A statutory rate changes → the change is a **superseded price row**, not an edit
  (`prices.data.ts` §"History is superseded rows"), and this table records the new figure and the
  date it took effect.
- A new destination is authored → it starts here as "provisional — accountant to confirm".

Related: `plan/06` §3 (place of supply, supply model), `plan/06` §4 (the accountant's
must-confirm list), `docs/compliance/ropa.md` (data flows), spec 005 §2/§13 Q3, `plan/13` (open
questions).
