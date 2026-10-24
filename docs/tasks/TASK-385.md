# TASK-385 — The country chooser: `/{locale}/{chooseSegment}/{next}` (SSR, uncached, `noindex`, robots-disallowed, in no sitemap), its form and no-match list, the choice's 303 with `Set-Cookie: fo_dest` (path form too), the `fo_dest` cookie register row and policy line, the history replace in the deferred island, no geo or language read

Row: `TASKS.md` → TASK-385. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-385`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 3: the chooser is a normal page (header, H1 `home.picker.label`, `<main>`, no dialog), SSR, `Cache-Control: private, no-store`, `noindex, nofollow` in meta and `X-Robots-Tag`, disallowed in `robots.txt`, in no sitemap. Buttons for the shop countries (first `PICKER_CHIPS` by `sortWeight`, then collation), a search field with a `<datalist>` of every registry country, `home.picker.submit`, `shop.choose.remember`; with `fo_dest` a first `shop.choose.continue` button, and never a forward on its own (200, never 3xx).
- The choice (GET `to`, or the path form `/{locale}/{chooseSegment}/{iso2}/{next}`): ISO code or any launch-locale name; a shop country answers 303 to `countryVersionOf(next, country)` with one `Set-Cookie: fo_dest` (180 days, `SameSite=Lax`, `Secure`, `Path=/`, not `HttpOnly`); no match lists the closest names; a non-shop country goes to TASK-395's not-live page (until it lands, the chooser's no-match list with the full grouped list).
- `fo_dest` row in `src/config/cookies.ts` (essential, `consent.cookies.dest.purpose`) and the cookie policy line (ePrivacy Art. 5(3), PECR reg. 6(4)(b)). With JavaScript on, the island turns the submit into `location.replace()`.
- No read of `cf-ipcountry`, `Accept-Language`, `x-forwarded-for` for geography or geolocation (ADR-0006, AC-89); no cached response sets a cookie.
- Class: keeps the breaker (a redirect, a cookie, consent text).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 3, "Compliance" (the cookie), AC-77 to AC-79, AC-89, AC-90
- `docs/design/wireframes/choose-country-desktop.dc.html`, `choose-country-mobile.dc.html`, `docs/design/flows/buyer-journey.dc.html`
- `src/config/cookies.ts`, `src/app/robots.ts`
- `docs/codebase-map.md`

## Carry-forwards

- **Deferred island budget, shared:** TASK-384 (hover, selector label), TASK-385 (history replace), TASK-391 (fill, URL rule) and TASK-393 (countdown) together add at most 2,560 B Brotli to the existing deferred set, no new island on any route (spec 004 item "Rendering"). Print this PR's share and the running total; if it will not fit, drop the hover first (Q-24g), then stop and report.
- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

## Escalations

- **2026-10-24, the colour shape** (`open`): see TASK-381.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
