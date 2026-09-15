# TASK-088 — Corridor corpus: the remaining `en` guide files (DE, FR, ES, IT, RO, NL) and the seven `en-gb` overrides (title, description, price/legal blocks, ≥2 FAQ answers per §13 Q9), each ≥70 % token-distinct, 8–12 FAQ, `relatedIso2` reciprocal across the set; no `de`/`pl` files (§13 Q1)

Row: `TASKS.md` → TASK-088. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-088`; keep it current by editing this file, not the row.

## Binding

Spec 007 **AC-18** (`relatedIso2` reciprocal, never self, targets without a page omitted rather
than rendered dead) and **T-19**; **AC-2**'s eighteen authoring rules read as a checklist;
**AC-19**'s honesty rules (no price, cutoff, delivery date, same-day claim, florist count, rating,
review or delivery photo in a `guide` file). §13 **Q1** fixes the corpus at 7 × `en` + 7 × `en-gb`
and forbids `de`/`pl` files until a native writer delivers them; **Q2** forbids a price on a guide
page; **Q9** makes the `en-gb` overrides mandatory (title, description, the price/legal wording,
≥2 FAQ answers). §14 **A1** governs what the honesty greps mean: the own-slug rule is URL-shaped
only, and the other-destination rule knows the seven destinations, so "Britain" and "the United
States" are legitimate in a body and "France" in the German guide is not. Spec 006 §14 A4 (no
delivery-timing claims) and `docs/design/README.md` §Voice (first person, nine banned words) apply
to every line. Content only: no code beyond the rendered-list helper T-19 names.

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

## Escalations

- **2026-09-16 — `relatedIso2` reciprocity is arithmetically impossible at exactly three over
  seven pages.** Spec 007 §5.1 fixes `relatedIso2` at **exactly 3**; §13 Q1 fixes the corpus at
  **7** pages per locale, all of which exist; AC-18 and gate rule 18 require every edge to be
  reciprocated. A fully reciprocal graph is undirected, and an undirected graph with seven
  degree-3 vertices would have 7 × 3 = 21 edge-ends — an odd number, where every edge contributes
  two. No such graph exists (handshake lemma). The corpus is therefore built to the maximum
  reciprocity available: every edge reciprocal except one per locale (`NL → FR`), pinned by
  `tests/unit/corridor-related.test.ts` so the gap cannot multiply. **Decision needed** (owner:
  founder/orchestrator; `open`): either widen `relatedIso2` to a 2–3 band in
  `CountryLocaleContentSchema` so one page in an odd-sized set carries two, or relax gate rule 18
  to require reciprocation only where the target's three slots are not already full. Both are
  changes to TASK-087's schema/gate, so neither was made here.
- **2026-09-16 — the ≥70 % token-distinctness floor (gate rule 5) cannot be met by prose.**
  `plan/02` §5.2 is implemented as a token **multiset** overlap with stop-words retained, so a
  file must share under 30 % of its tokens with every sibling in the locale. Measured on this
  branch: the seven genuinely different `en` guides score **36.4–50.6 %** distinct (mean 44.8 %),
  and two *unrelated* documents — the Poland guide against a 700-word slice of `plan/02` — score
  **81.5 %**, while two arbitrary slices of `plan/02` against each other score **70.5 %**. English
  function words alone put a floor of roughly 45–55 % shared on any two texts of this length, so
  the threshold is reachable only by texts about different subjects: no amount of authoring gets
  seven flower guides there, and the only way to move the number is padding, which AC-19's honesty
  rules exist to prevent. **Decision needed** (owner: founder/orchestrator; `open`): re-cut the
  metric. Measured alternatives on the same two bodies — content-word multiset (stop-words
  dropped) **56.8 %**, distinct-token set overlap **50.0 %**, **5-gram shingle distinctness
  92.9 %**. The shingle measure is the one that actually detects the failure mode `plan/02` §1
  names (a template rendered for a place nobody wrote about would score near zero) and is robust
  to shared vocabulary; a 0.80 floor on 5-gram shingles is the recommendation.

## Result

Branch `task/TASK-088-corridor-corpus-en-en-gb`, PR #66 (draft, blocked on the two escalations
above). Shipped the thirteen new corridor files — `content/corridors/en/{de,fr,es,it,ro,nl}-guide.md`
and `content/corridors/en-gb/{pl,de,fr,es,it,ro,nl}-guide.md` — each `source: human`,
`reviewed: false`, 667–795-word bodies, 132–169-word intros, 11 FAQ items (10 in the untouched
exemplar), `seoTitle` 42–54 chars, `seoDescription` 143–155 chars. `content/corridors/en/pl-guide.md`
is byte-identical to the reviewed version: the graph was built so that its authored
`["DE","RO","NL"]` is fully reciprocated. Added `relatedCorridorViews()` to
`src/modules/geo/content/view.ts` (the rendered related list T-19's third clause needs) and
`tests/unit/corridor-related.test.ts` (9 unit cases). Gates: lint, typecheck, `format:check`,
`seed:check`, `check:no-db`, `tasks:check`, `codebase:map`, `specs:index`, cold `pnpm build` and
`budget:client-js` all green; `pnpm test` 3194 passed / 20 failed, every failure in
`tests/unit/corridor-check.test.ts` and traceable to gate rules 5 and 18; `pnpm corridor:check`
reports 14 files across `en` and `en-gb` with **16 of 18 rules clean**, 84 `token-distinctness`
problems and 2 `related-targets` problems. Both remaining rules are the escalations above and
neither is fixable by authoring.
