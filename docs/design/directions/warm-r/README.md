# Direction A · researched palette ("Letter home")

`home.html` · `shop.html` · `product.html` are self-contained and link to each other. Open `home.html`.

This is direction A ("Warm and personal", `../warm/`) with a palette chosen from research. The layout, type, copy, logo and sentence picker are A's. Cards stay **"Printed on our card"**. Research and sources: [`../research-colour.md`](../research-colour.md).

## Why these colours, in five lines
1. A warm, bright paper ground and a cool blue-black ink: calm and competent, like a letter from home ([§1](../research-colour.md#1-what-research-says-about-colour-warmth-trust-and-urgency)).
2. One saturated colour, **peony**, for what you act on: pink means love and joy across 30 nations, without red's anger, the Polish flag, the UK poppy or a "sale" look ([§1](../research-colour.md#1-what-research-says-about-colour-warmth-trust-and-urgency), [§3](../research-colour.md#3-cultural-meanings-in-poland-and-the-uk)).
3. **Airmail blue** is the journey: links, the postmark, and the buyer's own words, written as if in a blue pen.
4. Prices stay in ink, never red or pink, because red prices read as discounts ([§1](../research-colour.md#1-what-research-says-about-colour-warmth-trust-and-urgency), [§4](../research-colour.md#4-accessibility)).
5. No purple, no black, no red-and-white pairing: those are mourning, Lent or the flag in Poland, and "blood and bandages" in a UK hospital ([§3](../research-colour.md#3-cultural-meanings-in-poland-and-the-uk)).

## Palette
| Token | Value | Use | Contrast |
|---|---|---|---|
| `--paper` Letter paper | `#FBF6EE` | page ground | |
| `--paper-2` | `#F4EBDE` | bands, summary, footer | |
| `--card` | `#FFFDF9` | the letter, the card, fields | |
| `--ink` Blue-black ink | `#1E2A44` | text, prices, the dark band | 13.3:1 |
| `--ink-2` / `--ink-3` | `#46516B` / `#566077` | secondary text / captions | 7.4:1 / 5.9:1 (≥ 4.88 on every wash) |
| `--accent` Peony | `#A3285A` (hover `#83204A`) | Send and other filled buttons, selections, the italic phrase, focus ring | 6.5:1; white card text on it 6.9:1 |
| `--pen` Airmail blue | `#2B5596` (hover `#1F4278`) | links, eyebrows, postmark, step numbers, the hand-style words | 6.9:1 |
| `--stem` Stem green | `#2F6B47` | "included" | 5.9:1 |
| `--butter` Apricot | `#F6DFC4` | stamp tint, hints, P.S. tape, text on the dark band | 11.1:1 on ink |
| `--blush` Peony wash | `#F6E1E7` | stamp tint, note card, error ground | |
| `--sage-wash` Airmail wash | `#E2E9F3` | stamp tint, the card's backdrop | |
| `--rule` | `#E2D8CB` | hairlines, writing-paper lines | |
| `--logo-ink` / `--logo-accent` | `oklch(19% 0.01 250)` / `oklch(42% 0.1 155)` | the logo, exactly as it ships | |

## What changed from A
- Only the `:root` tokens, plus four colour assignments: the hand-style words, the sentence picker's dashed line and chevron, and the named-day tag are now in airmail blue, and the card thumbnail's text is in ink, like the card preview.
- One fix carried over from A: the live country pill ("Poland → see the flowers") no longer paints its label as a white chip (the selector is now `.countries li > span`).
- Checked in Chromium at 390 px and 1440 px: no console errors, no failed requests, no horizontal scroll, and every relative link resolves.
