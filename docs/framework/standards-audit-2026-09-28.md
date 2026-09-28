# Coding-standards audit — 2026-09-28

Gap 17. A breaker agent audited `origin/main` at `bacd403`, read-only, in its own worktree. For each standard it planted a deliberate violation, ran the one check meant to catch it, and restored the file. Verdicts:
- **ENFORCED**: the check went red.
- **PARTIAL**: some violations slip through, or CI runs the check only with the `ci:full` label.
- **WORDS ONLY**: no check exists.
- **CLAIMED BUT FALSE**: a doc says it is enforced, and it is not.

"Spine" means CI's `lint → typecheck → test-unit → build`. "Label" means the job runs only with `ci:full`.

**Result: 6 ENFORCED (3 only within a stated scope), 8 PARTIAL, 4 WORDS ONLY, and 6 false claims in the docs.**

## The biggest finding

**A bare `/* eslint-disable */` switches off every lint lock in a file**, and nothing notices. `/* eslint-disable */` plus `export const price = 1.5` gives exit 0 from all three checks: `pnpm exec eslint`, `node scripts/check-no-literal-disable.ts`, and the lint-fixtures "no lint suppression" test. Named disables of `fo/no-literal-strings` and `fo/no-float-money` do go red; named disables of the other `fo/*` rules are not policed. Cheapest fix: `linterOptions: { noInlineConfig: true }` or `reportUnusedDisableDirectives: "error"`, plus a bare-disable ban in `check:no-literal-disable`.

## Table

| # | Standard | Verdict | Check | CI | Proof (plant → result) |
|---|---|---|---|---|---|
|1|No literal strings|PARTIAL|`eslint/fo/no-literal-strings.js`|spine|Plain JSX text, `alt`, `aria-label`, `title` → red. Slip through: ternary strings in JSX, a `const` label, a spread `aria-label`, template literals, string concatenation, `metadata.title`|
|2|No physical CSS|PARTIAL|`fo/no-physical-css`, `stylelint.config.mjs`|spine|`ml-4`, `text-right`, ternary `left-0`, CSS `margin-left`/`text-align:right` → red. Slip through: a class string in a `const`, `style={{marginLeft}}`, `@apply ml-4`, the `margin` shorthand, `float:left`|
|3|Intl formatting|PARTIAL|`fo/no-adhoc-intl`|spine|`new Intl.*`, `toFixed`, `` `€${x}` ``, `toLocaleDateString` → red. Slip through: hand-built date templates, number-and-currency templates, `replace(".",",")`|
|4|Integer money|PARTIAL|`fo/no-float-money`|spine|`price: number`, `price = 12.5` → red. Slip through: `priceMinor/100`, `priceMinor*0.23`, `amountMinor = 12.5`, `cost = 12.99`, `Number(s)`|
|5|Status via `transition`|PARTIAL|`fo/no-direct-order-status-write`|spine|`db.update(orders).set({status})`, raw `UPDATE orders SET status` → red. Slip through: an aliased table, a quoted-identifier SQL string, `onConflictDoUpdate`, `.set(patch)`, anything in `scripts/`/`seed/`. `orderService.transition` does not exist yet|
|6|Zod at boundaries|WORDS ONLY|none|—|A route with `(await req.json()) as {…}` → eslint 0, tsc clean|
|7|TS strict|PARTIAL|tsconfig + next-ts ESLint|spine|`any`, `@ts-ignore`, an unchecked index → red. `m!.a` with no comment → clean. Dropping `noUncheckedIndexedAccess` → test stays green. `strict:false` → red|
|8|Migrations with a rollback|PARTIAL|`scripts/db-check.ts`|label|No `.down.sql` → exit 1. An empty `.down.sql` → 0. An `ALTER TABLE` with no Drizzle change → 0|
|9|No PII in logs, URLs, analytics|PARTIAL (logs) / WORDS ONLY (URLs, analytics)|logger key list, `no-console`, Sentry `beforeSend`|spine|PII under other key names, an email in the message, an email in a URL → printed in clear. `globalThis.console.log`, `process.stdout.write` → lint clean|
|10|Secrets and env|PARTIAL|`env-check.ts`, gitleaks in `test-unit`|spine|Key removed from `.env.example` → exit 1. Raw `process.env.X` in `src/modules` → 0. gitleaks not planted (no local binary, and installing needs network)|
|11|SEO per page|PARTIAL (needs a build)|`scripts/seo/validate-*.ts` read fixtures only; e2e checks 14 hand-listed URLs|label|A new page with no metadata → `pnpm seo:validate` exit 0|
|12|Schema price = visible = charged|ENFORCED (module level)|`validate-schema.ts:358`, pricing `resolve.ts:281`|spine|Equality disabled → 3 red; surcharges dropped → 3 red. The rendered DOM price vs JSON-LD needs a build|
|13|No IP redirects|PARTIAL|`fo/no-geo-redirect`|spine|`cf-ipcountry` → red. Slip through: other geo headers, computed header names, `accept-language` → redirect in a route handler|
|14|Conventional commits|PARTIAL|commitlint hook, `pr-policy.ts`|label / on ready|Bad message → 1, bad title → 1. Bypassable: `--no-verify`, a direct push to `main`, a title edited after ready|
|15|Module boundaries|ENFORCED|`import/no-restricted-paths`, `eslint/modules.js`|spine|Deep alias, relative, dynamic and module→app imports → all red|
|16|Go-live as data|WORDS ONLY|none|—|`iso==="PL"` → clean. `status:"live"` lives in `src/config/countries.ts`, so going live is a code change today|
|17|SDK only in adapters|WORDS ONLY|none|—|`@sentry/nextjs` and `postgres` imported directly in `src/modules/geo` → eslint 0|
|18a|`check:no-db`|ENFORCED (declared file set)|script|spine|Static, dynamic and `@/lib/db` imports → 1. A computed env name → 0|
|18b|`check:no-literal-disable`|PARTIAL|script|spine|Named disables → 1. A bare `eslint-disable` → 0|
|18c|`check:no-vercel-env`|ENFORCED (three named vars)|script|spine|`.VERCEL_ENV` → 1. A computed name → 0|
|18d|`check-layout`|ENFORCED|script via `layout.test.ts`|spine|Unknown module, missing barrel → red|
|18e|`budget:client-js`|ENFORCED (logic)|script + unit test|spine|Budget ×10 → 7 red. A real overweight page needs a build|
|18f|`cookies:check`|PARTIAL|script via `cookies-config.test.ts`|spine|Register vs prose drift → red. A cookie set in code but never registered → 0|

