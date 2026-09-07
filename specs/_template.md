# SPEC-NNN — <feature title>

| Field | Value |
|---|---|
| Status | draft · approved · implemented · superseded |
| Phase | 0 / 1 / 2 / 3 / 4 |
| Plan refs | plan/NN-… §x |
| ADRs | ADR-NNNN |
| Author / date | spec-writer via /spec · YYYY-MM-DD |
| Approved by / date | Ahmed · YYYY-MM-DD |

## 1. Problem
What is broken or missing, for whom, and why now. One or two paragraphs. Link the plan section that motivates it.

## 2. Scope
Bullet list of what this spec delivers. Each bullet is testable.

## 3. Non-goals
What this explicitly does not do (and where it will be done instead).

## 4. User stories
- As a <buyer/recipient/florist/admin/Googlebot>, I … so that …

## 5. Design
### 5.1 Data model changes (tables, columns, migrations + rollback)
### 5.2 API / server actions / jobs / events (zod schemas named)
### 5.3 UI (pages, components, states: loading / empty / error / demo / disabled)
### 5.4 Rendering & caching (SSG/ISR/SSR, tags invalidated, per plan/01 §3)

## 6. SEO considerations (mandatory)
Indexability · canonical · hreflang set · URL pattern & localised slugs · schema types · sitemap membership · internal links in/out · thin-content risk and mitigation · CWV budget impact.

## 7. i18n considerations (mandatory)
New message keys (namespaces) · locale formatting · RTL impact · address/phone formats · translation review plan and `noindex` gating.

## 8. Compliance considerations (mandatory)
Data flows added (→ RoPA update) · lawful basis · consent gating · price display · consumer information · accessibility · logs/PII.

## 9. Acceptance criteria
Numbered, observable, binary. "AC-1 …"

## 10. Test cases
| ID | Layer (unit/integration/e2e/contract/visual) | Given / When / Then | Covers AC |
|---|---|---|---|

## 11. Observability
Events emitted · logs with request/order ids · alerts.

## 12. Rollout
Feature flag(s) · environments · migration order · rollback plan.

## 13. Open questions
Anything the founder must decide before implementation starts. Empty at approval.
