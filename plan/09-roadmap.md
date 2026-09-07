# 09 — Roadmap

Phased build order with acceptance criteria, dated against the peaks that matter (Valentine's 14 Feb 2027, Women's Day 8 Mar 2027, Mothering Sunday 14 Mar 2027, DE Muttertag 9 May 2027, PL Dzień Matki 26 May 2027). Every phase adds without touching the core; the places where that rule is at risk are called out. Dates: demo **mid-Oct 2026 (committed)**; first real paid order **Dec 2026 (stretch), mid-Jan 2027 (committed)**. Related: `00` §4, ADR-0002/0003/0004, `12` for how work flows.

Planning assumption: ~15–20 focused founder hours per week plus Claude Code agents; one task = one PR; nothing starts without a spec (`12`).

---

## 0. Week 1 (8–14 Sep 2026): non-code critical path

These gate the MVP more than any code does.

| Task | Owner | Done when |
|---|---|---|
| Apply for Estonian e-Residency; choose service provider (address + contact person) | founder | application submitted; provider engaged |
| Engage EE accountant (e-commerce/OSS); send the nine VAT questions (06 §4) | founder | first call booked |
| Pakistan tax adviser: management-and-control question | founder | written opinion requested |
| Draft business description for processors (relay, seller of record, refund policy) | founder + spec-writer | doc in `docs/compliance/processor-description.md` |
| Register `flowersoverseas.com` DNS on Cloudflare; Google Workspace mailbox; Search Console domain property; GA4 property (EU-only data settings) | founder | done |
| Trustpilot business profile claimed (free) | founder | done |
| Create GitHub repo (private), Vercel project, Supabase staging project (EU) | founder | `/status` shows all three |
| Shortlist 15 Warsaw florists + 5 in Kraków/Wrocław/Gdańsk/Poznań from Maps/Instagram | founder | sheet with contact + rating |

## Phase 0 — Demo (15 Sep → 16 Oct 2026)

**Goal:** a complete-looking, honest site on seed data in `en`, `en-gb`, `de`, `pl`; a `/for-florists` pitch; a mock order that lands in a vendor inbox; production indexes only true pages. Used to sign the first three Polish florists.

| Week | Build (specs → tasks) | Non-code |
|---|---|---|
| 15–21 Sep | `001` repo + dev OS bootstrap (CLAUDE.md, agents, CI skeleton, lint/type gates) · `002` schema v1 (all entities in 01 §4, migrations, RLS, seed scripts) · `003` i18n foundation (next-intl, locale config, formatters, pseudo-locale, lint bans) | Send florist outreach messages (PL) |
| 22–28 Sep | `004` design system + layout (tokens, logical CSS, header/footer, trust strip, consent banner, banner) · `005` catalogue + pricing module (products, tiers, add-ons, country_price, FX) · `006` seed catalogue import + imagery pipeline (10) | Approve taxonomy + product names (10); generate imagery |
| 29 Sep–5 Oct | `007` corridor pages (country; guide state; FAQ; schema; sitemaps; hreflang) · `008` country shop, category, occasion pages (ISR, noindex for demo) · `009` PDP with date picker, cutoff/holiday logic, all-in price | Write PL corridor guide (native reviewer), DE/FR/ES/IT/RO/NL guides (en first) |
| 6–12 Oct | `010` checkout UI with demo guard (no charge; Stripe test mode behind flag) · `011` for-florists landing + application form + walkthrough + mock vendor inbox (`/demo/vendor-inbox`) · `012` admin v0 (partners, catalogue, countries, flags, translations queue) | Legal drafts (terms/privacy/cookies/reviews) to lawyer |
| 13–16 Oct | Hardening: Lighthouse budgets, seo-auditor run, accessibility pass, staging password protection, demo script | Florist demo calls booked |

**Acceptance criteria (all must hold):**
1. Production indexes only: home, all-destinations, PL corridor (guide state until live), 6 guide corridors, occasion hubs, category hubs, how-it-works, for-florists set, about/contact/help, blog (≥6 reviewed posts across en/pl), legal. Everything else `noindex` and absent from sitemaps; verified by `seo-auditor`.
2. Lighthouse mobile ≥95 on home, PL corridor, a PDP and a category page in all four locales; LCP <2.0 s from a Frankfurt/London synthetic run.
3. hreflang reciprocity 100% on a 200-URL sample; sitemap index valid; schema validates on PDP/corridor/occasion/blog.
4. The mock order: pick Poland → PDP → date → checkout → "place order" (no charge) → order appears in `/demo/vendor-inbox` and admin queue within 5 s; magic-link accept/decline/photo-upload works.
5. `/for-florists` in en, pl, de with the application form writing to `partner_application`.
6. Zero reviews/testimonials displayed; zero demo partner shown on any indexable page.
7. Consent banner functional, Consent Mode v2 default-denied, GA4 receives cookieless pings.
8. Dev OS: every PR in this phase has a spec and a task ID; `TASKS.md` current; ADRs for any new decision.
9. **Exit:** ≥3 Warsaw florists verbally committed after seeing the demo.

