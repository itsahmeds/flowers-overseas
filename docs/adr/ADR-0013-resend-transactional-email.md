# ADR-0013 — Transactional email via Resend (EU region); marketing automation lives in the CRM

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/11-platform-roadmap.md §5, ADR-0010 |

## Context
Fifteen transactional messages across four locales at launch, templates required to be localisable code, EU data residency preferred, near-zero cost pre-revenue. Marketing automation arrives in Phase 3.

## Options considered
1. **Resend** — React Email templates as code, EU region, webhooks, free 3k/month; broadcasts only for marketing.
2. **Postmark** — best transactional deliverability; US-only data; no templates-as-code advantage.
3. **Loops** — marketing-first with its own editor; poor fit for typed templates.
4. **Brevo transactional** — cheap and EU; template editor rather than code; would couple transactional email to the CRM choice.

## Decision
Option 1 for transactional email. Marketing automation is the CRM's job (Brevo recommended in plan/11 §4; adapter-based so HubSpot Starter is a valid alternative). Accepted recommended default.

## Consequences and the trade-off accepted
Easier: typed, localised templates with visual snapshots per locale; EU residency; free at launch. Harder: two messaging systems (transactional vs marketing) with a written boundary; Resend's deliverability reputation is younger than Postmark's, mitigated by domain authentication and a dedicated IP if volume warrants.
