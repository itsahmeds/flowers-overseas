# TASK-088 — Corridor corpus: the remaining `en` guide files (DE, FR, ES, IT, RO, NL) and the seven `en-gb` overrides (title, description, price/legal blocks, ≥2 FAQ answers per §13 Q9), each ≥70 % token-distinct, 8–12 FAQ, `relatedIso2` reciprocal across the set; no `de`/`pl` files (§13 Q1)

Row: `TASKS.md` → TASK-088. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-088`; keep it current by editing this file, not the row.

## Binding

Spec 007 **AC-18** (`relatedIso2` reciprocal, never self, targets without a page omitted rather
than rendered dead) and **T-19**; **AC-2**'s eighteen authoring rules read as a checklist, of which
this task re-cuts two — rule 5 `token-distinctness` and rule 18 `related-targets` — and **T-03**
(one deliberately failing fixture per rule, eighteen cases); **AC-19**'s honesty rules (no price,
cutoff, delivery date, same-day claim, florist count, rating, review or delivery photo in a `guide`
file). §13 **Q1** fixes the corpus at 7 × `en` + 7 × `en-gb` and forbids `de`/`pl` files until a
native writer delivers them; **Q2** forbids a price on a guide page; **Q9** makes the `en-gb`
overrides mandatory (title, description, the price/legal wording, ≥2 FAQ answers). §14 **A1**
governs what the honesty greps mean: the own-slug rule is URL-shaped only, and the
other-destination rule knows the seven destinations, so "Britain" and "the United States" are
legitimate in a body and "France" in the German guide is not.

The two **orchestrator rulings this round implements**, both dated 2026-09-16 and both answering
the escalations below:

- **§14 A3 — `relatedIso2` is a 2–3 band, reciprocity is slot-aware.** `RELATED_COUNT = 3` becomes
  `RELATED_MIN = 2` / `RELATED_MAX = 3` in `CountryLocaleContentSchema`, and gate rule 18 fails a
  one-way edge **only** where the target has fewer than `RELATED_MAX` entries. A target already
  full has nothing to reciprocate with, and the corpus keeps maximal reciprocity.
- **§14 A4 — rule 5 is 5-gram shingle distinctness ≥ 0.80.** Distinctness is
  `1 − |S_a ∩ S_b| / |S_a ∪ S_b|` over the sets of contiguous five-token shingles of the two
  bodies, under the rule's existing normalisation (lower-case, Unicode letters and digits, every
  other character a separator, stop-words retained), measured against **every** sibling in the
  locale. AC-2's "70 % token-distinct" wording stays in the spec as the intent; A4 says so
  explicitly, and this task does not edit the spec.

Spec 006 §14 A4 (no delivery-timing claims) and `docs/design/README.md` §Voice (first person, nine
banned words) apply to every line. Content plus the two gate rules the rulings name: no other code.

## Read

- `specs/007-corridor-pages.md` — §0 index, §2 (content model, internal links), §5.1/§5.2,
  AC-2, AC-18, AC-19, T-19, §13 Q1/Q2/Q9, §14 A1
- `content/corridors/en/pl-guide.md` — the reviewed exemplar: structure, voice, depth
- `src/modules/geo/content/schemas.ts`, `.../view.ts`, `scripts/corridor-check.ts` — the shape,
  the view model and the eighteen rules
- `seed/data/occasion-country.json` — the per-country occasion rules the guides are checked against
- `src/config/voice.ts`, `seed/copy.ts` (`DELIVERY_TIMING_PATTERN`) — the banned words and phrases

## Carry-forwards

- **From `/review 63` (2026-09-16, TASK-087):** the `price-literal` rule closes on a Unicode
  lookahead rather than `\b`, and `bannedVoiceWordsIn` deliberately has no word boundaries — copy
  written here must avoid "networked", "partnership" and every digit+currency form.
- **From `/review 66` (2026-09-16, this task, round 3 — required change):** all seven `en-gb`
  guides claimed a British establishment and UK governing law ("Your contract is with us, in
  Britain, under UK consumer law") in the FAQ rights answer and in `## Money, and where you
  stand`. The seller of record is an Estonian OÜ that is not yet registered (`plan/07` §1 and §7
  "trader identity for a **non-UK trader**"; `src/config/company.ts` `registered: false`), and
  governing law / jurisdiction is a lawyer-gated ⚖️ launch blocker that spec 007 §13 Q6 keeps out
  of this spec. Per the orchestrator's ruling the fourteen sentences now keep only the true
  reassurance — the buyer's contract is with us and not with the shop that makes the bouquet, and
  a complaint comes to us in English — and say **nothing** about where we are established or which
  law governs. No substitute claim (Estonia, EU law) was introduced; no terms-page slot exists in
  the content model, so the sentences point at nothing. Two `seoDescription`s that advertised
  "your UK rights" were reworded for the same reason. Also taken this round: the `en-gb/it-guide`
  nit ("and we deal with the shop" → "rather than to a shop abroad"). Any future copy touching
  trader identity, governing law or consumer-law rights must wait for the ⚖️ item.
- **From `/review 66` (2026-09-16), carried by the orchestrator to TASK-095:** rule 5 measures
  distinctness only **within** a locale, so a lazy `en-gb` override that near-copies its `en` base
  would pass all eighteen rules (rule 17 checks only title, description and ≥2 FAQ answers). This
  corpus does not exploit the gap — the reviewer measured the cross-locale pairs at 0.695–0.947 —
  but the gate has no teeth against a future override. Not this task's scope.

## Escalations

Both were raised on **2026-09-16** from this branch, both are now **answered** by an orchestrator
ruling recorded in `specs/007-corridor-pages.md` §14, and both rulings are implemented in round 2.
The founder may veto either, in which case the corpus and the two rules come back here.

- **2026-09-16 — `relatedIso2` reciprocity is arithmetically impossible at exactly three over
  seven pages.** Spec 007 §5.1 fixed `relatedIso2` at **exactly 3**; §13 Q1 fixes the corpus at
  **7** pages per locale, all of which exist; AC-18 and gate rule 18 require every edge to be
  reciprocated. A fully reciprocal graph is undirected, and an undirected graph with seven
  degree-3 vertices would have 7 × 3 = 21 edge-ends — an odd number, where every edge contributes
  two. No such graph exists (handshake lemma). Options offered: widen `relatedIso2` to a 2–3 band,
  or reciprocate only where the target's slots are not already full.
  **Answered by §14 A3 (2026-09-16, orchestrator): both.** The schema carries the band, rule 18 is
  slot-aware, and the corpus keeps maximal reciprocity. Status: `resolved`; founder may veto.
- **2026-09-16 — the ≥70 % token-distinctness floor (gate rule 5) cannot be met by prose.**
  `plan/02` §5.2 was implemented as a token **multiset** overlap with stop-words retained, so a
  file had to share under 30 % of its tokens with every sibling in the locale. Measured on this
  branch: the seven genuinely different `en` guides scored **36.4–50.6 %** distinct (mean 44.8 %),
  and two *unrelated* documents — the Poland guide against a 700-word slice of `plan/02` — scored
  **81.5 %**, while two arbitrary slices of `plan/02` against each other scored **70.5 %**. English
  function words alone put a floor of roughly 45–55 % shared on any two texts of this length, so
  the threshold was reachable only by padding, which AC-19's honesty rules exist to prevent.
  Alternatives measured on the same two bodies: content-word multiset **56.8 %**, distinct-token
  set overlap **50.0 %**, **5-gram shingle distinctness 92.9 %**.
  **Answered by §14 A4 (2026-09-16, orchestrator): 5-gram shingle distinctness, floor 0.80.** The
  rule id and AC-2's "70 %" wording are unchanged; only the metric is. Status: `resolved`; founder
  may veto.

## Result

Branch `task/TASK-088-corridor-corpus-en-en-gb`, PR #66. Round 3 is the `/review 66` fix round:
the trader-establishment and governing-law claims are gone from all seven `en-gb` guides.

**The corpus (round 1, unchanged in round 2).** Thirteen new corridor files —
`content/corridors/en/{de,fr,es,it,ro,nl}-guide.md` and
`content/corridors/en-gb/{pl,de,fr,es,it,ro,nl}-guide.md` — each `source: human`, **`reviewed:
false`** on every one of the fourteen until the founder skims them (indexability depends on it,
spec 007 §6), 667–795-word bodies, 132–169-word intros, 11 FAQ items (10 in the untouched
exemplar), `seoTitle` 42–54 chars, `seoDescription` 143–155 chars.
`content/corridors/en/pl-guide.md` is byte-identical to the reviewed version.

**The two rulings (round 2).**

- **A3.** `RELATED_COUNT` → `RELATED_MIN = 2` / `RELATED_MAX = 3` in
  `src/modules/geo/content/schemas.ts` (doc comment rewritten; the distinct and never-own-country
  refinements kept); gate rule 18 now fails a one-way edge only where the target has a free slot,
  and names the file, the field, the target's file and its slot count.
- **A4.** `tokenDistinctness()` is gone — replaced by `shinglesOf()` and `shingleDistinctness()`
  in `scripts/corridor-check.ts`, with `SHINGLE_SIZE = 5` and `SHINGLE_DISTINCTNESS_MIN = 0.8`.
  The failure message prints the measured value, the sibling file and the definition. A unit test
  asserts the old multiset metric leaves no dead code behind.
- `extends` semantics are untouched: rule 5 compares the **authored body of each file as
  committed**, and does not resolve `extends`. Every `en-gb` file carries its own full body (they
  are rewritten for a British sender, not inherited), and the rule only ever compares within one
  locale, so an `en-gb` page is measured against its six `en-gb` siblings and never against `en`.

**The related graph** (identical in `en` and `en-gb`; every page carries three):

| page | names | named back by |
|---|---|---|
| DE | PL, FR, NL | PL, FR, NL |
| ES | FR, IT, RO | FR, IT, RO |
| FR | DE, ES, IT | DE, ES, IT (+ NL one-way) |
| IT | FR, ES, RO | FR, ES, RO |
| NL | PL, DE, FR | PL, DE |
| PL | DE, RO, NL | DE, RO, NL |
| RO | PL, ES, IT | PL, ES, IT |

Ten reciprocal pairs per locale (DE–PL, DE–FR, DE–NL, ES–FR, ES–IT, ES–RO, FR–IT, NL–PL, PL–RO,
RO–IT) use 20 of the 21 edge-ends; the 21st is the single one-way edge **NL → FR**, and FR is full
at 3, so A3 permits it. Nothing else is one-way, in either locale.

**Measured minimum pairwise 5-gram shingle distinctness** (every ordered pair within a locale;
the floor is 0.80): **`en` 0.965** (DE vs PL), **`en-gb` 0.946** (ES vs IT). The templated
control — the Poland guide with its place names swapped — scores **0.052**.

**Gates.** `pnpm corridor:check` reports *14 corridor file(s), all 18 rules clean*; `pnpm test`
3571 passed / 5 skipped / 0 failed across 150 files (61 in the two corridor suites this task
touches: 48 in `corridor-check.test.ts`, 12 in `corridor-related.test.ts`, plus the map suite);
`pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:no-db`, `pnpm seed:check`,
`pnpm codebase:map --check`, `pnpm specs:index --check` and a cold `pnpm build` all green. No
route exists for this content yet, so no e2e, visual, a11y or Lighthouse run applies.

**Round 3 — the compliance rewrite (`/review 66`).** Sixteen edits across the seven `en-gb`
files, two per file plus two `seoDescription`s, and nothing else in the tree:

| file | what changed |
|---|---|
| `en-gb/pl-guide.md` | FAQ question → "Who am I buying from, and who do I complain to?"; answer and `## Money` paragraph now say the contract is with us "not from/with the shop that makes the bouquet" |
| `en-gb/de-guide.md` | FAQ question → "Who am I actually buying from?"; both places now say "not from whichever shop ends up making the bouquet" |
| `en-gb/fr-guide.md` | FAQ question → "Who is the order with, and who do I chase?"; both places now say "rather than with the florist who ties the flowers" |
| `en-gb/es-guide.md` | `seoDescription` "your UK rights" → "who your order is with"; FAQ question → "Who am I contracting with when I order?"; both places now say "not with the shop that arranges the flowers" |
| `en-gb/it-guide.md` | FAQ question → "Who do I deal with if an order goes wrong?"; both places now say "not with the fiorista who makes the bouquet", and the nit "and we deal with the shop" became "rather than to a shop abroad" |
| `en-gb/nl-guide.md` | `seoDescription` "your UK rights" → "who you buy from"; FAQ question → "Who am I buying from, and who handles a complaint?"; both places now say "never with the shop that ties the bunch" |
| `en-gb/ro-guide.md` | FAQ question → "Who is my order with, and who puts it right?"; both places now say "not with the florist who assembles the bouquet" |

