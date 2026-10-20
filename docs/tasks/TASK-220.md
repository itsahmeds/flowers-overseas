# TASK-220 — Spec 012 flags page: `/admin/flags` listing and toggling registry keys only, orphaned keys shown and refused, the typed-key confirmation for high-risk flags, `invalidate(['catalog:{iso2}'])` on a `checkout.open` toggle and the tag in `urlsForTag`

Row: `TASKS.md` → TASK-220. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-220`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 10 (page half). Owns **AC-14 (page half: `/admin/flags` lists and toggles registry keys only and refuses an unknown or orphaned key; `checkout.demo_guard` needs the admin role and the typed key; a `checkout.open` toggle for a country calls `invalidate()` once with exactly `catalog:{iso2}`)**; tests **T-16 (integration half), T-24 and T-25 for `/admin/flags`**.
- **Scope:** the page on TASK-219's registry and reader; toggles inside `withAdminContext` with an action (audited by TASK-218's trigger); `urlsForTag` learns `catalog:{iso2}` in `src/lib/cache.ts`; `invalidate` revalidates the origin and then purges the edge, and a failure is `warn` + Sentry with the tags. The locale and site-link overlays are spec 012b's and are not built.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Why TASK-202 is a dependency** (spec 012 task 10 does not list it): the `checkout.open` flag and its `PL` scope row come from spec 010 §5.1 A, seeded by TASK-021 or, if TASK-021 merged without them, by TASK-202's fallback migration; the page needs the rows to exist.
- **Class:** not review-only (`CLAUDE.md` DoD §4): cache invalidation and a high-risk switch over the checkout's mode. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.4; §5.3 (the flags row); §5.4 "Invalidation"; §11; §9 AC-14; §12 task 10.
- `specs/010-checkout.md` §5.4 (the PDP button and the tag); `docs/tasks/TASK-219.md`; `src/lib/cache.ts`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/admin-flags-desktop.dc.html`, `docs/design/wireframes/admin-flags-mobile.dc.html`. The typed-key confirmation keeps its button enabled and refuses a mismatch with a message (the audit's decision 5; spec 004 §14 A20).

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: `/admin/flags` (page, action), `src/modules/admin/flags.ts` (`listFlags`, `toggleFlag`, `FlagToggleFormSchema`), `invalidate()` and `pathsForTag()` in `src/lib/cache.ts` (origin then edge, warn + Sentry on failure), `urlsForTag` learns `catalog:{iso2}` (now async; the Cloudflare adapter's resolver may be async and its `invalidate` resolves to `{ ok }`), admin primitives `AdminControls.tsx` and `AdminConfirmSwitch.tsx`, 48 `admin.flags.*` keys (unreviewed), nav entry built. Unit and integration tests green on a throwaway PG16; 23 mutations each watched red. Next: CI on the head SHA.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 306](https://github.com/itsahmeds/flowers-overseas/pull/306). What shipped:

1. `/admin/flags`, admin only (`flags.toggle`). It lists the registry keys by scope: one switch per configured destination for `checkout.open`, one global switch for `checkout.demo_guard`. Every other key the database holds is shown as orphaned, with no control (migration `0009` seeds fourteen: `corridor.*`, `locale.*`, `payments.*`).
2. `toggleFlag` refuses an unknown or orphaned key, a high-risk key without the `admin` role or without the key typed exactly, a stale form (the scope row's `updated_at`), and a destination the configuration does not name. It upserts the scope row inside `withAdminContext` with the action `flags.toggle`, so the audit trigger records it. After the commit it calls `invalidate()` once with `dirtiedTags()`: exactly `["catalog:PL"]` for `checkout.open` on PL, nothing for the demo guard, nothing for a toggle that changes nothing.
3. `invalidate(tags)` in `src/lib/cache.ts` revalidates every document carrying the tags at the origin first (a product page also by its internal `-product` route), then purges the edge. It never rejects. It logs one `cache.invalidate` line; on either failure that line is a `warn` and Sentry gets `cache.invalidate.failed` with the tags.
4. `urlsForTag("catalog:{iso2}")` resolves to the destination's listings and product pages in every locale, read from `listingPages()` and `listProductPages()`. It is now async. The Cloudflare adapter accepts an async resolver, and its `invalidate` resolves to `{ ok }` so the caller can see a purge that did not land.
5. The typed-key confirmation is a native modal `<dialog>` island. The button is always enabled and the server refuses a mismatch with a message.

Tests:
- unit `admin-flags` (18: page states, toast and refusals, action, nav)
- unit `cache-invalidate` (11: catalog tag, order, failure paths)
- unit `admin-permission-binding` (+7: the page and the action answer 403 to ops, finance and content)
- unit: updates to `cache`, `cache-cloudflare`, `admin-scans`, `url-pii` (three query keys) and `checkout-mode` (the R5 allow-list named a path that never existed; it now names the page folder and `src/modules/admin/flags.ts`)
- integration `admin-flags` (7, T-16 integration half, on a throwaway PG16), plus updates to `cache-cloudflare-purge`

23 mutations, each watched red; the list is in the PR. I took no build slot and ran no browser locally. **Owed, as for TASK-217 and TASK-218:** T-24 a11y and T-25 visual for `/admin/flags` signed in, which wait for the CI-database task.

`pnpm gates:cheap` at 97951453 (load average 4.8):

```
gates:cheap · 97951453f98f9d77e78f4435213aeaf7ef89823b · tree clean · base origin/main · 2026-10-20T19:08:05.319Z
typecheck             exit 0 · 2.5 s
lint                  exit 0 · 21.8 s
format:check          exit 0 · 13.6 s
i18n:check            exit 0 · 0.8 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 28.3 s · changed 29 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```
