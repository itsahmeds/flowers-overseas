# ADR-0006 — No IP-based redirects; suggestion banner with persisted choice

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/03-i18n-spec.md, plan/07-compliance.md |

## Context
Googlebot crawls predominantly from US IPs, so forced geo-redirects hide every non-default locale. The EU Geo-blocking Regulation 2018/302 prohibits redirecting EU customers by location without explicit consent.

## Options considered
1. **IP redirect to locale** — common, harmful to crawl and unlawful in the EU without consent.
2. **Detect hints (Accept-Language, IP) and show a dismissible suggestion banner; persist explicit choice in a cookie; never act for known bots** — every locale remains a crawlable URL with reciprocal hreflang and x-default.

## Decision
Option 2. Accepted recommended default.

## Consequences and the trade-off accepted
Easier: full crawlability and legal compliance. Harder: some visitors land on a non-native locale for one screen; mitigated by a prominent banner and a header switcher that preserves the current page.
