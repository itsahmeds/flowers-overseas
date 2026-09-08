# ADR-0015 — Portable Postgres (Neon now, Hetzner later), Cloudflare R2 for images, Auth.js for identity

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-08 |
| Deciders | Ahmed |
| Supersedes | ADR-0008 (data layer, auth and storage only; the Next.js App Router decision stands) |
| Related | ADR-0012 (hosting; its "Supabase EU" reads as "Postgres per ADR-0015"), ADR-0009, ADR-0014, plan/01-architecture.md §3 §5, plan/08-deployment.md, specs/002-schema-v1.md |

## Context
Spec 001 is complete and spec 002 (schema v1) is next, so the database, identity and object-storage
providers must be fixed before any table is written. ADR-0008 chose Supabase (Postgres, Auth,
Storage, RLS) and listed "plain Postgres (Railway/Neon) + Auth.js + R2" as its fallback. The founder
has set the priority for this decision as **cheapest at scale**: the product will carry a large
volume of product imagery across many locales, and the founder does not want a per-unit price that
cannot be escaped once traffic is real.

Facts that shape the choice: the relational data (orders, events, catalogue, partners) stays in the
megabyte range for years; image bandwidth is the only cost that scales with page views; Supabase's
paid tiers price Storage and egress as well as Postgres; every design decision already taken
(Drizzle, versioned migrations, RLS, pg-boss, the event-sourced order lifecycle of ADR-0009)
requires real Postgres and nothing Supabase-specific.

## Options considered
1. **Supabase Free now, Supabase Pro at go-live** — zero assembly; Auth and Storage bundled ·
   ~$25/month from go-live plus metered Storage/egress that grows with images · ties identity and
   files to one vendor's pricing.
2. **Neon Free now; migrate to self-hosted Postgres on a Hetzner VPS (Coolify, backups to R2) when
   cost is real; Cloudflare R2 for all images; Auth.js/Better Auth in our own tables** — $0 during
   Phase 0–1 build, then a flat ~€8–15/month for far more storage and compute than managed tiers ·
   costs founder ops time for backups, patching and failover once self-hosted · forecloses nothing:
   plain Postgres moves by dump-and-restore. `[agent-inferred]` as the concrete shape of ADR-0008's
   fallback option.
3. **Managed Postgres with the largest free tier (Aiven ~5 GB) or Postgres-compatible engines
   (CockroachDB ~10 GiB)** — more free space than needed · Aiven single-node free tier has weak
   backup guarantees; Cockroach breaks pg-boss and some RLS patterns · space is not the constraint.
4. **Non-Postgres stores with large free tiers (MongoDB Atlas, TiDB, D1/Turso, Firestore)** —
   generous free space · would force rewriting ADR-0008, ADR-0009 and the job layer before spec 002;
   pg-boss and RLS do not exist on them · rejected on fit, not on price.

## Decision
Option 2: plain, portable Postgres — Neon Free (Frankfurt) for the Phase 0–1 build, moving to a
self-hosted Hetzner Postgres when the bill becomes real; Cloudflare R2 for every image and private
upload from day one; Auth.js (or Better Auth) with sessions and accounts in our own Postgres tables.
Supabase is no longer used for anything. Founder's call after weighing options 1–4 with
"cheapest-at-scale" as the stated priority; the recommendation was accepted.

## Consequences and the trade-off accepted
Easier: the only cost that scales with traffic (image egress) is free at any volume on R2; the
database bill is $0 through the build and flat afterwards; identity carries no per-user price; no
Supabase-specific API ever enters the codebase, so the host can change with a dump-and-restore.
Harder: two services (auth, object storage) that Supabase bundled are now our code and our config;
spec 002 gains auth tables and an image-key schema; the eventual Hetzner move puts backups,
patching and failover on the founder, mitigated by automated backups to R2 from the first
migration and by the rule that the app uses nothing a plain Postgres lacks. Neon's free tier caps
monthly compute hours, so indexable pages must stay ISR-cached (already the SEO rule) and the cap
is monitored from spec 002's health job.

Trade-off in the founder's words: *"cheapest-at-scale is my priority."* Accepted cost: more
assembly now and ops responsibility later, in exchange for a bill that stays flat as imagery and
traffic grow.

Guardrails: the Hetzner move is **deferred**, not decided — revisit trigger is the first month
Neon's paid tier or compute cap would be hit, or Phase 1 go-live, whichever is first; cost of
deferral is nil while Neon Free suffices. If at that point founder time is worth more than the
saving, staying on managed Neon is the recorded alternative.

Downstream changes: spec 002 stores image object keys and variant metadata (R2), not Supabase
Storage paths; spec 002 deletes `ALLOW_PLACEHOLDER_ENV` once the Neon URL exists; the RoPA adds
Neon (Frankfurt) and Cloudflare (EU jurisdiction) as processors; `plan/01` §3 image-loader seam
targets R2 with size variants generated once by a pg-boss job; ADR-0012's Supabase references are
read as "Postgres per this ADR" without editing that record.

## Rules
- Accepted ADRs are never edited. The only legal touch is flipping Status to `superseded-by`.
- `deferred` requires: guardrails while deferred, revisit trigger, cost of deferral.
- `not-applicable` requires a reason.