`grep -rn -iE "britain|uk consumer law|uk law|under .* law|jurisdiction|estonia" content/corridors/`
now returns only sentences about the **reader's** location and calendar ("a British sender", "the
British dozen", "Sending flowers to X from the UK"), never about ours. `reviewed: false` is
unchanged on all fourteen files. No `en` file needed the same treatment: no parallel sentence
exists there.

**Round 3 gates.** `pnpm corridor:check` still reports *14 corridor file(s), all 18 rules clean*;
the rewrite raised the `en-gb` minimum pairwise 5-gram shingle distinctness to **0.9488** (DE vs
IT, recomputed independently; `en` unchanged at 0.9648, DE vs PL). `pnpm test` 3651 passed / 5
skipped / 0 failed across 155 files; `pnpm lint`, `typecheck`, `format:check`, `check:no-db`,
`seed:check`, `codebase:map --check`, `specs:index --check` and a cold `pnpm build` green. The
rebase onto `main` (post-PR-#65) took one conflict, the `tests/unit/` count in
`docs/codebase-map.md`, resolved by regenerating the map (161 → 162).

**Files changed beyond the corpus:** `src/modules/geo/content/schemas.ts`,
`src/modules/geo/content/view.ts`, `src/modules/geo/index.ts`, `scripts/corridor-check.ts`,
`scripts/corridor-check-cases.ts`, `tests/unit/corridor-check.test.ts`,
`tests/unit/corridor-related.test.ts`, `tests/unit/corridor-content-provider.test.ts`,
`README.md`, `docs/codebase-map.md`, this brief.
