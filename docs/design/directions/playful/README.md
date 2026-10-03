# Direction C: "Postmarked" (playful and bright)

**The idea in five lines**
1. Every order is a letter home. The page borrows the language of airmail: postage stamps, postmarks, the red and blue envelope stripe.
2. Our logo already draws a route: a dot at home, a curved line, a flower at the other end. That line is the system. It runs from "You" to the town they type, and it joins the three steps of how it works.
3. The colour comes from the flowers. Poppy red, cornflower blue and sunflower yellow sit on warm milk paper, and every product sits on a soft mat in its own flower's colour.
4. The fun stays in the frame and the conversion stays plain. The all-in price, the day and **Send** are always the biggest, clearest things on the screen, and on a phone the price and Send stay pinned to the bottom.
5. Honest by default. The postmarks print Poland's own dates. The "NOT YET OPEN" stamp says what is true today, and Send opens an envelope that shows the exact price and then says ordering is not open yet.

**Files:** `home.html` · `shop.html` (Poland: category bubbles, filters as a bottom sheet on a phone and a sidebar on desktop, sort, show more, empty state) · `product.html` (`?p=<slug>` renders any of the 84 bouquets; the default is Amber Hour). Every link and control works. All 341 image URLs return 200.

## Palette (OKLCH, declared once in each file's `:root`)
| Token | Value | Use |
|---|---|---|
| `--c-milk` | `oklch(98.6% 0.009 85)` | page ground |
| `--c-cream` | `oklch(96% 0.022 85)` | raised sections |
| `--c-ink` | `oklch(25% 0.06 285)` | text (plum-navy, not black) |
| `--c-ink-2` / `-3` | `oklch(42% 0.05 285)` / `oklch(50% 0.04 285)` | secondary text (7.6∶1 and 5.4∶1 on cream) |
| `--c-poppy` | `oklch(54% 0.2 30)` | Send, prices, "far away" (white text 5.6∶1) |
| `--c-sky` | `oklch(48% 0.16 262)` | route line, links, focus, postmarks (6.5∶1) |
| `--c-sun` | `oklch(87% 0.15 92)` | highlights, always with ink text (10.9∶1) |
| `--c-leaf` | `oklch(44% 0.1 155)` | "included" and ticks |
| `--m-*` | eight tints at about 94% L | the mat behind each photo, keyed to the flower's colour |
| `--airmail` | poppy, white and sky stripes at 135° | page band, summary card, envelope, sticky bar |
| `--logo-ink` / `--logo-accent` | the shipped `oklch(19% 0.01 250)` / `oklch(42% 0.1 155)` | the logo only, kept exactly as it ships |

## Type
- **Display:** Bricolage Grotesque 700–800, tracking −0.025 to −0.035em. It is friendly and a little quirky without looking childish.
- **Body:** Figtree 400–800, 16px/1.55.
- **Logo:** Newsreader 500 at 0.04em tracking, the current wordmark unchanged, plus the current SVG mark.
- **Hand:** Caveat. It appears in one place only: the live preview of the handwritten card.
- **Scale:** display `clamp(2.75rem → 5.5rem)`, h2 `clamp(1.75rem → 2.75rem)`; radii 10, 18 and 28px, plus pills.

## What makes it ours
- **The route line comes from our own logo.** No competitor has a mark that already shows "from here to there".
- **The stamps and postmarks carry real information.** The stamp's denomination is the bouquet's real price (169 zł). The postmarks print Poland's own dates, the delivery day you picked, and "NOT YET OPEN". On a page that cannot yet take an order, they are what makes it feel alive.
- **"There's no customs form" is drawn as a crossed-out form,** because nothing crosses a border. This is the fear a diaspora buyer actually has.
- **The handwritten-card preview takes Polish** ("Sto lat, Mamo!"). The product page is built for a daughter in London writing home.

## Copy notes for the founder
The copy is verbatim from `messages/en.json` and the seed wherever a string exists. Some strings are new or changed and would need keys:
- **New:** "Eight we love for Poland", the picks note, "Made the morning it arrives", "Send these flowers", "Choose a day for it to arrive, then send.", "Nothing matches all of those", "Opening first", "Choosing florists", the price buckets, "Your message, written out by hand", "You would pay", and the reminders confirmation.
- **Changed to the future tense,** because no florist exists yet: "will make it and hand it over", "We will email you the picture", "shops we choose ourselves".
- **Dropped:** "Most sent this week", and "Poland · Delivering now", which contradicts the shop page.
- **Rewritten:** the vase line no longer says "the photograph is styled with one", because the Amber Hour photo shows kraft wrap, not a vase.

The shop and product grids are rendered by inline JS for this prototype. The real pages must render them on the server.
