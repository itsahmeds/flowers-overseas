# Homepage design v1 (approved direction, 2026-09-08)

Source of truth for spec 004's visual system. Live canvas: https://claude.ai/code/artifact/85223187-e309-43c6-bd17-1f151fe89528

- `tokens.css` — colour, type, spacing, radius tokens (OKLCH; white paper, cool-grey inks, forest-green accent). Spec 004 task 1 lifts these into Tailwind v4 `@theme`.
- `homepage-desktop.dc.html`, `homepage-mobile.dc.html` — the approved layouts (Design Component format; `<x-dc>` body is plain HTML + inline styles referencing the tokens).
- `identity.dc.html` — the chosen mark and its system; `content/brand/mark.svg` is the production SVG (hex equivalents of the tokens).
- `canvas.json` — artboard layout and the design notes (competitor synthesis, decisions).

Decisions recorded from the founder review: white background for trust; forest-green single accent; Newsreader + IBM Plex Sans; commerce header (logo left, search with button, Sign in / My orders / Basket, category row); type-ahead country finder → town/postcode → date → neutral "Continue"; occasion row; "Most sent this week" gated on real orders; verified-reviews section hidden until real reviews exist; no fabricated numbers, reviews or photos (photo slots are marked placeholders).

## Round 6 additions (competitor gap check, 2026-09-08)
Help line (phone and WhatsApp +1 (213) 592-5150, hours) in the utility strip; "Coming up in Poland" occasion-date strip with order-by cutoffs; five-question FAQ; occasion-reminder email signup (double opt-in). Founder decision recorded: reviews are real-only — no seeded or fake reviews (EU UCPD/Omnibus blacklist; Trustpilot/Google policy); a founding-customer offer on the first orders is the route to real reviews. These sections extend TASK-049/053/054 scope.

## Round 7 (2026-09-08)
"Meet the florists" removed (we are the florists to the buyer). Country field simplified to a plain type-ahead: type, see the matching country, pick.

## Round 2, founder direction (TASK-059 competitor pass, 2026-09-09)

The approved visual system is untouched — same paper, same OKLCH ramp, same Newsreader + IBM Plex
Sans pairing, same spacing scale, same section paddings, same finder card, same colophon footer.
This round changed **copy and section order only**, per the founder's instruction, and every change
is listed here.

**Section order.** The two priced product rows — "Bouquets we can deliver in Poland today"
(*was* "Bouquets for Poland") and "Most sent this week" — moved up from positions 5 and 6 to
positions **3 and 4**, directly after the hero and the four-fact proof strip and ahead of every
editorial section ("Coming up in Poland", "Shop by occasion"). That is founder direction 2: products
with prices before prose. Nothing else moved, and no padding, gap or grid changed.

**Copy, in the first person (spec 004 §14 A5).**

- Footer colophon: "International flower relay. You order, a vetted local florist makes and
  delivers." → "We send flowers across Europe. You order from us; our florist in the recipient's
  town makes the bouquet and hands it over in person."
- Proof strip: "Made by a florist in their town / Independent shops we have visited" → "We make it
  in their own town / Independent shops we chose ourselves"; "The price you see is final / Delivery
  and VAT included" → "The price you see is what we charge / Delivery and VAT already in it";
  "Photo on delivery / You see it in their hands" → "We photograph it at the door / The picture
  reaches you the same day"; "Redeliver or refund, your choice" → "We redeliver or refund, your
  choice".
- Section label "How a relay works" → "How we send your flowers", and the section now opens with the
  three-sentence cross-border explanation the study found only on Interflora PL and Euroflorist PL:
  you order from us, our florist makes and hands it over, nothing crosses a border so there is no
  customs form and nothing to pay on arrival.
- Every cutoff now names the recipient's time zone: "Order by 14:00 local time for same-day" →
  "Order by 14:00 in Warsaw — the recipient's own time, not yours — and it arrives today"
  (1-800-Flowers is the only site in the field that states the recipient's zone).
- Destinations: "as we vet florists" → "as we choose florists", and "we have visited enough florists"
  → "we have met enough florists there to stand behind every order — across Europe, and only where
  we really are" (A5's geographic cap).
- Product cards: "starting at ▮" → "▮ all in", with the section subline stating that every price
  includes delivery and Polish VAT and that Sunday costs 29 zł more and says so on the date chip.
- Header category row now prints the destination's real occasion dates — All Saints 1 Nov, Andrzejki
  29 Nov, Wigilia 24 Dec, Women's Day 8 Mar — the way 1-800-Flowers prints "Labor Day (9/7)".
- Utility strip and footer carry the human channel with hours; the footer adds a line saying that
  weekend hours are a founder decision, not a design one.

**What did not change, and why.** The price slot stays a `Placeholder` bar rather than a number:
`country_price` has no rows yet, so a printed price would be an invented one, and the round-6 honesty
decision stands. The founder's "prices visible above the fold" is satisfied structurally — the slot
is above the fold and renders the all-in amount the moment those rows exist. The reviews section
stays hidden, the Trustpilot slot stays a placeholder, and no photograph, count or rating was added.

**Where this artboard now differs from the wireframes.** The wireframes print example prices
("189 zł") because they are wireframes; `homepage-v1/` is the approved finished direction and prints
placeholders. An implementer reads the wireframe for structure and this artboard for finish.
