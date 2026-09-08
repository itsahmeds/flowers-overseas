# Runbook — branch protection on `main`

Owner: founder. Spec: `specs/001-repo-dev-os-bootstrap.md` §2 "Branch protection", §12 note (a),
AC-21 / T-22. Verifier: `pnpm branch-protection` (`scripts/branch-protection.ts`).

Branch protection is a repository *setting*, not code. An implementer cannot apply it (the CI
token has no permission to, and nothing in a PR should be able to weaken the gate that reviews the
PR). This runbook holds the exact commands, and the repository holds a verifier so "we configured
it once" can be checked rather than remembered.

## 0. Current state — blocked on the account plan

**Status: pending: GitHub Pro upgrade vs recorded deviation.** Founder decision, raised
2026-09-08 on TASK-012; option 1 (upgrade) is the recommendation. Until it is taken, `main` has
no enforced protection and the `/review` verdict recorded in the PR and in `TASKS.md` is the only
merge gate. The merge-method half (§3) needs no plan change and should be applied now.

Probed 2026-09-07 against `itsahmeds/flowers-overseas` (private):

```
$ gh api repos/itsahmeds/flowers-overseas/branches/main/protection
{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.",
 "documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection",
 "status":"403"}
```

403, not 404. A 404 with `Branch not protected` would mean the feature is available and unset; the
403 means **GitHub Free does not offer branch protection or rulesets on a private repository**, so
AC-21 cannot be satisfied at all until the plan changes. `pnpm branch-protection` prints this
distinction and exits non-zero: an unenforced gate must not read as a pass.

Three options, in the order they should be considered:

1. **Upgrade the account to GitHub Pro** (about $4/month). Recommended: the only option that keeps
   the repository private (spec 001 §13 Q1) *and* enforces the gate. After upgrading, go to §2.
2. **Make the repository public.** Rejected — §13 Q1 decided private.
3. **Accept unenforced protection as a recorded deviation.** Every check in `ci.yml` still runs on
   every pull request and every failure is visible; what is missing is the mechanism that stops a
   merge past a red one, and the linear-history and squash-only guarantees. The gate becomes
   procedural: the `/review` verdict recorded in the PR body and in `TASKS.md`. Recorded on
   TASK-011 in `TASKS.md`; TASK-012 carries the spec correction.

The merge-method half of AC-21 (§3 below) **does not** need Pro and should be applied either way.

## 1. Prerequisites

- GitHub Pro (or a public repository) on `itsahmeds` — see §0.
- `gh` authenticated as the repository owner: `gh auth status`.
- **At least one green `ci` run on the pull request that added the jobs.** Required-status-check
  names can only be selected after a run has registered them (spec 001 §12 note (a)), so
  protection is configured after the first green run and before merging the next PR. Adding a
  context that has never run is accepted by the API and then blocks every PR forever, waiting for
  a check that nothing produces.

## 2. Apply

```bash
pnpm branch-protection --print-commands   # read it, then run what it prints
```

The command prints two things: a `gh api -X PUT …/branches/main/protection` call with a JSON body,
and a `gh repo edit` call for the merge settings. The required-check list inside the JSON is
**read out of `.github/workflows/ci.yml` and `.github/workflows/pr-policy.yml` at print time**, so
it cannot drift from the jobs that exist. Never hand-edit that list: add the job, re-run
`--print-commands`, re-apply.

What the body asserts, and why:

| Setting | Value | Why |
|---|---|---|
| `required_status_checks.contexts` | every `ci.yml` job + `pr-policy`, minus `lighthouse` | AC-21. Includes the pull-request-only checks (`preview`, `e2e`, `visual`, `a11y`, `commitlint`, `pr-policy`): a required check that a push to `main` can never satisfy is exactly what makes the pull request the only way in. |
| `required_status_checks.strict` | `false` | "Require branches to be up to date" serialises the merge queue. With one person merging it buys nothing; turn it on when there are two. |
| `required_linear_history` | `true` | Spec §2. With squash-only merges, history stays a straight line and `git revert` of one commit undoes one task (§12 "Rollback plan"). |
| `allow_force_pushes` | `false` | Spec §2. |
| `allow_deletions` | `false` | Nobody deletes `main`. |
| `required_approving_review_count` | `0` | **Deviation — see §4.** |
| `require_code_owner_reviews` | `false` | Same deviation. |
| `enforce_admins` | `false` | The founder must be able to unblock a repository that a bad required-check name has deadlocked. The verifier does not assert this either way; it is an escape hatch, not a gate. |
| `required_conversation_resolution` | `true` | A reviewer's unresolved comment should not be merged past. Asserted by `--verify`. |
| `dismiss_stale_reviews` | `true` | A review of an older head is not a review of this one. With the review count at 0 (§5) this and the row above are what is left of the human half of the gate, so `--verify` asserts both. |
| `delete_branch_on_merge` (repository setting, §3) | `true` | A merged `task/TASK-NNN-*` branch should not linger: `pr-policy` reads the task id out of the branch name, so stale branches read as work in flight. Asserted by `--verify`. |

