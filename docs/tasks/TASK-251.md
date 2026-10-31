# TASK-251 — QA copy batch: the consent panel's developer language, and whether "offer" stays in two guide descriptions

Row: `TASKS.md` → TASK-251. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

**Blocked on the founder's copy batch.** Every item here changes public copy, which sets the key
to `reviewed: false`; `en-gb` sits at 4.98% of the 5% line, so nothing ships until the founder
attests a batch (`pnpm i18n:check` and spec 003 A17). The implementer drafts, the founder approves
per batch, and no agent sets `reviewed: true`.

- **N-09 (P2, QA-2), the consent settings panel.** The cookie list is developer language with em
  dashes: `consent.cookies.session.purpose` "Not set yet — there is no sign-in",
  `consent.cookies.csrf.purpose` "Not set yet — there is no form",
  `consent.cookies.stripeMid.purpose` "Not set yet — checkout is not open", and
  `consent.essentialLocked` ("...working — your language, your basket and the security of your
  order — so they..."). Rewrite each in plain words for a buyer, with no em dash (founder rule: no
  em dash in copy), in `en`, with `en-gb` only where British wording differs, and `de`/`pl`
  drafts `reviewed: false`. The register in `src/config/cookies.ts` stays the source of the list
  (spec 004 consent clause; AC-22). The panel being four screens tall on a phone is a layout
  question: it goes to TASK-252, not here.
- **Q18-08 (P2, QA-1), `content/corridors/en/fr-guide.md` and `ro-guide.md` `seoDescription`.**
  "what we can honestly offer there today" and "what we can offer in Romania today" show on the
  `/en/send-flowers-to` hub teasers. QA-1 reads "offer" as on the founder's banned list ("no
  offers", ruling of 2026-10-14). `RELAY_PATTERNS` in `src/config/honesty.ts` does not match it,
  and the ruling's word is about florists' offers, not about "we can offer". **Ask the founder
  first** (Escalations): if "offer" stays allowed, close this item as not a defect and record the
  answer; if not, redraft both descriptions without it (head copy: no em dash, spec 003 §14
  A-founder-2026-10-15a) and keep `seed:check` and the head scan of TASK-242 green.
- **Em dashes in body values owned by no other task.** `corridor.facts.*`,
  `corridor.steps.guide.oneBody` and `corridor.calendar.intro` are carried by TASK-189 (the
  guide); `occasionHub.dateUnknown` and `occasionsIndex.undatedNote` by TASK-188; `shop.card.noPrice`
  by TASK-188; `company.support.hours` by TASK-238. This task owns only the consent keys above.
- **Review class.** Keeps the breaker (compliance: consent text; head copy for the two
  descriptions).
- **Tests.** One per item, red on `c8d3b334`: the four consent values in the rendered panel
  contain no U+2014 and no "Not set yet"; the two guide descriptions (if changed) hold no "offer".
  Assert the exact new value, not a pattern.

## Read

- `src/config/cookies.ts`, `messages/en.json` (`consent.*`), `content/corridors/en/*-guide.md`
- `specs/004-design-system-layout.md` — consent clause (L88 to L94), AC-17, AC-22
- `specs/003-i18n-foundation.md` — A17 (indexable-only unreviewed share)
- `.claude/state/qa-2026-10-18/QA-2.md` (N-09), `QA-1.md` (Q18-08)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-11-01):** spec 004 §14 A-orchestrator-2026-11-01a clause 5. If TASK-430 has merged, its `PENDING_DASH_KEYS` lists this task's four consent keys (`consent.essentialLocked`, `consent.cookies.{session,csrf,stripeMid}.purpose`); delete those entries in this PR, since the check fails on an entry that no longer holds a dash.

## Escalations

- 2026-10-18: is "offer" ("what we can offer") on the banned list? Asked of the founder via the
  planning PR's body. Answer: `open`.

## Progress

_Not started._

## Result

_Pending._
