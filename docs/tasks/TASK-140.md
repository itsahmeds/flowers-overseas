# TASK-140 — Two live honesty/trust defects found by the competitor benchmark and verified on production. (a) The home row is headed **"Most sent this week"** on a site with **zero orders** — a sales-ranking claim that contradicts its own disclaimer and the listing page's "not a ranking by sales, by popularity or by payment"; spec 008 AC-9 already deleted this language from the nav, so the heading is inconsistent with a shipped rule. (b) `src/config/company.ts` ships `phoneE164: "+12135925150"` / `phoneDisplay: "+1 (213) 592-5150"` — a **US number** on a European relay service quoting **CET** hours, rendered in the utility strip, in `tel:` and in a `wa.me` link, and read by the `Organization` JSON-LD.

Row: `TASKS.md` → TASK-140. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-140`; keep it current by editing this file, not the row.

## Binding

Both defects are **live on production** and both were verified there, not inferred.

### (a) "Most sent this week" — a sales ranking on a site with no sales

`messages/en.json:457` heads the home trending row **"Most sent this week"**. There are zero
orders. The claim is false, and it contradicts three things this project already decided: the
row's own disclaimer beneath it, the listing page's sentence *"not a ranking by sales, by
popularity or by payment"*, and spec 008 AC-9, which already deleted this language from the
navigation. The heading is the last place it survived.

Replace it with a heading that says what the row actually is — our own selection — in all four
locales, and keep the disclaimer. **Do not** reach for "popular", "trending", "bestselling",
"customer favourites" or any synonym: they carry the same false claim in softer words, and the
honesty rule is about what the visitor concludes, not which word we used.

### (b) A US phone number on a European service

`src/config/company.ts:154-155` ships `phoneE164: "+12135925150"` and
`phoneDisplay: "+1 (213) 592-5150"`. Verified live on `/en`: it renders in the utility strip
beside **CET** opening hours, and appears as `tel:+12135925150` and
`https://wa.me/12135925150`. It is also read by the `Organization` JSON-LD, so it is what we tell
Google our contact number is.

A Los Angeles number on a cross-border European flower service, next to "Mon–Sat 8–20 CET", is a
trust defect on a product whose entire proposition is trust.

**This half is founder-gated and you must not resolve it yourself.** Do not invent a number, do
not substitute a placeholder that looks real, and do not silently delete the contact affordance —
a relay service with no way to reach a human is its own trust problem. If the founder's number
has not arrived when you pick this up, do part (a), record part (b) in `## Escalations`, and say
in `## Result` that it is outstanding. A fabricated contact number is worse than a missing one.

### Both

Whatever changes, the `Organization` JSON-LD, the visible strip, the `tel:` link and the WhatsApp
link must agree with each other afterwards — three of the four are generated from the same config
object and the fourth must not drift.

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
