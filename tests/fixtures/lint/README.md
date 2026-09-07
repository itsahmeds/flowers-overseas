# `tests/fixtures/lint/`

Fixtures for the custom `fo/*` ESLint rules and the Stylelint disallow lists (spec 001 §2, §5).

These files intentionally violate the rules, so they are **excluded from the main lint run**
(`globalIgnores` in `eslint.config.mjs`; Stylelint only ever sees `src/**/*.css` in `lint:css`) and
from Prettier and `tsc` (`.prettierignore`, `tsconfig.json` excludes) so they stay byte-exact.

Two ways to run the rules against them:

| Command | What it does |
|---|---|
| `pnpm lint:fixtures` | runs ESLint + Stylelint on this directory with `--no-ignore`; **exits non-zero** by design (the executable form of AC-4 / AC-5) |
| `pnpm test` | `tests/unit/no-physical-css.test.ts`, `no-literal-strings.test.ts`, `stylelint-physical-css.test.ts` (RuleTester / Stylelint API / ESLint Node API over the real config) |

Keep the fixtures free of TypeScript-only syntax: the RuleTester parses them with espree
(`ecmaFeatures.jsx`).

| File | Expected |
|---|---|
| `physical-css.tsx` | `fo/no-physical-css` (`ml-4`, `text-left`) |
| `physical-css-variant.tsx` | `fo/no-physical-css` (`md:-mr-2`) |
| `physical-css-helper.tsx` | `fo/no-physical-css` inside a `cn()` call |
| `logical-css.tsx`, `logical-css-variant.tsx`, `logical-css-helper.tsx` | clean |
| `physical.css` | `property-disallowed-list` / `declaration-property-value-disallowed-list` |
| `logical.css` | clean |
| `literal-string.tsx` | `fo/no-literal-strings` (JSX text) |
| `literal-aria.tsx` | `fo/no-literal-strings` (`aria-label`) |
| `literal-alt.tsx` | `fo/no-literal-strings` (`alt`) |
| `literal-strings-valid.tsx` | clean (`className`, `href`, `data-testid`, punctuation-only text) |
