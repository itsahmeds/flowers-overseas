## Part 2: `TASKS.md` row

The PR and "Depends on" cells are written `-` to keep this file free of dashes. Use whatever
`TASKS.md` uses for an empty cell.

| TASK-NNN | Spec 004 Polish letters in the Latin font subsets: five ranges move from Latin-Ext to Latin in `SUBSET_RANGES`, `pnpm fonts:build` re-subsets the five faces, the six `localFont` ranges and the font tests follow, so `/pl` chrome renders from the preloaded Alegreya Sans files | `specs/004-design-system-layout.md` · §14 A-orchestrator-2026-10-23 · AC-58, AC-59 (T-63, T-64) | 0 | todo | frontend-implementer | - | - | Brief: `docs/tasks/TASK-NNN.md`. Small, review-only; merges before TASK-185, whose PR 328 then rebases and re-runs CI with its own commits unchanged. |

---

## Part 3: brief seed (`docs/tasks/TASK-NNN.md`)

- **Binding.** Spec 004 §14 A-orchestrator-2026-10-23, clauses 1 to 8, AC-58 and AC-59 (T-63 and
  T-64). Budgets are not raised; clause 5's table is a bound, and the measured table goes in
  `## Result`.
- **Read.** `scripts/fonts/build-fonts.ts`, `src/modules/ui/fonts/index.ts`,
  `src/modules/ui/fonts/hand.ts`, `src/modules/ui/fonts/subset.json`, `tests/unit/fonts.test.ts`,
  `tests/e2e/fonts.spec.ts`, `tests/e2e/header.spec.ts` L118 to L180, and the TASK-185 brief's
  Escalations (the `/pl` header shift).
- **Run.**
  - `pnpm fonts:build` (needs the network; light, no build slot);
  - `pnpm gates:cheap`;
  - `tests/unit/fonts.test.ts` with `--maxWorkers=2`.

  The e2e and visual cases are CI's.
- **Proof of AC-59 (d).** Record it here when PR 328's re-run on its rebased head is green at
  1280 px on `/pl`.

---

## Self-check

- **Numbering.** The amendment continues spec 004: the last AC is AC-57 and the last T is T-62 (A-founder-2026-10-15b
  region, L2604 and L2619), so the new ids are AC-58, AC-59, T-63, T-64. The heading follows the
  §14 `A-<who>-<date>: <title> (<what it amends>)` shape of the latest amendments.
- **Facts checked against the repo.** The ranges, file names and byte figures come from
  `scripts/fonts/build-fonts.ts` L59 to L112 and `src/modules/ui/fonts/subset.json`. The preload set
  comes from `index.ts` L99 to L123 and `PRELOADED_FILES`. The failing case and run come from the
  TASK-185 brief (`/Users/ahmed/dev/fo-wt-185/docs/tasks/TASK-185.md`, L261 to L262). The e2e
  coupling comes from `tests/e2e/fonts.spec.ts` L110 to L181.
- **Code points.** `ó`, `Ó` and all of `ä ö ü ß Ä Ö Ü` are below U+0100, so they are already Latin.
  The 16 that move are U+0104 to U+0107, U+0118 to U+0119, U+0141 to U+0144, U+015A to U+015B and
  U+0179 to U+017C. The new Latin-Ext list is the old one minus those five ranges, so the subsets
  stay disjoint and the union is unchanged.
- **Arithmetic.** Each bound is the Latin file plus its own Latin-Ext file:
  - Alegreya Sans: 9,592 + 2,744 = 12,336 and 9,728 + 2,756 = 12,484, so the preloaded pair is
    24,820.
  - Fraunces: 13,352 + 4,180 = 17,532 and 16,848 + 4,804 = 21,652.
  - Caveat: 20,048 + 4,712 = 24,760 for the Latin file. Both Caveat files: 24,760 + 4,712 = 29,472.
  - Page sum: 64,004 + 14,484 = 78,488.
- **Not measured.** I had no shell. The bound and the estimate are labelled as such, and the
  measurement is the implementer's.
- **SEO, i18n and compliance** each have a substantive note. Money, migrations and data flows are
  not touched.
- **CLAUDE.md rules.** None is violated: server rendering, logical CSS and literal strings are not
  affected; no IP redirect; no PII. The deviation from `plan/01` §7 L222 and `plan/03` L67 is
  stated, as A6 and A21 did.
- **Copy.** No em dash in this file.
- **Open questions for the founder:** 0. The orchestrator's ruling settles the approach, and the
  founder may still overrule it.
