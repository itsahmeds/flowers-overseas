ADVISOR: GO WITH FIXES

# Spec 001 §14 A20, "Standards locks" (AC-50 to AC-62, Q17 to Q22)

Subject: `specs/001-repo-dev-os-bootstrap.md` §13 Q17–Q22 (L354–395) and §14 A20 (L915–1271), branch `spec/001-a20-standards-locks` at `ab236ce`. This is advice, not approval, and not legal advice.

## 1. In one sentence
A20 turns six rules that are only written down into real checks that one line cannot switch off. It gets GO WITH FIXES because the approach is sound and checks out against the tools' own documentation, but one of its checks goes red on today's code even though the spec says it won't, and three clauses need tightening.

## 2. Verdict: GO WITH FIXES
1. **AC-55 (c) and the "Expected green on the first run" paragraph (L1256).** `src/modules/analytics/ga4.ts` L13 builds `` `…/gtag/js?id=${measurementId}` ``, which is a `?id=` in a template literal under `src/`. So AC-55 goes red on the first run. Adding `id` to `QUERY_KEYS` is also wrong, because the listing schema "reads its keys from it" and would start honouring `id`. Change (c) so it applies only to URLs we route (relative paths and our own origin), or add a separate `EXTERNAL_QUERY_KEYS` list (`path#key` plus a reason, the way `READERS`/`PARSERS` work) and start it with `ga4.ts#id`.
2. **AC-54, the phone bullet (L1077), and T-58.** There is no left boundary. As written, "`00` + 7–15 digits" matches inside any long run of digits, for example a timestamp-in-milliseconds string `"1700000000123"` or a payment or partner reference, so it would blank values support needs. Require that the `+`/`00` is not preceded by a letter or digit, and add both of those examples to T-58's list of values that must come out unchanged.
3. **Q20 (L379–384).** The flag has to be set with `SET LOCAL` / `set_config(…, true)`, which lasts only for the current transaction. Web traffic uses PgBouncer in transaction mode (`src/lib/db.ts` L27, `.env.example` L43), and there a session-level `SET` leaks into another client's transaction or disappears. Also require the orders spec to give integration tests a documented way to set up an order's state. AC-60 (5) says tests do this directly, and the trigger would refuse them.
4. **AC-53 "Not covered" (L1062).** Add `useSearchParams()` in client components to the list. Nobody uses it today, but the list promises to state every gap.

## 3. The four hats
**Building**
1. The ga4.ts false red in fix 1 shows how clause (c) works: every future outbound link with a query string (maps, share links, payment redirects) needs a list entry. Fix 1 makes each entry a visible, deliberate step.
2. The merged `no-restricted-*` builder (AC-52, AC-56, AC-57, AC-59) is the most delicate part. Each file group needs a different mix of bans: `logger.ts` keeps the SDK ban but drops the console ban, `sentry.ts` is the reverse, and `tests/` keeps the `as Minor` ban. The spec's reasoning is correct: in flat config a later block's options replace earlier ones ([ESLint docs](https://eslint.org/docs/latest/use/configure/rules)). AC-52 and T-56 test it. Keep AC-56, AC-57 and AC-59 with one agent, as task 3 already plans.
3. Two claims I checked, and both hold. First, `import/no-restricted-paths` returns early when an import does not resolve (`if (!absoluteImportPath) return;`, [source](https://raw.githubusercontent.com/import-js/eslint-plugin-import/main/src/rules/no-restricted-paths.js)), so rejecting it for SDKs is right. Second, `noInlineConfig` ignores all inline config and warns about each ignored comment ([docs](https://eslint.org/docs/latest/use/configure/configuration-files), [RFC 22 commit](https://github.com/eslint/eslint/commit/afd8012c2797f2f5bf3c360cb241ea2ba6e1a489)). It breaks nothing today. The only `eslint-disable` in the tree is `ConsentBannerIsland.tsx` L170, and A20 plans for it. There is no `@ts-expect-error` outside `tests/`, and no generated file carries a disable header. `globalIgnores` is pinned exactly, so a future generated folder needs a change to the test. That is intended.

**Google:** no concern. No page, URL, canonical or sitemap changes.

**Law and compliance**
1. Q21: the default does not catch numbers written the local way, such as UK `07700 900123` or PL `600 123 456`. The first line of defence is the key list (`phone`, `phone_e164`, `message`, `card*`, `*name`), so free text is the remaining exposure: `msg`, error text, partner errors that echo input. GDPR asks for measures that are "appropriate" (Art. 5(1)(c), Art. 25, [Regulation 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)), not for any particular pattern. Whether this leftover risk is acceptable is a decision for a privacy professional, not for me.
2. As a backstop that needs no code, Sentry's own server-side data scrubbing could be switched on for the project [inferred: a Sentry project setting; confirm in the dashboard].

**Customer:** no concern for buyers. For the founder, the likely false alarms are money words on counts (`totalPages: number`, `netWeight`), fixed by renaming, and a parse moved into a helper in another file, fixed by a `PARSERS` entry. Each fix is small and a reviewer sees it.

## 4. Questions the founder should ask
1. Who confirms the phone-number leftover risk (Q21): do we have a privacy adviser, and is Sentry's server-side scrubbing on?
2. Am I happy that every outbound link with a query string means one list entry in a test file?
3. Is one day on the `Minor` type worth it now, before payments, when about 200 references in 31 files change, most of them in tests?
4. Is the spec that creates `orders` named and scheduled, so the Q20 requirement actually lands?
5. When a lock fires on legitimate code, the fix is an exception block the reviewer sees. Am I fine with the reviewer, not me, judging those?

## 5. What looks right
The spec rejects `reportUnusedDisableDirectives` and `import/no-restricted-paths` for the right reasons. Each lock states its own limits, and "fails if it found none" stops a check from passing when it has checked nothing.
