# TASK-100 — Cloudflare declarative config: `config/cloudflare/zone-settings.json` (the §5.4 enable / do-not-enable table with reasons), `apply-zone-settings.ts` — idempotent apply (`0 changes` on rerun) and `--check` (no writes, one line per drift, non-zero), endpoint allow-list pinned by unit test (any `/accounts/` path fails), 403 → named missing scope, `pnpm cloudflare:check` / `cloudflare:apply`, the `cloudflare-check` CI job (paths, `ci:full`, nightly) pinned in `ci-workflow.test.ts`

Row: `TASKS.md` → TASK-100. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-100`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §5.4 and §9 AC-15, AC-17, AC-23, AC-24, AC-29 (tests T-15, T-17, T-24, T-25, and T-27's `cloudflare-check` half). §12 step 4: the settings are applied by the script to the zone while it still points at nothing. `config/cloudflare/zone-settings.json` is the declared state: the nine protocol/TLS settings of AC-15 and the §5.4 do-not-enable table, each row with its reason. `pnpm cloudflare:check` makes no write, prints one line per differing setting and exits non-zero on drift; `pnpm cloudflare:apply` is idempotent (`0 changes` on a second run). The token holds exactly Zone Settings Edit, DNS Edit, Cache Purge and Zone Read on the single zone; a unit test pins the endpoints the script may call and fails on any `/accounts/` path; a 403 is reported as the named missing scope. Cache rules, the rate limit and DNS records are TASK-101's, not this task's.

**The live half is owed to the founder.** No agent holds a Cloudflare token. The contract tests against recorded zone responses are this task's gate. AC-17's "it passes on the current zone" and a first live `cloudflare:apply` are one founder paste, recorded under `## Escalations` exactly as TASK-157 records T-44: the runbook gains the click-by-click token steps (scopes above, one zone) and the commands to paste. The `cloudflare-check` CI job reads the token and zone id from repository secrets the founder adds; say in the runbook which two secret names, and make the job fail with a named message, never pass, when they are absent under a trigger that runs it.
- **2026-10-03 — the eye-check of the rows no zone token can read (spec 040 §14 A5, CF-1). Done by the
  orchestrator in the founder's signed-in Cloudflare dashboard, at the founder's instruction.** Zone
  `flowersoverseas.com`, free plan. (1) **IP-geo redirects:** Rules → Overview shows no URL Rewrite, Redirect,
  Configuration, Origin, Transform or Compression rule; the only rule is the cache rule for
  `media.flowersoverseas.com/*`. (2) **Access on production:** Access shows its "Get started" page: no
  application exists. (3) **Access / basic-auth on staging and PR:** no Access application, so the declared
  default holds: the basic-auth check in `src/proxy.ts`. (4) **Workers / Snippets:** Workers Routes lists
  none; Snippets are not available on the free plan. (5) **Pay-per-crawl:** AI Crawl Control → Security lists
  each crawler with Block off and no Charge option, so pay-per-crawl is not enabled; Bot Preference Sync
  (managed `robots.txt`) is off on the Overview. The token-gated checks (Z1–Z4) are still the founder's.

## Read

- `specs/040-hosting-railway-cloudflare.md`: `## 0. Index`, then §5.4, §5.5 (the `cloudflare-check` job), §9 AC-15, AC-17, AC-23, AC-24, AC-29, §10 T-15, T-17, T-24, T-25, T-27, §12 step 4
- `scripts/railway-check.ts`, `src/lib/railway.ts`, `tests/contract/railway-check.test.ts` and `tests/fixtures/railway/`: the house pattern for a drift check against a platform API with recorded fixtures; follow it
- `tests/unit/ci-workflow.test.ts` and `.github/workflows/ci.yml`: where the new job is pinned
- `docs/runbooks/railway-cloudflare-setup.md`: where the founder's token steps go
- `docs/codebase-map.md`