## 3. Merge method (no Pro needed)

The second command `--print-commands` prints:

```bash
gh repo edit itsahmeds/flowers-overseas \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --squash-merge-commit-title=PR_TITLE \
  --squash-merge-commit-message=COMMIT_MESSAGES \
  --delete-branch-on-merge
```

`--squash-merge-commit-title=PR_TITLE` is the AC-21 clause "squash merge with PR title as the
commit subject". It matters beyond tidiness: the PR title is the one string `pr-policy` has already
validated to carry `(TASK-NNN)`, so making it the commit subject is what keeps `main`'s history
traceable to `TASKS.md`, and what keeps commitlint's conventional-commit shape on `main`.

State at the last probe: `allow_merge_commit: true`, `allow_rebase_merge: true`,
`squash_merge_commit_title: "COMMIT_OR_PR_TITLE"`, `delete_branch_on_merge: false` — i.e. **not yet
applied**. This is a founder action with no plan dependency; do it now.

## 4. The `lighthouse` exclusion, and when to lift it

`lighthouse` is deliberately **not** a required check. Spec 001 §13 Q4 makes it informational until
spec 004 ships the design system, and the job carries `continue-on-error: true`. That flag spares
the *workflow's* conclusion, not the job's own status check: a failed `lighthouse` still reports as
a failed check, so requiring it would block every merge for exactly the reason the spec says not to
block. In spec 001 it fails on every run — `/` paints nothing, so Lighthouse aborts with `NO_FCP`
before a metric exists.

`scripts/branch-protection.ts` derives the exclusion from the workflow rather than hard-coding the
name: it drops any job with `continue-on-error: true`. **When spec 004 removes that flag,
`lighthouse` becomes a required check automatically** — `pnpm branch-protection --verify` turns red
until protection is re-applied, and re-applying is one `--print-commands` away. Nothing in this
runbook needs editing then.

## 5. The one-approving-review problem (deviation from spec §2)

Spec 001 §2 asks for "one approving review". GitHub does not let the author of a pull request
approve it. With one human on the project and `CODEOWNERS = * @itsahmeds`, setting
`required_approving_review_count: 1` makes **every** pull request unmergeable — including the one
that would add a second contributor. `enforce_admins: false` leaves a bypass, but a gate whose
normal operation is "admin overrides it" is theatre: it trains the one person who could enforce it
to click past it.

**Decision, recorded on TASK-011 and queued for the spec text on TASK-012:**

- `required_approving_review_count: 0`, `require_code_owner_reviews: false`;
- the review gate is the `/review` verdict, which `CLAUDE.md`'s definition of done already requires
  to be recorded in the PR body (`## Review` in the PR template) and in the `TASKS.md` row;
- `dismiss_stale_reviews: true` and `required_conversation_resolution: true` stay on, so the human
  signals that do exist are not stale;
- `CODEOWNERS` still routes the review *request*, which is what makes the PR appear in the owner's
  queue.

Raise it to 1 the day a second person can approve. `pnpm branch-protection --verify` asserts the
recorded value and names the deviation in its failure message, so flipping it in the GitHub UI
without updating `REQUIRED_APPROVING_REVIEW_COUNT` turns the verifier red rather than passing
silently.

## 6. Verify

```bash
pnpm branch-protection            # --verify is the default
```

Exit 0 only when every AC-21 assertion holds. It prints the derived required-check list first, so
the output doubles as the answer to "what should be required?". Failure modes, and what each means:

| Output | Meaning | Action |
|---|---|---|
| `UNAVAILABLE ON THIS PLAN` | 403 — GitHub Free, private repository | §0: upgrade, or record the deviation |
| `NOT CONFIGURED` | 404 `Branch not protected` — available, unset | §2 |
| `required status checks: missing` | a job exists that is not required | re-run §2 after a green run |
| `required status checks: not produced by any workflow` | a required context nothing reports — every PR waits forever | re-run §2; this is what removing a job without re-applying protection looks like |
| `repository setting allow_merge_commit` etc. | merge method wrong | §3 |
| `required_approving_review_count` | someone changed the review count | §5 |
| `dismiss_stale_reviews` / `required_conversation_resolution` | a review signal was weakened in the UI | re-apply §2 |
| `repository setting delete_branch_on_merge` | merged branches are being kept | §3 |

Run it after any change to `ci.yml`'s job set, and at every `/launch` (`plan/12` §5).
