# 13 — Open Questions

Everything that still needs a founder decision, a professional's answer, or a fact check, with the document it blocks and a due date tied to the roadmap. Decided items move to an ADR and are struck from here. The orchestrator mirrors blocking items into `TASKS.md` "Open decisions".

Legend: 🧑 founder · 🧾 accountant · ⚖️ lawyer · 🔍 verify at decision time (pricing/policy facts that drift)

---

## A. Blocking Phase 0 (due by 21 Sep 2026)

| # | Question | Blocks | Owner | Recommendation / default if unanswered |
|---|---|---|---|---|
| A1 | Confirm the four launch URL prefixes `en`, `en-gb`, `de`, `pl` (02 §3). Any objection to `en-gb` as a separate locale? | spec 003, 007 | 🧑 | Default: yes, four prefixes |
| A2 | Homepage country pick lands on the corridor page (default) vs the country shop root (04 §4) | spec 004/007 | 🧑 | Default: corridor; A/B test #1 |
| A3 | Approve taxonomy and the 84-product seed list shape (10 §1–§2); veto any product names | spec 005/006 | 🧑 | Default: as written |
| A4 | Seed price bands and payout shares (10 §2.3) as starting values | spec 005 | 🧑 | Default: as written; validate with first PL florists |
| A5 | Polish UI register: formal (Państwo) vs informal (Ty) for buyer-facing copy | translations for `pl` | 🧑 + native reviewer | Default: informal in UI, formal in legal |
| A6 | Name of the guarantee ("Freshness guarantee 7 days"? "Fair swap promise"?) and its exact terms (refund %, redelivery) | spec 004, 07 §2 | 🧑 | Default: 7-day freshness, redeliver-or-refund |
| A7 | Which six demo destinations besides PL get written guides at Phase 0 (02 §5.3 proposes DE, FR, ES, IT, RO, NL) | spec 007 content | 🧑 | Default: as proposed |
| A8 | Authorise Ahrefs (and optionally Firecrawl) connectors so 02/03 demand orderings can be re-run on real volumes | 02 §13, 03 §3 | 🧑 | Without it, orderings stay estimate-grade (flagged) |
| A9 | Brand assets: logo, palette, type; is there anything existing, or does spec 004 create a minimal system? | spec 004 | 🧑 | Default: spec 004 creates a minimal token system |
| A10 | GitHub repo name/visibility and whether Ahmed's work GitHub account (`itsahmeds`) or a separate one owns it | week-1 tasks | 🧑 | Default: private repo under personal account |

## B. Blocking Phase 1 (due by 15 Nov 2026)

