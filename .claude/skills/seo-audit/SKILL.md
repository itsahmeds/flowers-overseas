---
name: seo-audit
description: Run the seo-auditor against a URL set or page type on preview/staging/production — hreflang reciprocity, sitemap health, canonicals, noindex rules, schema, thin-content risk, Core Web Vitals, internal-link flow. Produces a dated report in docs/audits/. Required before every launch.
argument-hint: "<url-set | page-type | env> e.g. 'production corridors' or 'https://preview…/en-gb/send-flowers-to/poland'"
disable-model-invocation: true
---

# /seo-audit <url-set|page-type>

**When:** before `/launch`, weekly on production, after any change to routing/SEO/i18n modules.
**Inputs:** environment or URL list; optional page-type filter.
**Agent:** `seo-auditor` (read-only).
**Outputs:** `docs/audits/YYYY-MM-DD-<env>.md` with `VERDICT`, per-check tables, diff vs previous audit, top-5 actions; verdict + top 5 printed.

## Steps
1. Resolve base URL and sample set (from sitemaps if env given).
2. Launch `seo-auditor` with a filled-in `.claude/templates/work-order.md` (SEO auditor role), naming the checkout to write the report into. Commit the report afterwards.
3. Relay verdict and top 5. If FAIL on index-state, hreflang, translation gating or rendering checks, note that `/launch` is blocked and suggest `/spec` or a fix task.
