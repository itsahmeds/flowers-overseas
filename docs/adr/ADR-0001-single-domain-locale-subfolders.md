# ADR-0001 — One .com domain with locale subfolders

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/02-seo-spec.md, plan/03-i18n-spec.md |

## Context
European incumbents (Interflora, Euroflorist) run ccTLDs per country. We launch with a handful of countries and must scale to 40+ European and 100+ global destinations on a founder's budget with no existing authority.

## Options considered
1. **ccTLDs per country** — strongest local signal; authority split across N domains, N registrations, N Search Console properties, N link-building efforts; every new country starts at zero.
2. **Subdomains per locale** — technically separate hosts, treated close to separate sites by Google; no authority consolidation benefit over ccTLDs, worse than subfolders.
3. **Subfolders per locale on one .com** (`/de/`, `/pl/`) — all links consolidate to one domain; hreflang + localised content supply the local signal; one deploy, one sitemap index, one Search Console property with per-locale filtering. `[agent-inferred]` geo-targeting per subfolder is no longer settable in Search Console, so hreflang and content carry the signal.

## Decision
Option 3: one `flowersoverseas.com` domain with locale subfolders. Accepted recommended default.

## Consequences and the trade-off accepted
Easier: authority compounds across every locale; new country = new folder and data, not new domain. Harder: we forgo the marginal local-trust signal of a national TLD and depend on flawless hreflang; a single-domain penalty would hit all markets at once, so programmatic-page quality gates are non-negotiable.
