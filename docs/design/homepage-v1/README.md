# Homepage design v1 (approved direction, 2026-09-08)

Source of truth for spec 004's visual system. Live canvas: https://claude.ai/code/artifact/85223187-e309-43c6-bd17-1f151fe89528

- `tokens.css` — colour, type, spacing, radius tokens (OKLCH; white paper, cool-grey inks, forest-green accent). Spec 004 task 1 lifts these into Tailwind v4 `@theme`.
- `homepage-desktop.dc.html`, `homepage-mobile.dc.html` — the approved layouts (Design Component format; `<x-dc>` body is plain HTML + inline styles referencing the tokens).
- `identity.dc.html` — the chosen mark and its system; `content/brand/mark.svg` is the production SVG (hex equivalents of the tokens).
- `canvas.json` — artboard layout and the design notes (competitor synthesis, decisions).

Decisions recorded from the founder review: white background for trust; forest-green single accent; Newsreader + IBM Plex Sans; commerce header (logo left, search with button, Sign in / My orders / Basket, category row); type-ahead country finder → town/postcode → date → neutral "Continue"; occasion row; "Most sent this week" gated on real orders; verified-reviews section hidden until real reviews exist; no fabricated numbers, reviews or photos (photo slots are marked placeholders).

## Round 6 additions (competitor gap check, 2026-09-08)
Help line (phone and WhatsApp +1 (213) 592-5150, hours) in the utility strip; "Coming up in Poland" occasion-date strip with order-by cutoffs; "Meet the florists" section (real partners only, hidden until signed); five-question FAQ; occasion-reminder email signup (double opt-in). Founder decision recorded: reviews are real-only — no seeded or fake reviews (EU UCPD/Omnibus blacklist; Trustpilot/Google policy); a founding-customer offer on the first orders is the route to real reviews. These sections extend TASK-049/053/054 scope.
