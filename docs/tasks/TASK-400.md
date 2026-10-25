# TASK-400 — Search text core and configuration: `src/config/search.ts` (`SearchConfigSchema` with every §5.1 constant, `suggestions: false`), the localised segment in `locales.data.ts` (`search`, `suche`, `szukaj`), pure `normaliseForSearch`, `tokenise` with the stop words, `stem` per launch locale, `damerauLevenshtein`, and `parseQuery` consuming country words in three languages

Row: `TASKS.md` → TASK-400. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-400`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-400 to TASK-403 are one feature PR built by one backend agent on branch `task/TASK-400-site-search`; the description names all four IDs and each row gets the PR link. Class (DoD §4): keeps the breaker (privacy, logging, data flows, the ranking key).
- AC-11 (T-11): `parseQuery` consumes country words (endonyms and exonyms from `country_translation`) in three languages; words beat `to`. With no country in the words and no `to`, the destination is none (A-orchestrator item 1).
- Explicit scope with no AC id: `SearchConfigSchema` in `src/config/search.ts` exactly as §5.1 lists it (passes `check:no-db`), and the `search` path segment per locale in `src/config/locales.data.ts`, resolved through spec 003's routing (confirm the routing fits before writing the route in TASK-402).
- Normalisation, stop words, stems and Damerau-Levenshtein exactly as §2.3; no regular expression built from user input (§2.8).

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.3, §2.4, §2.8 (abuse limits), §5.1 (configuration), §5.2 (module table)
- `src/config/locales.data.ts`, `src/modules/geo` public `index.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
