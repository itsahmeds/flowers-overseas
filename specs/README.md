# specs/
One spec per feature, numbered `NNN-<slug>.md`, created by `/spec`. Template: `_template.md`. A spec must be `approved` before `/plan-tasks` will break it into tasks. Numbers are reserved by the roadmap (`plan/09-roadmap.md`): 001–012 Phase 0, 013–025 Phase 1, 026–031 Phase 2, 032–039 Phase 3.

A letter suffix splits one reserved number when a spec's deferred half becomes its own spec:

| Spec | Split from | Phase | What |
|---|---|---|---|
| `012b-cms.md` | `012-admin-v0.md` §15 | 1 | Catalogue CMS: the database as master copy, publishing, review for catalogue text and photos, florist bouquets, prices, photos, country go-live (slice A); review everywhere (slice B) |

Outside the roadmap's reserved ranges: 040 hosting (Railway and Cloudflare), 041 trust, help and legal pages, 042 premium interactions (draft, PR 284), 043 site clarity (draft): the header follows the destination in the URL, one state line per page, chips grouped by kind, photographed products first, no internal words on public pages; 044 blog: posts written, approved and published from admin on spec 012b's machinery; 050 referrals: a fixed amount off a friend's first order above a minimum, and the same amount as store credit for the referrer once the friend's order is delivered, off until the founder switches it on.
