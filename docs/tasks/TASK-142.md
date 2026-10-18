# TASK-142 — Live corridor corpus for the first go-live country: `content/corridors/en/pl-live.md` (and its `en-gb` override) — the copy a corridor page shows once Poland has a confirmed florist, as distinct from the `-guide` state TASK-088 authored. **Nobody owns this today**: TASK-088 is `done` and authored the guide corpus only, TASK-124 lands PL's `operations` block but no content, and `corridor:check`'s `live-operations` rule refuses a live file until that block exists — so the two must land together or the gate fails. Until both exist, `corridorState("PL","en")` stays `guide` and TASK-114's AC-15 tripwire cannot fire.

Row: `TASKS.md` → TASK-142. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-142`; keep it current by editing this file, not the row.

## Binding

**Why this row exists.** `/review 93` round 3 asked an agent to place a carry-forward on whichever
task lands the two files a go-live tripwire depends on. It found that only one has an owner, and
**it declined to invent a task row** — which is the correct behaviour and is why this row is
written by the orchestrator instead.

- PL's `operations` block in `src/config/countries.ts` belongs to **TASK-124** (spec 009 §12
  step 4 / §13 Q3), which now carries the dated instruction.
- `content/corridors/en/pl-live.md` belongs to **nobody**. TASK-088 is `done` and authored the
  guide corpus explicitly excluding `de`/`pl` and the live state; no other row names it.

**The two must land together.** `corridor:check`'s `live-operations` rule refuses a live content
file until the `operations` block exists, so a lone `pl-live.md` fails the gate and a lone
`operations` block leaves the corridor with nothing to render in its live state. Until both
exist, `corridorState("PL", "en")` stays `guide`, and TASK-114's AC-15 tripwire
(`expect(corridorState("PL","en")).toBe("guide")`) stays green — which is exactly what it is for:
it goes red the day this task lands, and tells whoever is doing go-live that AC-15's assertion can
finally move onto the shop root where the criterion actually bites.

**What the content is.** The `-live` state is what a corridor page says once Poland has a
confirmed florist, as against the `-guide` state it shows today. Read `docs/tasks/TASK-088.md`
and the shipped guide corpus first: the live copy must be **≥70 % token-distinct** from its guide
twin, carry 8–12 FAQ entries, and keep `relatedIso2` reciprocal across the set, exactly as the
guide corpus does. An `en-gb` override is required on the same terms as the seven TASK-088 wrote.

**This is founder-gated and honesty-gated, and that is not a formality.** The live state says a
florist exists. Do not write it, and do not merge it, before one actually does — the whole
product is a trust promise, and a corridor page claiming a confirmed florist we have not confirmed
is the single most damaging untruth this site could tell. If you reach this task and no Polish
florist is confirmed, stop and say so.

**Phase 1.** Nothing a Phase 0 visitor sees depends on this. It is recorded now so that the
ownership gap is not rediscovered on go-live day, which is the worst possible time to find it.

**Status: BLOCKED, and the block is not a formality.** Two things must be true before an agent is dispatched; neither is in the repo's gift.

1. **A confirmed Polish florist exists.** The live state says a florist exists. Until the founder says one is confirmed (plan/13 C2 keeps PL as the only live corridor; B13 validates the first three florists), do not write or merge this file.
2. **The founder's copy batch.** `pl-live.md` and its `en-gb` override are new public (indexable) corridor copy, reviewed by the founder's own `record-approval` run. en-gb's unreviewed share is at 4.98% of the 5% line, so this copy cannot ship `reviewed: false` into the tree without tipping en-gb. The agent drafts the files, lists every English string for the founder, and **stops**. It never sets `reviewed: true`.

**What binds (spec 007, AC ids in the row: AC-18, live half).**

- **AC-18.** "`relatedIso2` is reciprocal across the committed set, names only countries with an existing page in that locale (others are omitted, not rendered dead), and never names the file's own country", in the 2 to 3 band of §14 A3 (reciprocity only where the target has a free slot). The live files carry `relatedIso2` too; adding or changing it must keep the whole set reciprocal.
- **AC-2's authoring rules still apply to a live file**, except the `guide`-only claim rules. §2 `corridor:check`: not `source: machine`; intro 120 to 200 words; 8 to 12 FAQ items with at least half country-specific; `seoTitle` present and at most 60 characters; `seoDescription` present and at most 155; the own-slug and other-country rules (§14 A1: URL-shaped own slug, the seven known destinations); the nine banned words (`docs/design/README.md` §Voice, no word boundaries on purpose); **no price literal anywhere in copy** (prices are data, `formatMoney` only); no digit-bearing scale claim ("200+ florists"); a `live` file for a country with an incomplete `operations` block fails `live-operations`. Token distinctness is **5-gram shingle distinctness at least 0.80** against every other corridor file in the same locale, including `pl-guide.md` (§14 A4). An `en-gb` file that `extends: en` must override title, description and at least two FAQ answers.
- **§14 A-founder-2026-10-15a (AC-36, `dash-in-head`).** No U+2014, no spaced hyphen, no spaced U+2013 in `seoTitle`, `seoDescription` or any FAQ question. That rule lands with TASK-242; write the live files to it anyway. No em dash in prose either (founder rule).
- **§14 A-founder-2026-10-14c (AC-33 to AC-35).** A country is `status: "live"` only while ordering is open there (`deliveryDatesOpen`), which is `pickerState("PL") === "live"`. Poland is `demo` today. Opening Poland is one data flip: the `operations` block (landed by TASK-124), an active-partner provider answering true, `status: "live"`, and the live content file, **together**. Without the four, `corridorState("PL","en")` stays `guide`. Live-state copy may name a cutoff only where the facts block renders it from data; the prose carries no time of day and no zone name as a literal (AC-34's scan).
- **§2 live state.** The same template with the delivery-facts block populated, the from-price and the shop entry; "zero template edits between the two" (AC-8). This task authors content only. If the live state needs a template change, escalate.
- **Tripwires that go red by design when this lands** (TASK-124 hand-off 3): `tests/unit/listing-params.test.ts` (the `corridorState("PL","en")` equals `guide` carry-forward) and `tests/unit/corridor-route.test.ts` "keeps Poland in the guide state even with a florist and a cutoff". Move each onto the shop root per their own comments, in the same PR; do not delete them.
- **Class: keeps the breaker.** The files feed `<title>`, meta description and the `FAQPage` JSON-LD (SEO gate), and carry the go-live honesty claim.
- **Watch red, then restore:** a live file for a country with the `operations` block removed (`live-operations`); a price literal in the body; a 13th FAQ item; a one-sided `relatedIso2`; an en-gb file that overrides no FAQ answer; a U+2014 in `seoTitle`; a live body whose shingle overlap with `pl-guide.md` is above 0.20.
- **Gates:** `pnpm corridor:check`, `pnpm seed:check`, `pnpm i18n:check`, `pnpm gates:cheap` with its block pasted; CI green with `ci:full`.

## Read

- `specs/007-corridor-pages.md`: `## 0. Index`, then §2 ("`pnpm corridor:check`", "The page, in its two states"), §9 AC-2, AC-8, AC-18, AC-19, §14 A1, A3, A4, A-founder-2026-10-14c, A-founder-2026-10-15a.
- Files: `content/corridors/en/pl-guide.md` and `content/corridors/en-gb/pl-guide.md` (the twins this must differ from and match in shape), `scripts/corridor-check.ts` and `scripts/corridor-check-cases.ts` (the rules and the cases), `src/modules/geo/content/` (provider and `corridorState`), `src/config/countries.ts` (PL `operations`, `status`).
- `docs/tasks/TASK-088.md` (how the guide corpus was authored and gated), `docs/tasks/TASK-124.md` hand-off 3, `docs/tasks/TASK-114.md` E-5. Note: `docs/runbooks/corridor-content.md` is named by spec 007 AC-28 but does not exist yet; do not depend on it.

## Carry-forwards

- **From `/review 93` round 3 (2026-09-21), E-5:** the go-live tripwire needs two files; this row is the owner of the second. Both must exist before `corridorState("PL","en")` leaves `guide`.
- **From TASK-124 (2026-10-03), hand-off 3:** landing `pl-live.md` turns `listing-params.test.ts` and `corridor-route.test.ts` red by design. Move each assertion onto the shop root where AC-15 bites; keep the comments' archaeology.
- **From TASK-114 (2026-09-22), E-6 and its tripwire:** the depth-4 listings now carry the parameter policy (TASK-146), so the go-live flip no longer announces `index,follow` on a parameterised shop URL. Re-run `listing-params` and `listing-depth4-params` on the live fixture.
- **From spec 007 §14 A-founder-2026-10-14c (2026-10-14):** the go-live flip also sets Poland's `status` to `live`; AC-35's unit test (`status === "live"` iff `deliveryDatesOpen`) must stay green. The flip is the go-live task's; this task only supplies the copy.
- **From TASK-096 (2026-10-15):** the head-copy change (TASK-242, TASK-243) merges before the indexing flip; write these files to its rules.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