## Claimed but false

1. `plan/12` §2 Language: "no non-null assertions without comment — tsconfig + ESLint". No such rule exists.
2. `ci.yml` L197: the strict flags "are asserted by `pnpm typecheck:fixtures`". The test ignores `unchecked-index.ts`.
3. `plan/12` §2 SEO: "CI validators" enforce title, canonical, hreflang and JSON-LD per page. The validators never read a page.
4. `plan/12` §2 DB: "no schema drift — CI job `db:check`". It checks tables only, and runs only with the label.
5. `plan/12` §2 i18n: "ESLint + Tailwind plugin". No Tailwind ESLint plugin exists here; `prettier-plugin-tailwindcss` only sorts classes.
6. `plan/12` §2 Commits: "commitlint in CI". The job runs only with the label.

## Words only, ranked by cost to the business, with the cheapest lock for each

1. **Zod at boundaries** (money and security). A unit test that walks `src/app/**/route.ts` and the server actions, and fails on `req.json()`/`formData()` without `.parse`/`.safeParse`.
2. **PII in URLs and analytics** (GDPR). A test over route segments and search-param schemas against the logger's PII key list. Also extend the logger to catch email and phone patterns in values.
3. **Go-live as data** (operations, and ranking). A `no-restricted-syntax` rule on ISO-2 literal comparisons outside `src/config`. The real fix is the admin flag, which is spec work.
4. **SDKs outside adapters** (cost and lock-in). An `import/no-restricted-paths` zone for `@sentry/*`, `postgres`, `stripe`, `resend` outside the adapter files.

Clean-up: the worktree was removed and no process is left running. Nothing was committed, pushed or labelled.
