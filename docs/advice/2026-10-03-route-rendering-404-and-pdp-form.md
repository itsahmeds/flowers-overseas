ADVISOR: GO WITH FIXES

# Route rendering, the depth-3 404s (TASK-170) and the product-page form (TASK-128)

**In one sentence:** the two blocked tasks have one cause: Next renders a whole route file per request as soon as one page type in it reads the `?…` part of the address. Both can be unblocked by one rule: route files never read the `?…` part, and requests that carry a parameter the site recognises are handed to one separate renderer. That is GO WITH FIXES, because it needs three short spec amendments and one measurement first.

## Verdict

**TASK-170: GO WITH FIXES. Choose option (a), done this way.** Move the `?page=`/`?sort=` handling out of the depth-3 route file and into one new internal "parameter route". `next.config` sends a request there only when it carries `page`, `sort`, `tier`, `date` or one of spec 008 Q6's facet names: a `beforeFiles` rewrite with a `has: query` condition, built from the locale registry the same way `listing-cache-headers.ts` already is. The browser address does not change and nothing redirects. The depth-3 route goes back to being fully prebuilt, so the router's existence gate works again, and the 7 red shapes become the real `lang` document.
- *Cost:* one route file, about 20 lines of config, and moving the `searchParams` read and TASK-114's source-reading tests. Build time stays about the same, because those pages are already prerendered [inferred].
- *What is left:* an unknown page **plus** a known parameter (`/en/send-flowers-to/nowhere?page=2`) still gets a 404 without `lang`. The status is correct and nothing links to it; pin it with a test.
- *Fixes before dispatch:*
  1. Spec 008 §5.4 and §14 A5: record that this rewrite is keyed on parameter names in `next.config`. That is not the proxy rewrite A5 rejected: no catalogue data, and `src/proxy.ts` is untouched.
  2. Widen TASK-170's fence, and lift TASK-146's "do not reshape the depth-3 route".
  3. Spike first, in one build slot. Confirm that the depth-3 route gets a `dynamicRoutes` entry, that the query reaches the parameter route intact, that `?utm_source=` gets the prebuilt HTML, and that it all works under standalone `next start` (Railway). If it fails, fall back to option (d).
- *Rejected:* (b) puts a second copy of the existence set in the proxy, and the two copies will drift. (c) Cache Components: Next's own docs say a request-time `notFound()` then streams with status **200**, which fails AC-8's "not 200", and it removes `dynamicParams` (spec 003 A3).

**TASK-128: GO WITH FIXES, after TASK-170.**
- **E-1:** the bare product page stays prebuilt (A6 is untouched). The form stays `method="get"` to the bare URL. A submitted `?tier=&date=` is rewritten to the same parameter route, which renders the selection with `noindex` and the shared-cache header. No new URL shape and no client-only content. An address carrying only unknown parameters (`gclid`, `fbclid`) gets the prebuilt page with its canonical to the bare URL. That matches spec 007 §14 A5's "canonical stripping", so amend 009 §5.2/AC-15 and 008 to say this instead of `noindex`.
- **E-2:** in Phase 0, T-24 asserts a pure per-state policy (`live` means 300 plus `cutoff:{iso2}`) and the `urlsForTag` registry. The task that makes the first country live sets the depth-4 route to 300 and purges that country's pages at its cutoff time.
- **E-3:** rule the tier change as JavaScript-only in Phase 0. Every tier's price is already printed beside it (§5.3) and nothing can be bought yet. No new copy is needed, and AC-13's JS-off clause applies to the `live` state.
- **E-4:** one agent, in this order: TASK-170, then TASK-146 (still before TASK-096), then TASK-128.

## The four hats

**Building**
1. Two route files will render the same page types, and they can drift apart. Both must call `resolveLocalePath` and the same view function, and one test should compare their bodies (008 A5).
2. The proxy runs before `beforeFiles` rewrites ([Next rewrites docs][rw]), so the request id and the locale header are kept. Confirm this in the spike.
3. Without this rule, TASK-146 and TASK-128 make depth 4 per-request, which silently undoes spec 009 A6's gate for products (TASK-128 E-1).

**Google**
1. The main risk avoided: 2,352 product pages and every country listing rendered per request, and the TTFB/CWV cost that comes with it ([page.js docs][pg]: `searchParams` "opt[s] the page into dynamic rendering").
2. The 404 hole itself does not affect ranking: the status is already 404.
3. Unknown-parameter addresses become `index` plus a canonical to the bare URL. That is safe for identical content [inferred].

**Law and compliance**
1. WCAG 3.1.1 (Level A, page language) is fixed for every linked or typed shape except the residual one. The EAA has applied to online shops since 28 June 2025.
2. When a country is live, a cached page could show a delivery date that can no longer be met. That is a misleading-information risk (UCPD, UK DMCCA), so checkout must re-check the date and price on the server. A professional should review the cutoff wording before go-live. This is not legal advice.
3. GDPR: no concern. The parameters carry no personal data, and the proxy logs only the path.

**Customer**
1. Nothing visible changes. Product pages stay prebuilt, which keeps them fast on a phone.
2. In Phase 0, a visitor with JavaScript off cannot recalculate the total for another tier, but sees every tier's price.

## Questions the founder should ask
1. Do we adopt "pages never read the `?` part; one separate renderer handles it" as the site-wide rule?
2. Will spec 010's checkout re-check the date and price on the server before taking money?
3. Is a JavaScript-only tier change acceptable for the demo?
4. If the spike fails, do we accept the depth-3 404 hole (option d) for now?

## What looks right
Both briefs stopped rather than loosen a gate, measured the cause down to the framework's source, and on their own reached the same root.

[pg]: https://nextjs.org/docs/app/api-reference/file-conventions/page
[rw]: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
Also: [notFound docs](https://nextjs.org/docs/app/api-reference/functions/not-found) (Cache Components soft-404), [headers docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers) (`has: query`); all v16.3.8.
