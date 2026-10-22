# TASK-287 — The product page links its promise to the guarantee page

Row: `TASKS.md` → TASK-287. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

`/review 270` round 1 (2026-10-19, comment 6270164693), ruling (b) E3: "the orchestrator opens a product-page task row:
the link where `infoPageExists("guarantee", locale)` holds, and a test pinning the PDP promise text equal to the
guarantee's promise sentence." Spec 009 §14 A11 bullet 1: "Where `infoPageExists("guarantee", locale)` is true, it
links to the guarantee page (spec 041)"; spec 041 §6 internal links name the product page as a link in.

- The PDP's fresh-flower promise line links to the guarantee page in each locale where `infoPageExists("guarantee",
  locale)` holds, and renders no link where it does not.
- A unit test pins the PDP promise text (the one message key shared with the guarantee page, spec 009 A11) equal to the
  guarantee page's promise sentence (spec 041 Appendix A.3); red when either changes alone.
- An e2e case: the link's `href` on an `en` product page, and no link in a locale without the page.
- No promise text changes. No new key: the link wraps existing text or reuses a reviewed key.
- **Review class: review-only** (a link and a test); the breaker if the diff changes any promise or legal text.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/009-product-page-date-picker.md` §14 A11; `specs/041-trust-help-legal-pages.md` §6, AC-16
- `docs/tasks/TASK-182.md` (what PR 270 ships: `infoPageExists`, the guarantee page)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-182 (PR 270) merges. Product page: never beside TASK-286, TASK-128, TASK-129 or TASK-249.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-20 (frontend-implementer): `ProductPage` takes `guaranteeHref`; the product route hands `infoPagePath("guarantee")` where `infoPageExists("guarantee", locale)` holds (en, en-gb today), and the promise title becomes the link; unit equality (PDP `product.trust.freshness.*` = the guarantee page's `promise` section heading and first paragraph) and render cases, e2e for en/en-gb href and de/pl no link; mutations watched red; next: PR after TASK-286's PR is ready.
- 2026-10-20: rebased on origin/main; PR #303 opened after PR #301 went ready; ready with `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR #303](https://github.com/itsahmeds/flowers-overseas/pull/303). The product route passes `guaranteeHref` when `infoPageExists("guarantee", locale)` is true (en and en-gb today), and the fresh-flower promise's `h3` title then links to the guarantee page. In de and pl the title stays plain text. No text and no key changed. Tests: 6 unit cases in `tests/unit/product-page.test.tsx`:
- the PDP promise title and sentence equal the guarantee page's `promise` section, in en and en-gb;
- de and pl have no guarantee page;
- with a path, one link inside the promise heading;
- without a path, no link.

Four mutations each turned a case red: the link dropped, the PDP sentence edited, the PDP title edited, the page sentence edited in the corpus. 4 e2e cases in `tests/e2e/product-page.spec.ts`: the en and en-gb `href`s and their 200 responses, and no link on de or pl. They run in CI. No local build or browser run. One earlier `gates:cheap` run had the tests gate exit 1 under load average ~15. It passed on the immediate re-run, and on the rebased head below. The failing file was not captured.

```
gates:cheap · 80b1f802f33b5fac3c695030ef3ff8992e0d3bb2 · tree clean · base origin/main · 2026-10-20T17:23:13.517Z
typecheck             exit 0 · 8.9 s
lint                  exit 0 · 21.0 s
format:check          exit 0 · 12.1 s
i18n:check            exit 0 · 0.8 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 23.3 s · changed 9 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```
