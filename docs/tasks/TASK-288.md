# TASK-288 — Spec 043 header in context

Row: `TASKS.md` → TASK-288. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 A (the browse model, §13 Q1 answered A) and §12 task 1. Founder approval 2026-10-20, "all defaults, keep going".
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-6; tests T-01 to T-04 and T-06. `destinationShopLinks()`, the per-route header slot (a matching page or catch-all for every route under `src/app/[locale]`), `site-links.ts` unchanged.
- No `headers()`, `cookies()` or `searchParams` read on a prerendered route; no `Vary`, no `Set-Cookie`; `budget:client-js` no larger than `main` on any route (AC-4).
- Waits for neither TASK-239 nor TASK-241 (§12 item 1, advisor fix).
- `docs/design/` artboards from PR 295 (spec 043): the header href tables in `country-shop-*`, `corridor-country-*` and `product-*` (the header itself is not redrawn: labels and look unchanged); each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- AC-20 (T-20) is the design PR's (§12 item 5, PR 295); this task matches the artboards.
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): internal links, SEO markup and caching, no money or legal text; the reviewer may call the breaker, and that call binds.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- `src/modules/ui` header and phone Menu, `src/config/site-links.ts`, the category and occasion hub destination lists

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the spec 043 review (PR 292, nit 2) found the §14 pointers in specs 004, 007 and 008 still saying "Status: draft ... binding when the founder approves", and `specs/README.md` listing "043 site clarity (draft)". If PR 292 has not fixed them when this task starts, set all four to approved in this PR.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-21, AC-6 is false on `main`, independent of this task** (frontend-implementer → orchestrator; `open`). The T-06 crawl over the built site finds 20 of the 23 category hubs in `en` and `en-gb` (`anniversary-flowers`, `arrangements`, `birthday-flowers`, `congratulations-flowers`, `flowers-and-gift-sets`, `funeral-and-sympathy-flowers`, `gerberas`, `get-well-flowers`, `just-because-flowers`, `lilies`, `mixed-flowers`, `new-baby-flowers`, `orchids`, `peonies`, `romantic-flowers`, `sorry-flowers`, `sunflowers`, `sympathy-flowers`, `thank-you-flowers`, `tulips`) linked by no page of the site but their own language alternates (`grep` over `.next/server/app`), so they are at no depth from any home and have no out-of-context inbound link. The header never named them, on `main` or here, so this PR changes nothing for them; the other three category hubs and every occasion hub pass AC-6. Spec 043 §6 assumed they were reachable ("Every hub stays at crawl depth ≤ 3"). Question: (a) amend AC-6 to "every hub the header links, and no hub loses a link it had on `main`", with the orphans a new row; or (b) plan a row that links every category hub from an out-of-context page (TASK-289's "change destination" link reaches them at depth 3 from country categories, but that link is in context). Until ruled, `tests/e2e/header-in-context.spec.ts` pins the 20 by slug as a subset (`ORPHAN_CATEGORY_HUBS_ON_MAIN`), so any other hub losing reachability or its last out-of-context link still fails.
- **2026-10-21, the carry-forward on the spec status lines** (frontend-implementer → orchestrator; `open`). Setting spec 004/007/008 §14's "Status: draft … binding when the founder approves spec 043" lines and `specs/README.md`'s "043 site clarity (draft)" to approved was refused by the permission classifier (the edit records an approval). Not done here; the orchestrator or the founder makes it.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21 (frontend-implementer): `destinationShopLinks()` / `pageDestination()` in `src/modules/catalog/shop-nav.ts` over the hubs' own row rule (`hubDestinationHref()`, extracted from `linksFor()` in `listing.ts`, behaviour unchanged); the whole header moved into a new `@header` slot with a page for every route under `[locale]` (`route-header.tsx`), `@notice` deleted (its home/claim rule now lives in the slot). Unit: `catalog-destination-shop-links`, `header-slot`; main's out-of-context hrefs pinned in `tests/fixtures/header/out-of-context-hrefs.json` (captured at 3efcdc39). Next: e2e `header-in-context.spec.ts`, codebase map, gates, PR.
- 2026-10-21: e2e `header-in-context.spec.ts` green against a local build (68 tests); mutations watched red; map regenerated; gates PASS on 6f9b6047; PR #308 ready with `ci:full`. AC-6 escalated (20 category hubs orphaned on `main`), row `blocked` on that ruling only. Carry-forward on the spec 004/007/008 §14 status lines and `specs/README.md`: not done, the permission classifier refused the edit (it records an approval); left for the orchestrator.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR #308 (`task/TASK-288-header-in-context`). On a page whose URL names a destination with a shop (shop root, country category, country occasion, product, guide, and the `_query` parameter routes) the header row and the phone Menu link Our selection, Bouquets, Roses, Plants, Birthday and Sympathy to that destination's own pages: `destinationShopLinks()` reads each hub's own destination row (`hubDestinationHref()`, extracted unchanged from `linksFor()` in `listing.ts`) and falls back to the shop root; `pageDestination()` reads `resolveLocalePath()`. The header is now drawn by an `@header` parallel-route slot with a page for every route under `[locale]` (`route-header.tsx`); the `@notice` slot is folded into it (no claim on the home only), and the header's language links ask for the segments `@switcher` asks for. Out of context every href equals `main`'s (captured at 3efcdc39 in `tests/fixtures/header/out-of-context-hrefs.json`). `site-links.ts` is unchanged; no message key added (`i18n:check` exit 0, the `en-gb` share untouched); no client module. Tests: unit `catalog-destination-shop-links.test.ts` (20), `header-slot.test.tsx` (43: route-tree diff, out-of-context baseline × 7 routes × 2 locales, in-context table × 7 routes × 2 locales, claim, switcher segments, static source scan), plus `app-shell`, `catalog-barrel`, `ui-barrel` updated; e2e `header-in-context.spec.ts` (70 in `e2e-desktop`: T-01 row at 1440 and Menu at 390 with JS off, T-03 baseline and `router.push` soft navigation with a surviving window marker, T-02 header-target crawl, T-04 headers/bodies/prerender manifest, T-06 hub crawl). Mutations watched red: slot ignores the shop links (unit 14 red, e2e T-01 red), no shop-root fallback (1), Birthday by category-of-the-same-key guess (1), a hub read as in context (3), a slot page deleted (unit route-tree 4; e2e soft navigation to `/en` with the home slot page deleted: red at the stale-row step while the full load passed), `headers()` in a slot file (1). **Local build** (build slot, load average 3.6 → 9.5 during the run): taken because a new parallel-route slot's prerendering and soft-navigation behaviour cannot be judged from unit tests; `next build` exit 0 with every listing, hub and product route still `●` (SSG) and `_query`/`boom` `ƒ` as before; the e2e file 68/68 green against it after the T-06 pin. `budget:client-js` and Lighthouse are CI's. `pnpm gates:cheap` on 6f9b6047 (one earlier run on the same SHA went red in `tests` at load average 25 and passed twice on re-run, unchanged tree):

```
gates:cheap · 6f9b604702aeb0f2ea318633a2346b5dea467aa6 · tree clean · base origin/main · 2026-10-21T13:46:15.005Z
typecheck             exit 0 · 2.9 s
lint                  exit 0 · 36.2 s
format:check          exit 0 · 17.7 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 45.6 s · changed 105 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Handed on: AC-6's 20 orphan category hubs (escalation above); the spec-status carry-forward (escalation above).
