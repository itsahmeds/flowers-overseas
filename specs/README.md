# specs/
One spec per feature, numbered `NNN-<slug>.md`, created by `/spec`. Template: `_template.md`. A spec must be `approved` before `/plan-tasks` will break it into tasks. Numbers are reserved by the roadmap (`plan/09-roadmap.md`): 001–012 Phase 0, 013–025 Phase 1, 026–031 Phase 2, 032–039 Phase 3.

A letter suffix splits one reserved number when a spec's deferred half becomes its own spec:

| Spec | Split from | Phase | What |
|---|---|---|---|
| `012b-cms.md` | `012-admin-v0.md` §15 | 1 | Catalogue CMS: the database as master copy, publishing, review for catalogue text and photos, florist bouquets, prices, photos, country go-live (slice A); review everywhere (slice B) |
| `030b-admin-finance-crm.md` | `030` (beside 030a, whose payout ledger it reads) | 1 | Admin-only finance and florist CRM: florist prices with margin, sales, owed and paid, costs and margin per order and in total from Stripe balance transactions, portfolio overview by date range with CSV, notes, contact log and follow-ups |

Outside the roadmap's reserved ranges: 040 hosting (Railway and Cloudflare), 041 trust, help and legal pages, 042 premium interactions (draft, PR 284), 043 site clarity (draft): the header follows the destination in the URL, one state line per page, chips grouped by kind, photographed products first, no internal words on public pages; 044 blog: posts written, approved and published from admin on spec 012b's machinery.
