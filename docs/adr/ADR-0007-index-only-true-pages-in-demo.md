# ADR-0007 — Phase 0 indexes only true pages; shop pages noindex until country is live

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/02-seo-spec.md, plan/10-seed-data-and-taxonomy.md |

## Context
We have no vendors at launch. The site runs on seed data and doubles as the florist pitch. Google must never index a fake shop.

## Options considered
1. **Index the full site with honest availability states** — faster indexing of money pages; but products that cannot be bought in a country that is not live are misleading and risk quality actions.
2. **Production indexes only true pages (corridor guides, occasion content, blog, /for-florists/, legal); product/category pages render with noindex until their country flips to live; checkout behind a demo guard; a password-protected preview deployment for pitches.**

## Decision
Option 2.

## Consequences and the trade-off accepted
Easier: zero manual-action risk, and informational pages start earning authority immediately. Harder: money pages start indexing only when a country goes live; mitigated by strong internal links from already-indexed guides so discovery is fast at flip time.
