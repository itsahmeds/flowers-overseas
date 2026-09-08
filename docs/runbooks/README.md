# Runbooks

Operational procedures for the top incidents and the setup steps that are done rarely and must not
be improvised. Each runbook is tested at the Phase 1 gate (`plan/09`) and after any change to its
area. `tests/unit/docs.test.ts` fails if a runbook exists but is not listed here.

| Runbook | For |
|---|---|
| [local-setup](local-setup.md) | Clean clone to a running app in under 15 minutes; verifying the task guard; common failures |
| [vercel-setup](vercel-setup.md) | Linking the Vercel project, region `fra1`, Deployment Protection, env vars |
| [branch-protection](branch-protection.md) | Required checks, merge method and review policy on `main`, and the verifier |
| [payment-webhook-down](payment-webhook-down.md) | Stripe/Mollie webhooks failing or delayed |
| [florist-declines-peak](florist-declines-peak.md) | A partner declines during a peak day |
| [hreflang-regression](hreflang-regression.md) | Hreflang or canonical regression found in Search Console or the auditor |
| [sitemap-or-robots-broken](sitemap-or-robots-broken.md) | Sitemap or `robots.txt` serving the wrong thing |
| [sla-breach-vendor](sla-breach-vendor.md) | Delivery SLA breached by a fulfilment partner |
| [peak-day](peak-day.md) | Peak-day readiness and on-the-day procedure |
| [rollback](rollback.md) | Reverting a deploy, a migration or a task |
| [host-failover](host-failover.md) | Moving off Vercel to the Railway + Cloudflare fallback (ADR-0012) |
| [data-breach](data-breach.md) | Personal-data breach: containment, assessment, 72-hour notification |
| [dsar](dsar.md) | Data-subject access, deletion or portability request |