| # | Question | Blocks | Owner | Recommendation / default |
|---|---|---|---|---|
| B1 | Principal vs agent supply model (06 §4) and the nine VAT questions; PL VAT registration decision | 013, 015, 018 invoices; go-live | 🧾 | Design intent: principal (Model A) |
| B2 | Pakistan management-and-control / permanent establishment position for the OÜ | entity | 🧾 (PK + EE) | Obtain written opinions before first sale |
| B3 | Partner agreement (EN + PL) with Art. 28 processor clauses, SLA, photo, substitution, payout terms | florist onboarding | ⚖️ | Draft from 06 §5 and 07 §1.3 for review |
| B4 | T&C (EU + UK), privacy, cookie, review policy, accessibility statement review; governing-law clauses | go-live | ⚖️ | Drafts written in Phase 0 |
| B5 | UK GDPR Art. 27 representative: appoint which provider | UK sales | ⚖️ + 🧑 | Appoint before first UK order |
| B6 | Withdrawal position for non-perishable add-ons sold with flowers; DE model withdrawal instructions | 07 §2.1 | ⚖️ | Disclose separately; treat gift as one contract pending advice |
| B7 | Settlement currency (EUR only vs per-currency balances) and FX buffer size (2.5% proposed) | 013 | 🧾 + 🧑 | EUR settlement, 2.5% buffer |
| B8 | Manual review threshold (€300 proposed) and Radar rule set sign-off | 021 | 🧑 | As proposed |
| B9 | Stripe and Mollie application outcomes; any reserve imposed → cash float size (€3–5k proposed) | go-live | 💳 outcome + 🧑 | Apply to both in week 1 |
| B10 | WhatsApp: company number and device for the Business app; when to start Meta Business Verification | 017 | 🧑 | Start verification as soon as the OÜ exists |
| B11 | Trustpilot: free plan sufficiency for invitations in Phase 1 | 022 | 🧑 🔍 | Free until Phase 3 |
| B12 | Native reviewers for `pl` and `de`: source (freelance marketplace vs known contacts) and budget approval (~€100–250/mo) | translation gate | 🧑 | Freelance, hourly |
| B13 | Seed → live validation: do the first three florists accept the seed payout levels? | pricing | 🧑 | Adjust `partner_catalog_mapping` per partner |
| B14 | First-order plan: who is the first real buyer and recipient (founder-sourced) and on what date | Phase 1 exit | 🧑 | Book by 1 Dec |
| B15 | Occasion rules: `plan/03` §9's six rule types cannot express Romanian Orthodox Easter (offset from Gregorian Easter varies by year) or Polish name days (per name, no single date). Add a seventh rule type (Orthodox Easter offset) as a spec 009 amendment; name day stays a category, not a dated occasion. Until then `seed/data/occasion-country.json` carries them as `rule_type: "none"`, `observed: true` (TASK-072, 2026-09-09) | spec 009 `occasionDate(rule, year)`; RO occasion pages | 🧑 orchestrator → `/spec 009` | Seventh rule type in spec 009; no change to committed seed rows |
| B16 | FX staleness window: rates are dated by `as_of` day (00:00 UTC) with `MAX_FX_AGE_HOURS = 48`, so Friday's ECB rate is stale from Sunday 00:00 UTC and `fx.refresh` (06:00 CET) runs before the ~16:00 CET publication — non-native display currencies stop converting ~54 h a week and GB/DE buyers see PLN prices every Monday. Raise to ~96 h or date rates from the publication instant? Meanwhile TASK-067's projection fails closed to the destination currency as specified (raised by `/review 51`, 2026-09-11) | spec 005 §14 amendment; TASK-071 `fx.refresh` | 🧑 Ahmed → spec 005 §14 | Fail closed as written (safe direction); revisit before the first non-PLN display currency flag flips |

## C. Phase 2–3 (due by 31 Jan 2027)

| # | Question | Blocks | Owner | Recommendation / default |
|---|---|---|---|---|
| C1 | CRM: Brevo (recommended) vs HubSpot Starter for B2C automation (11 §4) | 032 | 🧑 | Brevo |
| C2 | Florist payouts: Wise batches vs Stripe Connect Express onboarding (06 §3) | 030 | 🧑 🧾 | Wise first |
| C3 | Public florist profiles: opt-in model and what is shown | 027, page #27 | 🧑 ⚖️ | Opt-in, first name + city + photos |
| C4 | Recipient QR card: printed by florist from PDF vs pre-printed sleeves shipped to partners | 029 | 🧑 | PDF first |
| C5 | Recipient-loop consent wording and whether "send flowers back" may prefill the sender's city | 029, 07 §1.3 | ⚖️ | City only, never address |
| C6 | Trusted Shops for DE alongside Trustpilot | Phase 4 DE | 🧑 | Decide when DE goes live |

## D. Facts to re-verify at decision time 🔍

