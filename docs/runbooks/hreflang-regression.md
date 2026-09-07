# Runbook — hreflang / indexability regression

| Field | Value |
|---|---|
| Severity | P2 |
| Detect | seo-auditor FAIL on checks 2/3/7/8; Search Console coverage drop >10%; hreflang errors in GSC |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Locale pages dropping from index; wrong-language pages ranking; sitemaps listing noindex URLs.

## Immediate actions (first 15 minutes)
1. Run `/seo-audit production`. 2. Diff `modules/seo` and `config/locales.ts` in the last deploys. 3. If a deploy caused it, roll back.

## Diagnosis
Missing alternate for a locale; translation status flipped to machine; country status changed unintentionally; cache serving stale head tags.

## Fix / recovery
Fix data or code via a task; `invalidate` affected tags; regenerate sitemaps; request re-indexing of a sample in GSC.

## Communication
None external. Note in decisions log if a rule changed.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
