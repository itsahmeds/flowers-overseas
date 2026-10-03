# Direction A: Warm and personal

`home.html` · `shop.html` · `product.html` are self-contained and link to each other. Open `home.html`.

## The idea, in five lines
1. Sending flowers home is like writing a letter home, so every page is built from letter things: paper, ink, a postmark, a card.
2. The buyer starts with a sentence, not a filter: "I'd like to send flowers to *my mum* in *Poland* for *a birthday*."
3. What the buyer writes appears in a hand-style font, as a preview. The card itself is printed, and the page says so.
4. Dates belong to the recipient's country. Poland's own days (Teachers' Day, All Saints', Wigilia, Dzień Babci, name days) are drawn as stamps.
5. Nothing is louder than the price, the day and "Send". The warmth is in the details, never in the way of buying.

## Palette
| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBF6EF` | page ground, letter paper |
| `--paper-2` | `#F4EBDF` | bands, summary, footer |
| `--card` | `#FFFDF9` | the letter, the card, form fields |
| `--blush` | `#F3DED3` | stamp tint, note card |
| `--butter` | `#F6E9CC` | stamp tint, notes and hints |
| `--sage-wash` | `#E4EADF` | stamp tint, the card's backdrop |
| `--rule` | `#E4D6C6` | hairlines, writing-paper lines |
| `--ink` | `#2B201B` | text (14.7:1 on paper) |
| `--ink-2` | `#5B4A41` | secondary text (7.8:1) |
| `--ink-3` | `#76645A` | captions (5.2:1; never on blush) |
| `--accent` | `#9C3B2B` | rosehip postmark: buttons, links, selections (6.4:1; white on it 6.8:1) |
| `--accent-strong` | `#7E2C20` | hover and pressed |
| `--stem` | `#2F6B47` | the logo's own green: the logo dots and the word "included" (5.9:1) |

## Type
- **Display:** Fraunces, weight 300–400, `SOFT` 100, optical size up to 144. The italic is kept for the one emotional phrase in each heading.
- **Body and interface:** Alegreya Sans 400/500/700, 17 px on phones and 18 px on desktop. It is a humanist sans with a calligraphic origin, so it sits well beside a letter.
- **Hand:** Caveat 500/600. It is used for the buyer's own words (the sentence form and the card preview), the P.S., a named day in the date picker, one margin note and the footer sign-off. Never for prices or buttons, and never to suggest a card is handwritten: cards are printed (founder decision, 2026-10-03).
- **Logo:** unchanged. The live mark (a stem with five petals) and the "Flowers Overseas" wordmark in Newsreader 500 with 0.04 em tracking, loaded as a subset of just those letters.

## What makes it ours
- **The card is part of the gallery.** On the product page the third picture is the buyer's card, previewed live as they type and labelled "Printed on our card". Polish is welcome: every letter prints as typed.
- **The sentence form** on the home page. It carries who it is for into the shop heading ("For your mum, in Poland") and the card's placeholder ("Dear Mum, …") through `sessionStorage`, never the URL.
- **Stamps for dates and a postmark for the brand.** The postmark reads "From where you are · to where they are" around the existing logo.
- **Honest by design.** One all-in price with no "from"; a P.S. that says ordering is not open yet; "Send" opens a recap that says so again; no reviews, counts or claims about florists we have not chosen yet.

## Sources
Names, prices (PLN, all-in), sizes, add-ons, descriptions and alt text come from `seed/data/*` and `messages/en.json`. Photos are `media.flowersoverseas.com` assets; each URL was checked for a 200. Alt text for products whose photos are still pending review is built from the product's own description.

## Card wording
Cards are printed, not handwritten (founder decision, 2026-10-03). The add-on is "Printed card": "Your message, printed on our card and tucked into the bouquet." This replaces the catalogue's "Handwritten card" strings (`catalog.addon.card.*`), which will need new keys.
