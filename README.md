# Flowers Overseas

International flower relay for Europe. Planning repository: see `plan/00-summary.md` for the executive summary and `CLAUDE.md` for how work is done here (spec-driven, agent-enforced).

No application code exists yet. The first `/implement` happens against `specs/001-*` and a `TASK-` id.

## Layout
- `plan/` — the build plan (00–13)
- `specs/` — one spec per feature (template inside)
- `docs/adr/` — decision records · `docs/decisions-log.md`
- `docs/runbooks/` — operational procedures · `docs/compliance/` — RoPA, DPAs, sign-offs
- `docs/research/` — competitor and SERP research
- `.claude/` — agents, skills, hooks, settings for Claude Code
- `TASKS.md` — single source of truth for work

## Local setup (target: <15 minutes, to be completed by spec 001)
1. `pnpm install`
2. `cp .env.example .env.local` and fill from the Vercel env store (`vercel env pull`)
3. `pnpm db:migrate && pnpm db:seed`
4. `pnpm dev`

## Lint rules that encode the non-negotiables
The custom ESLint rules live in `eslint/fo/` — a local plugin, plain ESM JavaScript with JSDoc
types, imported directly by `eslint.config.mjs` (no build step, nothing published). Stylelint
(`stylelint.config.mjs`) is the CSS half of the same rules.

| Rule | What it stops | Spec |
|---|---|---|
| `fo/no-physical-css` | physical Tailwind utilities (`ml-4`, `md:-mr-2`, `text-left`, `rounded-l-`, `border-r-`, …) in `className`/`class` and in `cn`/`clsx`/`cva` arguments; the message names the logical replacement | 001 §7 · plan/03 §4 |
| Stylelint `property-disallowed-list` + `declaration-property-value-disallowed-list` | `margin-left/right`, `padding-left/right`, `left`, `right`, `border-left*`/`border-right*`, corner radii, `text-align: left\|right` in `*.css` | 001 §7 |
| `fo/no-literal-strings` | literal JSX text and literal `alt`/`title`/`placeholder`/`aria-label` values in `src/**` — copy comes from the message catalogue (spec 003) | 001 §7 · plan/03 §5 |

| Command | Purpose |
|---|---|
| `pnpm lint` | `lint:js` (ESLint) + `lint:css` (Stylelint on `src/**/*.css`) |
| `pnpm lint:fixtures` | runs both over `tests/fixtures/lint/`, which violates the rules on purpose; **exits 1 by design** and names every file and rule |
| `pnpm check:no-literal-disable` | fails if any file under `src/` disables `fo/no-literal-strings` (spec 001 AC-6) |

`tests/fixtures/lint/` is excluded from `pnpm lint`, Prettier and `tsc`; the rules are exercised
against it by `tests/unit/no-physical-css.test.ts`, `no-literal-strings.test.ts`,
`stylelint-physical-css.test.ts` and `lint-fixtures.test.ts`.
