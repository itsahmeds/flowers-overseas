# Direction A in C's colours

`home.html` · `shop.html` · `product.html` are self-contained and link to each other. Open `home.html`.

This is direction A ("Warm and personal", `../warm/`) with direction C's palette (`../playful/`). The layout, type, copy and the letter-home idea are the same as A; the two are built from the same source. Only the colours change, plus three small airmail touches.

## The idea, in five lines
1. Sending flowers home is like writing a letter home: paper, ink, a postmark, a card.
2. The buyer starts with a sentence: "I'd like to send flowers to *my mum* in *Poland* for *a birthday*."
3. Poland's own dates are drawn as stamps, now in the three flower colours.
4. Poppy red is for what you act on: Send, prices and the one emotional phrase. Cornflower blue is for where you go: links, labels and the postmark. Sunflower yellow highlights.
5. The card preview uses a hand-style font, but it is labelled "Printed on our card and tucked into the bouquet", because cards are printed.

## Palette (C's values, in A's roles)
| A's token | Value | Use | Contrast |
|---|---|---|---|
| `--paper` | `oklch(99.8% 0.002 85)` (lighter milk, founder 2026-10-03) | page ground | |
| `--paper-2` | `oklch(98.9% 0.006 85)` (lighter cream) | bands, footer | |
| `--card` | `oklch(99.6% 0.004 85)` | letter, card, fields | |
| `--ink` / `-2` / `-3` | `oklch(25% 0.06 285)` / `42%` / `50%` | plum-navy text | 15.6, 8.2 and 5.8:1 on milk |
| `--accent` | `oklch(54% 0.2 30)` poppy | Send, prices, italic phrase | 5.4:1; card text on it 5.5:1 |
| `--sky` | `oklch(48% 0.16 262)` cornflower | eyebrows, links, postmark, selected chip and day | 6.5:1 |
| `--sun` | `oklch(87% 0.15 92)` sunflower | underline under "far away", P.S. tape, text on the dark band | 10.9:1 on ink |
| `--blush` / `--butter` / `--sage-wash` / `--leaf-wash` | poppy, sun, sky and leaf at about 94–96% L | stamp tints, card backdrop, summary | ink-3 is at least 4.9:1 on each |
| `--stem` | `oklch(44% 0.1 155)` leaf | "included" | 7.1:1 |
| `--logo-ink` / `--logo-accent` | `oklch(19% 0.01 250)` / `oklch(42% 0.1 155)` | the logo, exactly as it ships | |

## Borrowed from C, sparingly
- **The airmail edge** (poppy, white and cornflower stripes) appears in three places only: the top of the sentence letter, the top of the "Here is what will arrive" recap, and the top of the footer.
- **Stamp colours.** The date stamps use sunflower, leaf, poppy and cornflower tints.
- Nothing else from C's layout was used.

## Type
The same as A: Fraunces (display), Alegreya Sans (body), Caveat (the buyer's own words and a few notes, never prices or buttons), and the unchanged Newsreader wordmark with the live mark.

## Card wording (both variants)
Cards are printed, not handwritten (founder decision, 2026-10-03). The add-on is "Printed card": "Your message, printed on our card and tucked into the bouquet." The preview is labelled "Printed on our card · included", and the recap says "A printed card". These replace the catalogue's "Handwritten card" strings and will need new keys.
