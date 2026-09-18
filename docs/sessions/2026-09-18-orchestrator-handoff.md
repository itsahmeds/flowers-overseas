# Session handoff — 2026-09-18 (orchestrator, day 4, second session)

Read this first, then `TASKS.md` (Log, last ~30 lines), then `docs/sessions/2026-09-17-orchestrator-handoff.md` for the standing machine/process rules (still valid, amended below).

## Where the project stands

| | |
|---|---|
| Phase 0 | **70 / 133** tasks · 10 / 12 specs approved |
| Merged this session | PR 73 (TASK-108 listing primitives), PR 74 (TASK-092 destinations hub + link publishing), PR 75 (TASK-015 schema `0002` i18n + geo) |
| **In flight at close** | **PR 76 (TASK-107 listing view model)** — round 2 pushed (`984fe00`, MERGEABLE), **dispatch `/review 76` round 2 first** (scoped to `bf781ec..984fe00`; round 1 FAIL is on the PR). **PR 77 (TASK-120 honest chrome copy)** — `/review 77` round 1 FAIL on three record/staleness items (rebase + regenerate the 8 baselines TASK-092 also redrew; add the hub to `chrome-honesty.spec.ts` `PAGES`; note or redraw the chrome band in the 40 wireframes) — dispatch a **fresh** frontend fix round from `~/dev/fo-wt-120` (reviewer's carry-forwards sit uncommitted in the brief there). Both worktrees clean otherwise. |
| **Repository is PUBLIC** since ~09:15 UTC | Founder's decision (concern about exposing `plan/`, the corridor corpus and history raised and overruled; "private again once built"). Pre-flip scrub: no secret ever committed; `LICENSE` = all rights reserved, CI-only publication; Grovant workspace email redacted from the tree. **GitHub Actions runs again** on public minutes: PR 77 re-run → `pr-policy` green, `ci`/`lint` 16 steps green. **New rule:** once one full `ci` run is green on a PR, the reviewer reruns only what the diff touches plus what CI cannot do (Lighthouse over the Brotli origin, `darwin` visual baselines). `linux/` baselines are stale — regenerate from a CI artefact (TASK-056 deferral). |
| Imagery | **31 / 31 originals approved** (`reviewedBy: founder`, 07:30Z / 07:45Z) and staged in `.local/imagery/originals/` on the main checkout (never committed); store of record = the founder's Drive folder "Flower Images" (all 31 uploaded). Every file carries a C2PA 2.2 manifest from "OpenAI Media Service API", `softwareAgent gpt-image 2.0`, plus a SynthID watermark. **TASK-080 waits only on the terms record**: the captured OpenAI texts are in `docs/compliance/imagery-generator-terms-texts-2026-09-18.md` (**uncommitted** in the main checkout — commit it with the record); the seven answers are drafted in the 2026-09-18 chat (commercial use allowed; Output owned and assigned, no paid-plan condition; no attribution; not exclusive; consumer training opt-out via privacy portal; C2PA present, stripped by AVIF/WebP re-encode → carry-forward for TASK-080; no restricted use touching flowers/funerals/ads). Founder still to answer: residence country for the OpenAI account, plan, training toggle off?. Then swap `generator`/`generatorModel` on 31 rows + 13 prompt files to `OpenAI ChatGPT` / `gpt-image 2.0`, re-hash, `seed:check`. |
| Rulings recorded today | spec 008 §14 **A2** (provenance note once per card; drawings follow), **A3** (`HubCardViewSchema` + `hubItems`; TASK-115 reads both arrays), **A4** (`async` = purity, not call shape); spec 007 §14 **A7** (sixth optional `operational` indexability term; absent ≠ satisfied); `/review 74`: sitemap row = TASK-094 carry-forward, footer links the hub only; `/review 75`: `fx_rate.source` exemption accepted, `region` columns accepted. |
| Data flips on `main` | 26 then 5 media approvals broke `tests/e2e/dev-components.spec.ts` and one visual baseline on `main` — repaired in `4680ea0`. **Rule:** a data flip on `main` runs the e2e/visual suites that read the dataset, not only the seed suites. |

## Founder decisions pending
1. **PR 77 copy** — reviewer recommends approving as shipped: "Delivery dates open when we confirm our first florist" / short "Delivery dates are not open yet"; "Our selection" (id `our-selection`) replacing "Best sellers".
2. **Imagery terms** — the three answers above, then "file it".
3. **Cloud** for hosting/backend-only tasks — still unanswered (would open a third/fourth slot for 098/100/122/123).
4. **TASK-106 inputs** — `de`/`pl` slugs + curation order.
5. GA4 = "later" (recorded).

## Orchestrator rulings owed
- **spec 002 §14** review-triple on `country_translation`/`city_translation` (§7 vs §5.1) — before TASK-016 dispatch.
- Spec 004/008: home "Most sent this week" is an unevidenced ranking claim (nit from `/review 77`) — rule or hand to TASK-095/110.

## Dispatch order (two local slots; one build/Playwright/Lighthouse at a time)
1. `/review 76` round 2 → merge → TASK-107 `done` → TASK-109/110/111/112 open (shop pages).
2. TASK-120 fix round → `/review 77` round 2 → merge → TASK-095 unblocked.
3. TASK-093 ∥ TASK-094 (unblocked by #74) · TASK-016 (after the §14 ruling) · TASK-080 (after the terms record) · 122 ∥ 123 · 119 · 098/100 when the founder pastes the variables/token.

## Lessons this session
- The orchestrator's own PR comment is (correctly) blocked as self-approval; docs-only round 3 still goes through a small independent reviewer (~3 min). Never write a verdict into the log before the gate returns.
- A failed `git commit` (commitlint) makes lint-staged restore the working tree — re-check `TASKS.md` edits after any hook failure; commit type `data` does not exist (use `feat(seed)`/`test`/`docs`).
- `zsh` does not word-split `$var` in `for`/`set --`; use arrays or `${pair%%|*}`.
- `--update-snapshots` rewrites passing baselines byte-wise — restore the ones that were not failing before committing.
- Playwright has no `webServer`: start `pnpm start -p <port>` yourself; agents use 3200/3201 with matching `NEXT_PUBLIC_SITE_URL`; casing probe (`/GERMANY`) poisons the lowercase prerender for the server's life — rebuild before trusting a following suite.
- Worktrees need `mkdir -p .claude/state` before `task.sh set`; an agent's "pointer cleared" can clear the **main** repo pointer that a concurrent agent relies on — re-set it.
- `openai.com` returns 403 to plain fetchers; Firecrawl scrape works.
