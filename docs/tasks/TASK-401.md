# TASK-401 — Search engine: `SearchSource` over catalog and geo public functions, `buildIndex` with the alt field, `matchDocuments` (tiers 1 to 5, relevance bands), pure `rankSearchResults` (§2.5's seven-step key), `didYouMean` (zero results only, one step wider), `memoryEngine`, the static `rankBandsFor` (all 0), `onInvalidate` in `src/lib/cache.ts` with the 300 s age, the index log and the two `/api/health` numbers

Row: `TASKS.md` → TASK-401. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-401`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-400 to TASK-403 are one feature PR built by one backend agent on branch `task/TASK-400-site-search`; the description names all four IDs and each row gets the PR link. Class (DoD §4): keeps the breaker (privacy, logging, data flows, the ranking key).
- AC-6, AC-7, AC-8, AC-9 (T-06 to T-09): exact ordered SKU arrays on the static catalogue, never a set of reachable values; the mutations §10 names must turn each case red.
- AC-16 (T-16): `rankSearchResults` is §2.5's seven-step key and nothing else (tier, relevance band, margin band, saleable, photo, curation, SKU), with the property test. Margin never lifts a result across a tier or relevance band.
- AC-31 (T-31): `memoryEngine` on the static providers with no `DATABASE_URL`; rebuild after `invalidate(['catalog:PL'])` and after 300 s on an injected clock; `src/modules/search/` imports only public `index.ts` files.
- `didYouMean` per A-orchestrator item 2 (zero results only, one step wider, ties by distance, document count, `Intl.Collator`); its rendered form is AC-37 in TASK-402.
- `rankBandsFor(iso2)` in `catalog` returns all 0 on the static provider; the database provider is TASK-405.
- Explicit scope with no AC id: §11's `search.index_built` log and the `/api/health` numbers `searchIndexAgeSeconds`, `searchIndexDocuments`.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.3, §2.5 (the key), §2.9, §5.2, §5.4 (index freshness), §11, §14 A-orchestrator-2026-10-24 item 2
- `src/lib/cache.ts`, `src/modules/catalog` public `index.ts`, `src/app/api/health/`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-25 (backend-implementer; decided in the PR and flagged for the orchestrator, not blocking): **AC-6's lists cannot all hold under §2.3's typo rule read literally on the committed catalogue.** On `/pl/szukaj`, `róże` (normalised `roze`) is one edit from `boze` (`Boże Narodzenie`, Christmas, a Polish occasion label), so a per-document typo match lists three Christmas bouquets for `róże` and none for `róża` (distance 2), while AC-6 requires one ordered list for both. Two refinements make every AC-6 to AC-9 case hold; both are in the code, and a test goes red without each: (1) `typoDistance.fixedPrefix: 1` in `src/config/search.ts`: a typo target begins with the typed word's first letter (the Lucene "prefix length" convention); (2) "in this order" applied per document: where a token matches some field of a document firmly (exact, stem or prefix), its typo hits in that document's other fields are dropped, so `róże` cannot lift a "Rose…" name into relevance band 2 by a typo. Question for the founder or the spec writer, if they want it: is a wrong first letter acceptable as never corrected (`tulpis` and `sunflwers` still are; `bulips` is not)? Answer: open.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25 (backend-implementer): built in feature PR 421 with TASK-400. `src/modules/search/` (build, match, rank, did-you-mean, engine, source, default-engine, schemas, types), catalog `entityCopy`, `hasCardPhoto`, `rankBandsFor`, `listingHref`, `onInvalidate` in `src/lib/cache.ts`, the two health numbers. Index build about 150 ms warm on the committed catalogue (2 352 documents) and query p95 about 4.5 ms, measured on the laptop at load about 3 (TASK-410 owns the CI measurement).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 421 (with TASK-400). `memoryEngine(deps)` builds the index lazily from `catalogSearchSource` (a fresh, memoised source per build), marks it stale on any `catalog:*`, `product:*` or `country:*` tag through `onInvalidate`, rebuilds after 300 s, shares one build between concurrent searches, and logs `search.index_built` (documents, locales, duration_ms, trigger `initial`, `invalidate` or `ttl`, generation; never a query). `search()` returns `{ view, tierCounts, generation }`: `view` is the strict `SearchResultViewSchema` (no band, margin, payout or tier field) in the states `empty`, `tooShort`, `results`, `noResults` (with `didYouMean` and "Our selection"), `noDestination` and `outOfRange`. Pages block: the named country's shop root (or corridor page) first, then the matched hubs (occasions, then categories, by collation), each resolved through `listingHref` only when it exists, at most 3 in all. `rankBandsFor` is all 0 on the static catalogue. `/api/health` adds `searchIndexAgeSeconds` (null before the first search) and `searchIndexDocuments`. Tests: `unit/search-engine.test.ts` (T-06 to T-09 and T-11 as exact ordered arrays), `unit/search-rank.test.ts` (T-16: the 12-input fixture, the step pairs, 2 000 seeded pairs), `unit/search-did-you-mean.test.ts`, `unit/search-freshness.test.ts` (T-31), `unit/search-default-engine.test.ts`, `unit/cache-on-invalidate.test.ts`, `unit/catalog-listing-href.test.ts`, and the health additions. Handed to TASK-402: see its brief.
