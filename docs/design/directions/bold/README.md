# Direction B — Modern and bold

Open `home.html`. All three pages link to each other, and every control on them works.

## The idea in five lines
1. We show the flowers big and almost every word small: edge-to-edge photographs, one heavy grotesk, wide margins.
2. The recipient's country gets the largest type on the page. On the shop page, "Poland" is set at about 200 px.
3. Their calendar comes before ours. Poland's own dates appear as huge numerals on a black band (1 Nov, 8 Mar, 26 May).
4. There is one colour, poppy, and it marks only three things: Send, the dot that starts a label, and the next date.
5. Every number on the page is an all-in price taken from the seed data, and the page says plainly that ordering is not open yet.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(98.8% 0.004 85)` | page background |
| `--paper-2` | `oklch(95.5% 0.007 75)` | receipt, disabled dates |
| `--plaster` | `oklch(80% 0.014 65)` | image wells; it matches the photographs' own backdrop |
| `--ink` / `--ink-2` / `--ink-3` | `oklch(18% …)` / `40%` / `50%` | text: 18.2, 8.9 and 5.8 to 1 on paper |
| `--poppy` | `oklch(66% 0.2 36)` | the one accent, always with **ink** text on it (5.6 to 1) |
| `--poppy-deep` | `oklch(52% 0.19 32)` | Send hover, with paper text on it (5.9 to 1) |
| `--forest` | `oklch(42% 0.1 155)` | the logo's dot and heart, and nothing else |

Type: **Archivo** (Google Fonts) for display and UI. Display is 800 weight, `font-stretch: 112.5%`, tracking −0.04em, line-height 0.9. The fluid steps are `--t-mega` (shop country name, 84 to 216 px), `--t-hero` (48 to 116 px), `--t-1` (36 to 76 px), `--t-2` and `--t-3`. Labels are 12 px, 600 weight, uppercase, tracking 0.14em. **Newsreader** is the face of the wordmark. Here it also sets the italic phrase inside a headline ("*far away.*") and the product descriptions. Corners are square, there are no shadows, and rules are 1 px hairlines.

## What makes it ours
- **The logo is unchanged**: the same mark geometry in ink and forest, with the Newsreader wordmark at 26 px. The footer repeats it as a giant full-width wordmark.
- **The route.** The mark's stem pulled straight: an origin dot, a line, a bloom ("You ●——✿ Poland"). It is our only ornament.
- **Their dates, not ours.** Mother's Day in Poland is 26 May. A London sender keeps the UK date in March, so this direction makes the destination's calendar the hero of the page.
- **The image wells are the photographs' own grey**, so 84 bouquets read as one shoot.

## Honesty notes
- Prices, names, sizes, add-ons, descriptions and alt text come from `seed/data`, and the dates come from the live Poland page.
- Every image URL was checked and returns 200. Heroes exist at 384, 640 and 828 px; detail and occasion images only at 384 px.
- Send opens "Ordering is not open yet" with the order summary. Nothing pretends to take an order.
- I left out the live line "the photograph is styled with one [a vase]", because these photographs show no vase.
- **New strings** (no message key exists yet): "Send", "Choose a date", "Choose a delivery date first.", "Nothing matches all of that." / "Take one filter off and the listing comes back.", "Clear filters", "Show N bouquets", "Filter", "Price, all-in", "Under 200 PLN" and the other price bands, "Nothing in the listing for it yet.", "Each date is the one Poland keeps, worked out from Poland's own rule.", "· 23% on add-ons", "The bouquet".
- `[slot]` for spec 004 / 008: the type and occasion filters derive from the catalogue fields (`productType`, `flowerTypes`, `occasions`, `colours`). Spec 008 owns the real facets.
