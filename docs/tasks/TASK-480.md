# TASK-480 — Business page: info page `business` in the registry and segment, `content/pages/{en,en-gb}/business.md`, the enquiry form and the sent page wired to TASK-479's action, the "where we deliver" block from `corridorState()`, SEO (canonical, hreflang, sitemap, JSON-LD), footer and help links, the `business` family in `pages:check`, axe, visual and Lighthouse

Row: `TASKS.md` → TASK-480. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-480`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 048 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-13, AC-14, AC-21, AC-22, AC-23, AC-24.
- **§15 A-orchestrator-2026-10-25 is binding:** the first-screen action is a link to `#enquiry` labelled with the form heading's key; block order H1, intro, action, "how it works", "what companies send us for", where we deliver, what to expect, FAQ, form, talk to us directly; on desktop "how it works" sits beside the H1. On layout the design leads.
- **The page:** info page `business` in `src/config/info-pages.ts`, family `business` (trust honesty rules plus a 400-word floor in `en`), segment key `business` in `PATH_SEGMENT_KEYS` (`corporate-flowers`, `blumen-fuer-firmen`, `kwiaty-dla-firm`), prose in `content/pages/{en,en-gb}/business.md` from Appendix A, `reviewed: false`; `de` and `pl` 404 until their files exist. Sent page `/{locale}/corporate-flowers/sent`, never indexable, never linked.
- **Absent, not placeholder:** client logos, testimonials, counts, prices, discounts, "account manager", "invoice", "net 30". "Partner" is a banned word. The reply-time sentence stays absent until the founder approves it (§13 Q2).
- **The form** uses TASK-479's server action: plain `<form method="post">`, works with JS off, error summary takes focus, Art. 13 notice above the submit button, no consent or marketing checkbox; flag off renders the direct-contact block and no `<form>`.
- **SEO:** self-canonical, reciprocal hreflang over indexable locales with `x-default`, `static.xml`, JSON-LD exactly `WebPage`, `BreadcrumbList`, `FAQPage`. Footer "For business" link in every locale and one link from the help page, not in the header (§13 Q8).
- **Gates:** axe in four locales (form, error, flag-off, sent), visual baselines desktop and mobile in `en-gb`, `pl`, `de`, `/ar-XB`, Lighthouse on `/en-gb/corporate-flowers`, no new client chunk.

## Read

- `specs/048-business-gifting.md`: `## 0. Index` first, then §2 "The page"; §5.3; §6; §7; §9 AC-1 to AC-7, AC-13, AC-14, AC-21 to AC-24; §15; Appendix A
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/business-page-{desktop,mobile}.dc.html`, `business-sent-{desktop,mobile}.dc.html`, `docs/design/flows/business-enquiry.dc.html`
- `src/config/info-pages.ts`, `src/config/locales.data.ts`, `src/config/voice.ts`, spec 041's `infoPageView()` and `pages:check`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
