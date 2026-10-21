# TASK-315 — Hub cards link to their product: every card on a destination-less category or occasion hub is an `<a>` to that product's page in the one open or opening country (Poland today), the ItemList `url` equal to each href, no price on the hub; asks the destination once two countries open

Row: `TASKS.md` → TASK-315. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-315`; keep it current by editing this file, not the row.

## Binding

- Spec 008 §14 **A-founder-2026-10-21a** (read it in full): every hub card is a server-rendered `<a>` to `/{locale}/{country}/flowers/{productSlug}` for the one open or opening country (Poland today); the hub stays priceless (AC-7); each ItemList `ListItem.url` equals the card's href; no new page, no parameter.
- With two or more countries open, the click asks the destination first: build only the single-country case now, behind one predicate, with a test that a second open country switches the behaviour off (a follow-up amendment designs the chooser).
- Motion 6 (premium hover) stays on these cards; it now matches a real link.
- Founder 2026-10-21: "why aren't flowers clickable?", "shouldnt it?", then "yes good. thanks".
- Same hub card as TASK-289 (spec 043 listing heads and chips): build in that PR or right after it, never in parallel.

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

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
