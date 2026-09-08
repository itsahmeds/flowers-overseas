# ADR-0008 — Next.js App Router + Supabase Postgres (EU region)

| Field | Value |
|---|---|
| Status | superseded-by ADR-0015 (data layer, auth and storage only; Next.js App Router decision stands) |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/01-architecture.md, plan/08-deployment.md |

## Context
Every public page must be server-rendered or static. Founder knows Next.js and Supabase. Cost must be near zero until revenue. Hosting provider is a separate decision (ADR-0012).

## Options considered
1. **Next.js App Router + Supabase (Postgres, Auth, Storage, RLS) in Frankfurt** — SSG/ISR/SSR per route; generated DB types; built-in auth and object storage.
2. **Astro + Postgres** — faster static output, weaker for authenticated app surfaces (portal, admin).
3. **Remix/SvelteKit + Neon** — comparable; founder ramp-up cost with no SEO upside.
4. **Next.js + plain Postgres (Railway/Neon) + Auth.js + R2** — more assembly for the same result; kept as fallback if Supabase pricing or region becomes a problem.

## Decision
Option 1. Accepted recommended default. Rendering strategy per page type is specified in 01.

## Consequences and the trade-off accepted
Easier: one framework for marketing site, checkout, admin and later vendor portal; RLS for tenant isolation. Harder: framework-specific ISR semantics tie cache behaviour to the host's Next.js support (weighed in 08); Supabase Auth becomes the identity provider for all roles.