| # | Item | Where used | Why it drifts |
|---|---|---|---|
| D1 | Vercel Pro inclusions and image-optimisation metering; Supabase Pro limits and PITR price; Railway per-GB pricing; Cloudflare purge-by-tag plan gating | 08 | Pricing pages change quarterly |
| D2 | Stripe/Mollie fee schedules and local-method coverage per market (Klarna, BLIK, Bizum, Vipps, MobilePay, Swish, Twint) | 04 §10, 06 §2 | Method availability changes |
| D3 | Estonian e-Residency processing time and fees; OÜ state fee; corporate tax on distributions | 06 §1, 09 week 1 | Legislation |
| D4 | Google FAQ rich-result eligibility; Search Console features; Consent Mode v2 requirements | 02 §9, 04 §11 | Google policy |
| D5 | EAA micro-enterprise exemption thresholds in EE and target markets | 07 §8 | National transpositions |
| D6 | Occasion dates 2027 (Mothering Sunday 14 Mar, DE Muttertag 9 May, PL Dzień Matki 26 May, NO Morsdag 14 Feb, SE 30 May) | 03 §9 fixtures | Verify against official calendars in fixtures |
| D6 note (2026-09-16) | Verified in TASK-089: Mothering Sunday 2027 = **7 March** (not 14 Mar) and 2030 = **31 March**; Easter − 21 rule; other D6 dates confirmed. | — | — | — | — | recorded |
| D7 | FR Fête des Mères is the last Sunday of May **unless that is Pentecost, then the first Sunday of June**; plan/03 §9's `last_weekday` rule cannot express the exception. Correct 2026–2033; wrong in 2034, 2039, 2042, 2045, 2050, 2053. Add an eighth rule type (or a per-year override table) alongside B15's seventh in spec 009. | spec 009 occasions amendment | orchestrator | before FR goes live | `last_weekday` stays; override table when FR is live | open (2026-09-16, `/review 64`) |
| D7 | Diaspora population estimates used for locale ordering | 03 §3 | Replace with Ahrefs volumes when A8 is done |

## E. Assumptions carried from the planning session (confirm or correct)

| # | Assumption |
|---|---|
| E1 | `flowersoverseas.com` is owned and DNS can move to Cloudflare |
| E2 | No EEA-resident co-founder/director exists or is planned |
| E3 | Founder capacity ~15–20 focused hours/week plus agents |
| E4 | No paid acquisition at launch; community-led Phase 1 |
| E5 | Reviews on Trustpilot; analytics GA4 + GSC |
| E6 | Budget ceiling ~$20–40/month pre-revenue, accepting ~$45 from Phase 1 (08 §4) |

## F. Deliberately deferred (with revisit trigger)

| Item | Trigger to revisit |
|---|---|
| Swiss locales (`de-ch`, `fr-ch`) | ≥2% of sessions from CH or a CH florist signed |
| Ukrainian locale | destinations in UA open, or `uk` Accept-Language share >3% |
| Address autocomplete | checkout abandonment at Step 1 >35% |
| Hampers, gift cards, subscriptions | Phase 4 backlog; partner capability |
| Stripe Connect | Wise batch effort >2 h/week |
| Redis/BullMQ | >50k jobs/day or Railway workers adopted |
| Supabase PITR add-on | revenue >€3k/month |

**Recommendation:** answer section A this week (most have safe defaults), book the accountant and lawyer for section B now, and let `/status` carry the rest.
**Rationale:** nothing in section A changes architecture; everything in section B gates the first lawful sale.

## C. Strategy questions raised after planning (2026-09-14)

| # | Question | Blocks | Owner | Due | Default if unanswered | Status |
|---|---|---|---|---|---|---|
| C1 | Do priorities 1 and 2 in `CLAUDE.md` swap — trust and conversion (real reviews, delivery photo, phone/WhatsApp line, guarantee) before organic ranking — given the internetflorist.biz evidence that repeat customers, affiliates and phones, not search, carry the incumbent's ~70 orders/day? | plan/02 emphasis, spec 007–009 scope, Phase 1 ordering (013 payments vs 022 reviews/Trustpilot) | Ahmed | 2026-09-21 | Priorities unchanged; specs 007–009 built as planned | resolved 2026-09-15 (default accepted) |
| C2 | Narrow Phase 0/1 to one or two corridors owned end-to-end (vetted florists, photo, guarantee) instead of seven guide countries? | spec 007 content scope (A7), florist outreach | Ahmed | 2026-09-21 | Seven guides as planned; PL only live | resolved 2026-09-15 (default accepted) |
| C3 | Add a Pakistan-inbound diaspora corridor (UK/US/UAE → PK) to the roadmap, given founder location and vendor access? | plan/09 Phase 4 destinations, entity/VAT questions | Ahmed | 2026-09-21 | Not in scope before Phase 1 exit | resolved 2026-09-15 (default accepted) |