Core-touching risk: none by design; this phase *is* the core.

## Phase 1 — MVP (19 Oct → 18 Dec 2026 stretch; → 15 Jan 2027 committed)

**Goal:** UK→PL live in `en-gb` and `pl`; real Stripe payments (Mollie live as fallback); orders routed by email + WhatsApp with magic links; one real paid order delivered with photo; SEO foundations indexing.

| Window | Build | Non-code |
|---|---|---|
| 19 Oct–8 Nov | `013` payments module (PaymentProvider, Stripe adapter: intents, manual capture, 3DS, Radar rules, webhooks inbox) · `014` Mollie adapter · `015` order state machine + events + outbox (11 §2) · `016` routing job, assignment SLA, timeouts, no-partner path | OÜ registered (target 1 Nov); Wise/Revolut opened; Stripe + Mollie applications submitted with live docs |
| 9–29 Nov | `017` notifications (Resend transactional set 11 §5, React Email localised; WhatsApp Business app procedure; vendor magic-link flows) · `018` tracking page + confirmation + invoice PDF · `019` customer account minimal (magic link, orders, privacy requests) · `020` refunds/partial refunds + admin order queue | Partner agreements signed (3–5 PL florists); test bouquets; accountant answers → `supply_model` set; PL VAT registration filed if Model A |
| 30 Nov–18 Dec | `021` fraud pre-checks + review queue · `022` first-party reviews + Trustpilot invitation flow · `023` GA4 event plan + server-side purchase · `024` peak-day capacity caps + surcharge dates · `025` runbooks top 10 + alerts | Stripe live approval; UK GDPR rep appointed; legal docs final; 5 user tests with Polish diaspora buyers |
| **Stretch launch 18 Dec** | Flip PL `demo → live`; first paid order (founder-sourced buyer) | |
| 19 Dec–15 Jan | Buffer: fixes from real orders; Christmas blackout handling; committed launch if December slipped | Community launch: Polish diaspora groups UK, referral offer |

**Acceptance criteria:**
1. One real paid order (real buyer, real card, 3DS) routed automatically, accepted by a florist via magic link, delivered, photo uploaded, buyer notified, payout line created. Zero manual DB edits in the flow.
2. Playwright e2e green for checkout in `en-gb` (card + Apple Pay simulated) and `pl` (card + BLIK test) against staging on every PR.
3. Contract tests for Stripe and Mollie webhooks (signature, idempotency, out-of-order events) and Resend webhooks.
4. Accountant sign-off recorded (`docs/compliance/vat-signoff.md`); terms/privacy versions live; UK Art. 27 rep appointed; Impressum live.
5. Chargebacks 0; Radar rules active; manual-review queue exercised with a synthetic >€300 order.
6. PL corridor, PL categories, PL occasions (Dzień Kobiet, Walentynki, Dzień Matki…) and PL products indexable and in sitemaps within 24 h of the flip; GSC shows them discovered within 7 days.
7. Alerts fire on: webhook failure, SLA cascade exhaustion, `paid` without `routed` >5 min (tested by fault injection).
8. Lighthouse budgets still met with payments and consent scripts present.
9. **Exit:** 10 paid orders delivered with ≥4.5 average buyer rating, or 31 Jan 2027, whichever first.

Core-touching risks: (a) capture-on-acceptance requires the state machine and payments to be designed together: they are one spec pair (`013`+`015`) reviewed jointly; (b) `supply_model` outcome may change invoice templates: templates are data-driven from day one.

## Phase 2 — Vendor portal (Feb → Mar 2027, around the peaks)

**Goal:** replace email/WhatsApp-only handling with a portal for signed florists; survive Valentine's and Women's Day.

| Item | Build |
|---|---|
| `026` vendor auth + org scoping (partner_member roles, RLS) |
| `027` portal: inbox, accept/decline with reasons, order detail (print card PDF with QR), capacity & blackout calendar, substitution notes, delivery photo upload, payout history and statements, ratings view, staff invites |
| `028` WhatsApp Business Platform (Cloud API) templated notifications pointing to the portal; email remains |
| `029` recipient loop: printed card with QR, `/r/{code}` landing, thank-you flow, rating |
| `030` Wise payout API batch; self-billing statements |
| `031` peak-day tooling: city capacity dashboard, real-time date greying, manual re-route board |
| Freeze: no new features 10–15 Feb and 6–9 Mar; on-call runbook active |

