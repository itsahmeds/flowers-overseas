# ADR-0009 — Order lifecycle as a state machine emitting events to a single order_events table

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/01-architecture.md, plan/11-platform-roadmap.md |

## Context
CRM, vendor portal, automations and reporting are built in later phases and must consume the same order history without a migration.

## Options considered
1. **Status column only** — simplest; loses history, makes automations poll.
2. **Explicit state machine with guarded transitions, each transition appending an immutable row to order_events (and an outbox for webhooks)** — every later system subscribes to events.

## Decision
Option 2.

## Consequences and the trade-off accepted
Easier: audit trail, retries, analytics and every Phase 2–3 system for free. Harder: transitions must go through one service; direct status updates are forbidden and enforced in review.
