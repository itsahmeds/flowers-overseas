# ADR-0016 — CSP shape on cached HTML: static per-environment allowlist plus an inline-script hash, nonces reserved for `no-store` routes

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-08 |
| Deciders | Ahmed |
| Supersedes | — (supersedes the "CSP with nonces" sentence of `plan/01-architecture.md` §9 without editing that document) |
| Related | ADR-0007 (Phase 0 indexes only true pages), ADR-0012 (hosting), specs/004-design-system-layout.md §5.2 §13 Q5, specs/001-repo-ci-observability.md §8, plan/01-architecture.md §3 §9, plan/07-compliance.md, docs/architecture.md §4 |

## Context
Spec 001 shipped with no `Content-Security-Policy` header at all and recorded that as a deferred
decision in `docs/architecture.md` §4, to be lifted by "the first design-system PR that adds a
script or a font". Spec 004 is that PR: it adds self-hosted fonts, an inline Consent-Mode bootstrap
and an env-gated GA4 loader, so the header can no longer wait.

`plan/01` §9 says "CSP with nonces", which was written before the rendering strategy was fixed. It
cannot be implemented as written. A nonce must be unique per response, and every indexable page in
this product is SSG or ISR: the HTML is generated once and served from a CDN edge to thousands of
visitors. There are only two ways to put a nonce in such a response — bake it into the cached HTML,
where it is a public constant that any injected script can read out of the document and therefore
protects nothing, or render every indexable page per request, which abandons the cache. The second
option is a direct hit on priority #1 (organic ranking: Core Web Vitals and programmatic scale
across locales) and priority #2 (conversion): the LCP budget of 2.0 s and the ≥0.95 performance
score of AC-24 are built on cached HTML at the edge.

Facts that shape the choice: the app has exactly **one** inline script, the ≤1 KB Consent-Mode
default-denied block, and its content is identical in every response; Next's own inline bootstrap
content varies per build and per route; the only third-party script origins in Phase 0 are
`googletagmanager.com` (when the founder sets `NEXT_PUBLIC_GA4_MEASUREMENT_ID`) and
`https://vercel.live` (injected by the platform into protected previews, absent from production);
and the routes that will carry money and personal data — checkout, account, admin, vendor — are
`no-store` and `noindex` by design, so they are the routes that *can* carry a per-request nonce.

## Options considered
1. **Nonce everywhere, with `'strict-dynamic'`** — the strongest policy available · forces dynamic
   rendering on every indexable page, so the LCP and script budgets of AC-24 fail and the ISR
   strategy of `plan/01` §3 is abandoned · forecloses the whole SEO plan. Rejected on cost, not on
   security merit.
2. **Static per-environment allowlist on cached routes, plus a build-time `'sha256-'` hash for the
   single inline consent block; per-request nonce with `'strict-dynamic'` on `no-store` routes,
   written by the spec that ships the first one; `Report-Only` first, with `/api/csp-report`
   collecting the evidence** — every indexable page stays cached; a real policy ships now; the
   highest-value XSS targets get the strong variant when they arrive · an XSS that can inject
   `<script src>` pointing at an allowlisted origin is not blocked on marketing pages, and in
   practice that means `googletagmanager.com`, which serves arbitrary container code · the split
   has to be maintained: two policies, and a reviewer has to know which routes get which.
   `[agent-inferred]` as spec 004 §5.2's default, weighed by the founder on 2026-09-08.
3. **Fully hash-based policy (no `'self'` for scripts)** — no origin allowlist to abuse · Next's
   inline bootstrap content varies per build and per route, so the hashes must be computed per
   response, which is nonce generation with extra steps and the same cache problem · rejected on
   feasibility.
4. **No CSP until spec 013 (checkout)** — no maintenance now · leaves spec 001's deferred row open
   through the whole demo, ships fonts, an analytics loader and an inline script with no policy at
   all, and gives up the Report-Only evidence period exactly when the page set is small enough for
   the reports to be readable · rejected.

## Decision
Option 2, accepted as the recommended default: **cached routes get a static per-environment
allowlist plus a build-time `'sha256-'` hash for the one inline consent bootstrap; `no-store` routes
get a per-request nonce with `'strict-dynamic'`, written by the spec that ships the first such
route.** The policy is emitted from `next.config.ts`'s `headers()` (`src/lib/csp.ts`), sent as
`Content-Security-Policy-Report-Only` by default, and enforced per environment by setting
`CSP_REPORT_ONLY=false` in that environment's env store once `/api/csp-report` has been quiet. The
enforce flip is therefore a configuration act, not a deploy, and it is deliberately not scheduled
here: Phase 0 collects evidence, and the founder flips production when the reports are empty.

## Consequences and the trade-off accepted
Easier: every indexable page stays SSG/ISR at the edge, so the LCP, CLS and script budgets of AC-24
remain reachable; the policy is a constant that a unit test can assert **as a whole string**, which
is what makes "`vercel.live` is in preview and not in production" a gate rather than a hope; the
inline consent bootstrap is authorised by a hash added in the same PR as the script itself
(TASK-050), so a bootstrap the policy would report can never be mistaken for a clean Report-Only
run; adding an origin is a reviewed diff in one file.

Harder: two policies to keep straight, and the discipline that says which routes get which; the
`'unsafe-inline'` relaxation in `style-src` stays until React stops writing `style` attributes and
Next stops inlining critical CSS, and is documented as a known relaxation rather than quietly
present; `X-Frame-Options: DENY` is sent alongside `frame-ancestors 'none'` because while the CSP is
Report-Only the CSP directive reports and the legacy header is the only clickjacking protection
actually in force.

The trade-off accepted, stated so no reviewer has to infer it: **an allowlist plus one script hash
is weaker than `'strict-dynamic'` with a per-request nonce.** An XSS that can inject a
`<script src>` to an allowlisted origin — in practice `googletagmanager.com`, which hosts arbitrary
container code — is not blocked on a marketing page. What that buys is the entire caching and Core
Web Vitals strategy, which is priority #1 and #2. The mitigation is the split, and it is not a
consolation: the three highest-value XSS targets in this product are the checkout and the two
authenticated surfaces, and those are exactly the routes that are `no-store` and can carry a nonce.

Downstream: `plan/01` §9's "CSP with nonces" sentence is superseded by this record and left
unedited; `docs/architecture.md` §4 loses its CSP row and points here; spec 001's second deferred
row (`vercel.live`, `/review 8`) is settled — the origin is in the preview policy's `script-src`,
`connect-src` and `frame-src` and absent from production, which is what lets
`tests/e2e/shell.spec.ts` drop its non-local allowance at the enforce flip; TASK-050 adds the
consent bootstrap's hash and, when GA4 is configured, the `googletagmanager.com` origin; spec 006
adds the R2 image host to `img-src`; spec 013 adds Stripe's 3DS origins to `frame-src`, revisits
`payment=()` in `Permissions-Policy`, and writes the nonce variant for the checkout routes.
`docs/compliance/ropa.md` is unaffected: `/api/csp-report` logs a directive name and a blocked
origin and reads no request header, so it processes no personal data.

## Rules
- Accepted ADRs are never edited. The only legal touch is flipping Status to `superseded-by`.
- `deferred` requires: guardrails while deferred, revisit trigger, cost of deferral.
- `not-applicable` requires a reason.
