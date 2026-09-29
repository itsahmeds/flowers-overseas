# TASK-157 — Launch texts (`launch.md`, `/launch`, work-order Role: launch) and the founder-action runbook F1–F6 with click-by-click Railway steps

Row: `TASKS.md` → TASK-157. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-157`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-37, AC-41, AC-42 (T-41, T-44). Production launch is two visits: gates → `RELEASE: READY | HALTED` naming the SHA; the orchestrator promotes `release` to that SHA; the watch visit reports `PROMOTED | ROLLED BACK`. The release note is committed on `HALTED` too. The founder is Railway Admin and does F1–F4; F5 is the token scope; F6 is the deletion-only ruleset on `release`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- .claude/agents/launch.md
- .claude/skills/launch/SKILL.md
- .claude/templates/work-order.md Role: launch
- docs/runbooks/railway-cloudflare-setup.md

## Carry-forwards

- **From `/review 104` (2026-09-28):** your test rows are **T-41** and **T-44** (spec 040's new AC-42 row, added after `/break 104` round 1). You depend on TASK-152 (`framework-text.test.ts`) and TASK-153 (`work-order.md`) as well as TASK-156. T-42, the first release, is a `/launch`, not this task.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` round 3 (2026-09-28):** you wait for TASK-154 too, because it adds `maxTurns` to every `.claude/agents/*.md` frontmatter, `launch.md` included, and you edit `launch.md`. Rebase on it and keep its frontmatter.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-29: T-44's live part is owed to the founder** (to: orchestrator → founder; answer: **Founder, 2026-09-29: merge the texts and runbook now; T-44's paste is owed by the founder; the task closes on the paste.** TASK-157 stays `in_review`, not `done`, until the output after F1–F3, and again after F4, is pasted here). It needs the founder's clicks (F1–F4, F6) and a Railway workspace token (F5); no agent has either. The founder follows `docs/runbooks/railway-cloudflare-setup.md` "Release branch" and pastes the output of `pnpm railway:check; echo "exit $?"` (with `RAILWAY_ENVIRONMENT_ID` unset) here, after F1–F3 and again after F4. **Expected while production has no `web`** (TASK-104 creates it): F1's trigger step not applicable, and exit 1 with exactly this on stdout, and no other line:
  ```text
  production · web · triggers on none, declared release
  production · worker · triggers on none, declared release
  ```
  (the `worker` line only if production has no `worker` service at all; a sourceless `worker` is "not checked" and not printed on a red run), and stderr beginning `railway:check: EXPECTED RED until TASK-104`. The exit-0 run moves to TASK-104's brief, after `web` exists on `release` and before the DNS change (AC-43).
- **2026-09-29: TASK-155's open escalation, the staging-`worker` line** (to: orchestrator → founder; answer: **founder, 2026-09-29: the small spec fix**). If staging has no `worker` when the founder runs the check (TASK-103 creates it), the run also prints `staging · worker · triggers on none, declared main`, and stderr says `railway:check failed` with no label. Under AC-42 as written, T-44 would then fail. The founder chose the AC-42 amendment. A spec 040 amendment (drafted by the spec writer) makes a declared staging service that does not exist yet an expected red, like the missing production `web`. A follow-up task widens `onlyAbsentProductionServices` in `src/lib/railway.ts` to label it. The runbook now says that line is expected until TASK-103, and tells the founder to paste it as it is. It also says plainly that stderr shows `railway:check failed` with no EXPECTED RED label until the follow-up lands. This task did not amend the spec.
- **2026-09-29: `(release at none)`** (to: orchestrator; answer: **AC-36**, closed by `/review 121` round 1). AC-37 fixes READY as `(release at <sha>)` and says nothing about the first launch, when `release` does not exist yet. The answer is AC-36: "`--create` is accepted only when the remote `release` does not exist yet. It is how `release` is first created when production has never deployed." So the texts write `(release at none)`, and `/launch` step 4 then runs `release:promote --create --sha <sha>`. `scripts/release.ts` refuses `--create` on an existing `release`. `src/lib/release.ts`'s `READY_LINE` does not match `none`, and that does no harm: before the first release there is nothing to roll back to.
- **2026-09-29: the §6 token type** (to: orchestrator; answer: `open`, text corrected). Runbook §6 told the founder to use a **project** token. Railway's public-API guide says a project token covers one environment and goes in a `Project-Access-Token` header, while `railway:check` and `release:*` send `Authorization: Bearer`. §6 and F5 now say a **workspace** token for Grovant's workspace. F5's check shows whether it works.
- **2026-09-29: spec text that AC-41 reads as corrected** (to: orchestrator; answer: `open`, spec not edited). §4's founder story ("I deploy by merging to `main`") and §5.3 "Deploys and rollback" (`main` → `production`) still read the old way. AC-41 says they "read as corrected here", so nothing is owed unless the spec writer wants the text itself changed.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: T-41's seven framework-text cases written in `tests/unit/framework-text.test.ts`, red on the current texts (8 failed / 22 passed, the eighth being the unmodified-scratch case). Next: rewrite `launch.md`, `/launch` and the work order's Role: launch.
- 2026-09-29: the three launch texts rewritten (84af863); the seven cases green, and 15 revert cases added, each reverting one sentence in a scratch copy and asserting the one problem it causes (45/45). A `FRAMEWORK_ROOT` scratch run with the `lighthouse` sentence deleted turns the gate-1 case red. Next: the runbook's "Release branch" section.
- 2026-09-29: runbook "Release branch" section (23763f8): the F1–F6 table with a check for each, click-by-click steps for F1–F5, and GitHub clicks for F6. What the check prints today, and the staging-`worker` case. §6's token corrected to a workspace token. Escalations recorded. Next: `gates:cheap`, rebase, ready, `ci:full`.
- 2026-09-29: round 1 (`/review 121` FAIL, `/break 121` HOLES on 854527d). Cases added for H1–H5 and the reviewer's two nits, 61/61 green, each red by revert on a scratch copy. A `FRAMEWORK_ROOT` run with five mutations turns five tree cases red. The runbook's F5 proof and table row now expect exactly "What the checks print today". F1's comment and F3 step 3 fixed. The staging-`worker` paragraph is unchanged: it waits for the founder.
- 2026-09-29: the founder's two answers recorded (staging `worker`: the spec fix; merge now, the task closes on T-44's paste). The runbook's staging-`worker` paragraph is rewritten to match.

## Result

PR [#121](https://github.com/itsahmeds/flowers-overseas/pull/121). The three launch texts (`.claude/agents/launch.md`, `.claude/skills/launch/SKILL.md`, the work order's Role: launch) now carry AC-41 and AC-37: gate 1 by `head_sha` read job by job, four `preview`-chain jobs `skipped` and `lighthouse` `success`; gates 4–6 on staging at the named SHA; staging `RELEASE: VERIFIED | HALTED`; step 4 `release:promote` with the READY SHAs; the note committed after every visit, `HALTED` included; the agent redeploys the previous image but never moves `release`; `main` held from dispatch until visit 1 reports. `maxTurns: 200` kept. Tests (unit, `tests/unit/framework-text.test.ts`, T-41): 9 cases on the tree plus 29 one-sentence revert cases on scratch copies, 61/61 green; one `FRAMEWORK_ROOT` scratch run shown red. `docs/runbooks/railway-cloudflare-setup.md` gains "Release branch" (F1–F6, each with its check; §6's token corrected to a workspace token). T-44's live run is owed to the founder (see `## Escalations`); the exit-0 run is TASK-104's. No expensive gate run locally. `gates:cheap` PASS.