**Fence:** `config/cloudflare/`, `scripts/apply-zone-settings.ts` (or the name `package.json`'s two scripts point at), a `src/lib/cloudflare-zone.ts` if logic belongs in `src/lib`, `tests/contract/` and `tests/unit/` files for this script, `tests/fixtures/cloudflare/`, `package.json` (the two scripts only), `.github/workflows/ci.yml` (the new `cloudflare-check` job only) and its cases in `tests/unit/ci-workflow.test.ts`, the runbook (a new Cloudflare token section), this brief, the row and the map. **Not** `src/lib/cache.ts`, `src/lib/env.ts` or `.env.example`: TASK-102 owns the runtime `CLOUDFLARE_*` keys. The script reads its token and zone id from its own environment, as `railway-check.ts` does.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._
- **From `/review 149` round 3 (2026-10-03), CF-1, and spec 040 §14 A5/A6:** E-1 and E-2 are ruled. Apply A6's
  concurrency group (`'nightly'` for `schedule`) with its T-39 case. Add a runbook step where the founder checks
  by eye, in the Cloudflare dashboard, the four `checks: []` rows (Access production, Access/basic-auth staging
  and PR, Workers/Snippets, IP-geo redirects) **and pay-per-crawl**, the one setting no check reads, and record
  the result in this brief. E-3 (the founder's Z1–Z4) stays open.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-30 E-1: AC-17 needs a token scope AC-24 does not list** (to: orchestrator → founder; answer: **ruled 2026-10-03, spec 040 §14 A5**: the token gets the fifth, read-only scope Zone → Bot Management → Read, the allow-list keeps `GET /zones/{zone_id}/bot_management` and nothing else under it, option (b) rejected; the four unreadable rows keep `checks: []` with their gates, plus the founder's by-eye check, runbook Z5, done 2026-10-03 (see Binding). T-25's write-verb case added). Three do-not-enable rows (managed `robots.txt` / Bot Preference Sync, Bot Fight Mode, AI-crawler blocking with Search / Agent / Training on Allow) live in the zone's `bot_management` object. Cloudflare serves `GET /zones/{zone_id}/bot_management` only to a token holding **Bot Management Read** (API reference, "Get Zone Bot Management Config": `Bot Management Write` or `Bot Management Read`). AC-24 says the token holds *exactly* Zone Settings Edit, DNS Edit, Cache Purge and Zone Read. **Built:** the fifth, read-only scope, as the fourth allow-list entry. The runbook's Z1 lists it and says it waits on this ruling. With a four-scope token the check stops on `the token is missing scope Zone → Bot Management → Read`. **Option (b):** keep four scopes. Then delete that allow-list entry and the three rows' `checks`, move the rows to `checkedElsewhere` (T-20's crawler-UA e2e, TASK-101), and AC-17 stops covering them at the zone. Either way, the ruling amends AC-24 or AC-17. **Also for the same ruling:** four rows cannot be read with any zone token, so each is declared `checks: []` with a `checkedElsewhere` gate. Access on production and Access / basic-auth on staging and PR: AC-25 / T-26 and the `preview` job's 401. Workers / Snippets: AC-18 / T-18 body byte-identity. IP-geo redirects: the `fo/no-geo-redirect` lint and TASK-101's rules. Pay-per-crawl is account-level, and account scopes are banned. The question is whether that meets AC-17's "any row".
- **2026-09-30 E-2: the nightly run shares a concurrency group with pushes to `main`** (to: orchestrator; answer: **ruled 2026-10-03, spec 040 §14 A6**: the suggested group, applied in `ci.yml` with its T-39 case). `schedule` runs on `refs/heads/main`, so it lands in `ci-ci-refs/heads/main` with `cancel-in-progress: true`. A nightly run that starts during a push run cancels that push run, so AC-37's gate 1 finds no green run on that SHA until `gh run rerun`. A push during the nightly run cancels the nightly run. The group is pinned by T-39 and is outside this fence, so it is **not changed**. Suggested one-line fix, with its T-39 case: `group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || (github.event_name == 'schedule' && 'nightly') || github.ref }}`. Note too that the nightly run also runs the jobs with no `if:` (the spine, `container`, `lighthouse`). The fan-out jobs skip it. The test pins that set.
- **2026-09-30 E-3: `cloudflare-check` is red until the founder acts, and it is a required check** (to: orchestrator → founder; answer: **done 2026-10-03**: the founder made the token, ran Z1–Z3 against the live zone and added both repository secrets, Z4; see the 2026-10-03 bullet below). The brief says the job fails, never passes, when the secrets are absent. It runs on every `ci:full` PR and every push to `main`, and `scripts/branch-protection.ts` derives it as a required check. So from this PR on, every such run is red until the founder does the runbook's Z1–Z4 ("Cloudflare zone settings"): make the token, run the first apply, add the two secrets. **That includes this PR's own run.** Suggested order: the founder does Z1–Z3 from this branch, then Z4, and then the label is toggled. Adding the job also forced a one-line edit outside the fence: `tests/unit/branch-protection.test.ts`, whose required-check list is derived from `ci.yml`. The founder re-applies `pnpm branch-protection` when ready.
- **2026-09-30: the live half is owed to the founder** (to: orchestrator → founder; answer: **run 2026-10-03**, see the next bullet; one more `cloudflare:apply` is owed after this PR merges). No agent holds a Cloudflare token, so AC-17's "it passes on the current zone" and the first live `cloudflare:apply` are one paste, as TASK-157 records T-44. The founder follows `docs/runbooks/railway-cloudflare-setup.md`, "Cloudflare zone settings", Z1–Z3, and pastes the four commands' output here. **Expected:** the first `cloudflare:check` lists today's differences and exits 1 (or 0). `cloudflare:apply` ends `cloudflare:apply: N changes`. The second apply ends `cloudflare:apply: 0 changes`, exit 0. The last check ends `cloudflare:check: 26 declared values match config/cloudflare/zone-settings.json`, exit 0, with one `mirage · retired by Cloudflare …` line. The fixtures under `tests/fixtures/cloudflare/` follow Cloudflare's documented envelopes, not a live recording. The paste settles three unknowns: whether the deprecated `minify` still answers, whether `mirage` answers 404 or 400, and whether the Free plan's `bot_management` reports `ai_search`, `ai_user` and `ai_training`. An absent field is a named failure (`live absent`), never a pass.
- **2026-10-03: the founder's Z1–Z3 against the live zone `flowersoverseas.com`** (recorded by the orchestrator from the founder's run; the four outputs were not pasted verbatim). (1) The first `cloudflare:check` listed **8 differences**, exit 1. (2) The first `cloudflare:apply` changed all 8, among them `0rtt · "off" → "on"`. (3) The **second apply changed 1 more**, `tls_1_3 · "zrt" → "on"`, so the declaration was not idempotent (AC-23). (4) The last check reported `0rtt · declared "on" · live "off"`. **Cause:** Cloudflare's `tls_1_3` takes `"on"`, `"zrt"` or `"off"`, and `zrt` is TLS 1.3 with 0-RTT (developers.cloudflare.com/ssl/edge-certificates/additional-options/tls-13/: "set the `value` parameter to your desired setting (`"on"`, `"zrt"` or `"off"`)", "`zrt` refers to Zero Round Trip Time Resumption (0-RTT)"); `0rtt` takes `"on"` or `"off"` (API reference, zone settings, `0rtt`). The two are one switch: writing `0rtt: on` turned `tls_1_3` into `zrt`, writing `tls_1_3: on` turned 0-RTT off. The recorded-response mock did not model it. **Fixed** in this PR: `tls_1_3` is declared `"zrt"`, the schema refuses a `tls_1_3`/`0rtt` pair that disagrees, and the mock couples the two, so the contract tests replay the live sequence. Live state after the run: TLS 1.3 on, 0-RTT off; the `cloudflare-check` job reports that until the founder runs `pnpm cloudflare:apply` once more after merge (expected: `changed tls_1_3 · "on" → "zrt"`, `changed 0rtt · "off" → "on"`, `2 changes`, then `0 changes`). Every read answered: the check listed differences rather than stopping on exit 3, so the deprecated `minify` and the retired `mirage` did not end the run. Which eight settings differed is not recorded here; the next CI run of `cloudflare-check` prints the live state line by line. The repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` exist (Z4).

## Progress

- 2026-09-30: declaration, lib, CLI and `package.json` scripts (5b08753); unit and contract tests (786f9e3); the `cloudflare-check` job, the nightly `schedule` and its cases (c7d8a52); runbook Z1–Z4 and the branch-protection pin (98dac08); map; README rows and an explicit JSON schema for the zod-boundary scan (c3fe339). Every AC's subject was mutated and its case went red. Next: rebase, ready, `ci:full`. The row is `blocked` on E-1 to E-3.
- 2026-10-03: rebased on `origin/main`; `tls_1_3` declared `zrt` with the schema's pair rule and the coupled mock, the live sequence replayed (729aa78); A6's concurrency group and its T-39 case (2c0e295); runbook Z5 and the `zrt` line (d8da3a2); E-1 to E-3 resolved above.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#126](https://github.com/itsahmeds/flowers-overseas/pull/126). `config/cloudflare/zone-settings.json` declares §5.4's ten protocol/TLS rows (AC-15's nine, plus Automatic HTTPS Rewrites off) and its fourteen do-not-enable rows, each with its reason: 26 declared values across 18 settings and 8 `bot_management` fields, and four rows as `checkedElsewhere` (E-1). `src/lib/cloudflare-zone.ts` holds the zod schema, a client bound to one zone with a four-entry allow-list (no `/accounts`), a check mode that refuses every verb but `GET` before the transport, a 403 → named scope map, `checkZone`, `applyZone` and the recorded-response mock. `scripts/cloudflare/apply-zone-settings.ts` is the CLI behind `pnpm cloudflare:check` / `cloudflare:apply`: exit 0 match or `skipped: no token`, 1 drift, 2 missing credentials (always with `--require-token`), 3 refused call. The `cloudflare-check` job has `needs: typecheck` and no `if:`. Its scope step checks the zone on push, dispatch and the new nightly `schedule`, and on a pull request with `ci:full` or a change under `config/cloudflare/`. Tests: **contract** 46 (`tests/contract/cloudflare-zone-check.test.ts`: T-15 ×9, T-17 ×16 plus coverage and row pins, T-24 ×6, CLI ×8); **unit** 17 (`tests/unit/cloudflare-zone.test.ts`: T-25) and 11 new or changed in `tests/unit/ci-workflow.test.ts` (T-27 half: job, triggers, `needs`, the nightly set, the step and its secrets, empty secrets fail, and the scope step run under bash for five cases), plus one entry in `tests/unit/branch-protection.test.ts`. Mutations, each red: dropping `brotli` or the Rocket Loader row, a comparator that skips one setting or all of `bot_management`, `--check` issuing one PATCH, the check-mode guard removed, the allow-list admitting `/accounts`, a renamed or unmapped 403 scope, a non-idempotent apply, the retired-setting tolerance applied to every setting, and seven CI-job mutations. No expensive gate run locally; no build slot taken. Owed: the founder's Z1–Z4 paste and the rulings on E-1 to E-3.

```text
gates:cheap · 3054b55eaa3982e57b973812e29d0e1d567552ea · tree clean · base origin/main · 2026-09-30T16:19:16.804Z
typecheck             exit 0 · 2.0 s
lint                  exit 0 · 12.9 s
format:check          exit 0 · 8.4 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 185.4 s · changed 209 + map 0 + always 0 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

`pnpm test:contract`: 5 files, 130 tests passed.

**2026-10-03, the finisher round.** The founder's live run showed the declaration did not settle (`tls_1_3` and `0rtt` are one switch at Cloudflare; see `## Escalations`). `tls_1_3` is now declared `"zrt"`, TLS 1.3 with 0-RTT. That is the smaller fix: one value, no change to how check and apply compare. With both rows declaring the same state, the writes agree in any order. `zoneSettingsSchema` refuses a pair that disagrees, so the declaration cannot drift back. `createRecordedTransport` couples the two writes as the live zone did. Tests: **contract** 49 (+3: the 2026-10-03 sequence replayed on the old declaration, 1 change / 1 change / `0rtt` drift; the fixed declaration, 2 changes / `0 changes` / clean check; settling from TLS 1.3 off; T-15's `tls_1_3` case is now `zrt` vs live `on`). **Unit** `cloudflare-zone.test.ts` 19 (+2: the pair rule; A5's write verbs on `bot_management` refused before the transport). `ci-workflow.test.ts` (+1, one changed: A6's group pinned verbatim, and evaluated to `ci-ci-nightly`, `ci-ci-refs/heads/main` and `ci-ci-107`, three distinct groups). Mutations, each red: the mock without the coupling (the replay case); the old `"on"` declaration with the pair rule removed (3 contract cases and the unit case); the group without its `schedule` branch (the A6 case). Runbook: Z1 states A5's fifth scope as ruled, Z5 is the by-eye check of the four `checks: []` rows and pay-per-crawl, and Z3 explains a one-off `tls_1_3 · declared "zrt"` line. No expensive gate run locally; no build slot taken. Owed after merge: one founder `pnpm cloudflare:apply` to put 0-RTT back on (expected `2 changes`, then `0 changes`).

```text
gates:cheap · 439f23684d8a16bf7e14a1e57ae80dc592f83aa3 · tree clean · base origin/main · 2026-10-03T11:08:08.192Z
typecheck             exit 0 · 2.1 s
lint                  exit 0 · 14.0 s
format:check          exit 0 · 9.5 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 250.8 s · changed 223 + map 0 + always 0 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