**Acceptance criteria:** 100% of orders for 30 consecutive days handled in-portal (accept → photo) without founder intervention; Valentine's and Women's Day delivered with ≥95% on-date delivery and zero capacity-caused charges; payouts batched via API with statements; recipient loop yields ≥1 order.

Core-touching risk: portal must consume `order_events` and call `orderService.transition`, never write status directly; reviewer enforces.

## Phase 3 — CRM + automation (Apr → Jun 2027)

**Goal:** adopt a CRM, sync customers/orders/events, run occasion-calendar campaigns per country, abandoned checkout and win-back.

| Item | Build |
|---|---|
| `032` CRM sync layer (11 §4): outbox consumer → HubSpot (default) or Attio; contact/company/deal mapping; consent fields |
| `033` marketing consent management + preference centre |
| `034` abandoned checkout (server-side drafts → email after 2 h, consented buyers only) |
| `035` occasion reminders per destination calendar (11 months after an order; upcoming country occasions) |
| `036` win-back and post-delivery cross-sell |
| `037` recipient-to-sender nudge (consent-based) |
| `038` vendor performance digests |
| `039` reporting layer: GA4 + first-party funnel tables → Looker Studio/PowerBI connector; accounting export |

**Acceptance criteria:** first repeat purchase attributable to a campaign; CRM contains 100% of consented customers with order history; unsubscribes honoured within 24 h; DE Muttertag (9 May) and PL Dzień Matki (26 May) campaigns run from the calendar data with zero hard-coded dates.

Core-touching risk: none if the sync is outbox-driven; risk if a CRM demands synchronous writes from checkout: forbidden.

## Phase 4 — Scale (H2 2027)

**Goal:** more corridors, more locales, more payment methods, ops tooling; the architecture proves it adds without refactor.

| Stream | Order |
|---|---|
| Destinations | DE (second live country; recruits from Phase 0 pitch) → RO → IE → ES → NL → IT → FR → Nordics; each needs 3+ partners, guide, occasion rows, VAT registration decision 🧾 |
| Locales | ro → fr → tr → es → nl → it → sv (03 §3); each gated by native review and Search Console demand |
| Payment methods | iDEAL, Bancontact, Bizum, Vipps, MobilePay, Swish, Twint via Stripe/Mollie flags per buyer country |
| SEO | city corridors where coverage exists; curated colour/flower categories; image sitemaps; Trusted Shops for DE; hreflang audit at every locale add |
| Ops | admin analytics, partner scorecards, automated re-routing rules, fraud tuning, address autocomplete, WhatsApp API for buyers |
| Platform | Stripe Connect for florist payouts if Wise batches become a burden; job layer to Railway workers if cron limits hit (ADR-0012 fallback path) |

**Acceptance criteria:** 5 live destination countries and 6 locales with Lighthouse ≥95 mobile maintained; corridor pages ≥40% of organic sessions; each new country added as data + content only (no template change), verified by the reviewer on the country's launch PR.

## Where "add without touching the core" is at risk (summary)

| Risk | Phase | Guard |
|---|---|---|
| Payments and state machine designed apart | 1 | joint spec review |
| Portal writing order status directly | 2 | `orderService.transition` only; reviewer + lint rule |
| CRM needing synchronous writes | 3 | outbox only |
| A new country requiring template edits (address, invoice, occasion) | 4 | data-driven configs from Phase 0; launch PR must be data + content only |
| Locale needing physical CSS or string edits | 4 | lint bans from Phase 0 |
| Product URL duplication across many live countries | 4 | GSC monitoring; prune PDP indexing if >10% consolidation |

## Acquisition note (so nobody waits on Google)

Phase 1 buyers come from Polish community groups in the UK (Facebook groups, WhatsApp, Polish shops and parishes), a referral code on every confirmation, and the florists' own customers seeing "delivered via Flowers Overseas" on the card. SEO compounds behind this; the first corridor pages are expected to rank for long-tail diaspora queries within 3–6 months of going live and for head terms in 9–18 months.

**Recommendation:** approve the phase boundaries and acceptance criteria; the orchestrator derives `TASKS.md` from the spec numbers above via `/plan-tasks` once each spec is written.
**Rationale:** dates are anchored to real peaks and to the entity/processor critical path, and each phase has a testable exit rather than a feature list.
