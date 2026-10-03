# TASK-173 — Every visible chrome control is a real link or is not shown

Row: `TASKS.md` → TASK-173. This brief is the task's long form (spec 001 §14 A15, AC-34).

## Binding

- **Founder, 2026-10-03, in chat**, after clicking the live site: "i say 1 or 2 subpar static pages
  nothing else?". Verified the same day (orchestrator audit): on every page the header category row
  (Our selection, Birthday, Sympathy, Occasions, Bouquets, Roses, Plants, Add-ons, Destinations, For
  florists), Search, Sign in, My orders, Basket, Help & WhatsApp, most footer items and the home
  trending cards render as plain text; nothing on the home links into the 84-product Poland shop,
  its categories, occasions or product pages, although those pages answer 200.
- **Ruling (orchestrator, 2026-10-03; spec 004 and spec 008 amendments follow on a docs branch):**
  1. A chrome target whose page **exists** is published as a link through `src/config/site-links.ts`
     (data, not markup): category row → the destination-less category or occasion hub that matches
     the label (`/{locale}/flowers/{category}`, `/{locale}/{occasions}/{occasion}`), "Occasions" →
     the occasions index, "Destinations" → the destinations hub, "Our selection" → the country shop
     root of the one demo destination (Poland) in each locale where it exists. Trending cards link to
     their product pages. Footer items with an existing page link to it.
  2. A target with **no page yet** is **not rendered at all** (supersedes spec 004 AC-14's
     "render as text"): Search, Sign in, My orders, Basket, and footer items such as How it works,
     The guarantee, Help and contact, Company, legal pages, until TASK-174 builds them. Nothing on
     the page may look clickable and do nothing.
  3. Every new link answers 200 in every locale that renders it, and the AC-21 crawl (TASK-113)
     reaches more pages, never fewer. The `de`/`pl` hubs and shop roots exist since PR 150.
- Rendering stays server-side; no client JS added; logical CSS only; no literal strings.

## Read

- `src/config/site-links.ts` (its header explains the publishing model), `docs/codebase-map.md`.
- `specs/004-design-system-layout.md` — `## 0. Index`, AC-14; `specs/008-…` AC-20, AC-21.
- `/private/tmp` is not readable by you; the audit is summarised above.

## Carry-forwards

_None._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
