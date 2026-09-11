# TASK-084 — Brand-voice copy pass on shipped message keys (spec §14 A5): rewrite `nav.*`, `footer.*`, `company.*`, `destinations.*`, `consent.*` and the header/footer trust sentences in the first person ("we", "our florist in …", "our team"), remove "relay"/"corridor"/"partner"/"third party" from customer copy, cap geographic claims at live coverage ("across Europe"), prefer specific over superlative; `de`/`pl` re-drafted deterministically; a `no-literal-strings`-style lint or unit scan that fails on the banned words in `messages/*.json` and `src/`

Row: `TASKS.md` → TASK-084. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-084-brand-voice-copy`. Founder, 2026-09-09. Copy only — no component, layout or behaviour change; `en.meta.json` attestations reset to `reviewed: false` for rewritten keys until the founder skims them; the honesty guardrails in A5 are binding (no "anywhere in the world", no "own shops"). Runs after the header and footer merge so it edits keys that exist. **Started 2026-09-09 by the orchestrator on main:** `company.description` rewritten to the round-2 colophon sentence ("We send flowers across Europe. You order from us; our florist in the recipient's town makes the bouquet and hands it over in person.") because TASK-059 round 2 changed the artboard the `company-config` test pins; `de`/`pl` re-drafted; footer test pin updated. The rest of the pass remains.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From `/review 40`:** two phrasings of the 14:00 Warsaw cutoff one screen apart (utility strip vs `finder.cutoff`); `finder.help`, `finder.destinations.heading/onboarding` are implementer copy marked `reviewedBy: founder` — put them in front of the founder.
- **From `/review 53`:** 11 implementer-attested strings from TASK-053 incl. `trust.guarantee.name`, `home.howItWorks.*`, `faq.*`, `occasions.*` subtitles need the founder's copy pass and `reviewedBy: founder`.

## Escalations

_None recorded._

## Result

_Pending._
