# TASK-277 — Card motion on every product card, and the button press

Spec 004 §14 A23 clause 11, A24 clause 9; AC-44, AC-6 (T-48, T-06). Design: `docs/design/system/motion.dc.html` motion 6. Regression on TASK-194 (PR 221).

## Binding

- Motion 6 ("Card lift and photo zoom; button press") binds on **every product card**: "Where: Every product card; every pill button" (`motion.dc.html` motion 6). PR 221 attached it only to `src/modules/ui/shop/ProductCard.tsx`. The home trending row (`src/modules/ui/home/TrendingRow.tsx`, `CardLink`) shows only the name underline on hover (founder screenshot, 2026-10-19).
- Attach the same `data-fo-card-motion` hook (CSS in `src/app/globals.css`, unchanged rules) to every card that links to a product page: the home trending row and any other product-card variant the map lists. Keep the image inside a clipped box so the 3 % zoom never overflows (CLS 0, transform only).
- **Button press, the other half of motion 6:** every pill button (primary and secondary) presses to `scale(0.98)` on `:active` over `--duration-fast` (`motion.dc.html` motion 6 Tokens). PR 221 shipped no press rule (no `:active` or `0.98` in `src/app/globals.css`; reviewer nit on PR 281). Transform only; reduced motion: no press.
- The priority (LCP) card keeps no motion, as spec 004 AC-44 and the design note bind ("the home photograph and each lead photograph never fade, zoom or wait"); do not change that here.
- Reduced motion: no lift, no zoom (AC-6). Fine pointer hover only.
- Values come from the existing tokens; the founder's "premium A" comparison (designer, 2026-10-19) may later change the tokens, not this attachment.

## Read

- `docs/design/system/motion.dc.html` motion 6; `src/app/globals.css` motion 6 block; `src/modules/ui/shop/ProductCard.tsx` (how the hook and clipped box are done); `src/modules/ui/home/TrendingRow.tsx`; `tests/unit/motion-css.test.ts` and the T-48 tests.

## Carry-forwards

- From PR 221: HOLE 5b CARRIED (the `defaultPrevented` guard's Playwright mutation) belongs to TASK-244, not here.

## Escalations

## Progress

- Work-order correction (binding, 2026-10-19): the values are spec 004 §14 A-founder-2026-10-19e's (premium column of `system/motion-premium.dc.html`), not motion 6's original 2 px / 3 %. The pill press already existed (`motion-safe:active:scale-[0.98]` in `Button.tsx` and `noticeShell.ts`); it is replaced, not doubled, by the `fo-pill` press in `globals.css` (press 120 ms `--ease-standard`, release 200 ms `--ease-emphasised`) because the AC reads `transform: matrix(0.98 …)`, which Tailwind's `scale-*` (the `scale` property) never sets. Checkout's pills and the consent banner's keep today's behaviour (19e clause 2).
- 2026-10-19: token `--duration-hover` in both files; motion 6 CSS at the 19e values; `cardMotion.tsx` (shadow layer, name line) on `ProductCard` (not priority) and every linked `TrendingRow` card; `fo-pill` layer on `Button` primary/accent/secondary/danger and the two notice actions; T-48 unit cases with 13 mutations red; e2e 6b rewritten to every 19e AC-44 bullet.
- 2026-10-19, CI run 39232677801 red on e2e (10): fixed the shadow assertion (geometry plus 0.12 alpha from any colour function; Chromium prints `lab(…)` for the oklch token), retimed `reduced-motion.spec.ts` to 19e (f) (rest 200 ms, held press 120 ms), and exempted the resting shadow layer (19e (c) binds an `aria-hidden` element) from AC-45's ornament probe with a planted-ornament check in the same case. `frame-laptop-band.spec.ts:466` on `/en-gb/send-flowers-to/poland` is a `test.fail` expected failure (pending owner), not in the failed count and not retried: no change.

## Result

PR [#285](https://github.com/itsahmeds/flowers-overseas/pull/285). AC-44 (as A-founder-2026-10-19e amends it) and AC-6: the token in both files, the clause-1 CSS, the two card layers on `ProductCard` (not priority) and every linked trending card, the `fo-pill` layer and press on `Button` and the notice actions. T-48: unit value-for-value cases with each 19e mutation red (13 CSS, plus the priority-guard and pill markup mutations); e2e 6b covers every AC-44 bullet and is judged in CI (no local browser run; no build slot taken). `pnpm gates:cheap`: PASS (7 of 7). Visual baselines: none expected to change (layers rest invisible; hover is not captured).
