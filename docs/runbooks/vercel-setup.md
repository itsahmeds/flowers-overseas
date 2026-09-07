# Runbook — Vercel project setup (spec 001 AC-29, TASK-007)

**Owner:** founder (account-level actions; the repository half is merged with TASK-007).
**When:** once, before the `preview` CI job can pass on any PR.
**Time:** ~20 minutes.
**Outcome:** the GitHub repo `flowers-overseas` deploys previews on every PR and production from
`main`, functions run in `fra1`, previews require authentication, and CI can bypass that
authentication with a secret. After step 7, re-run CI on the open TASK-007 PR: the `preview` job
turns green and the reviewer records T-30.

Facts this runbook assumes (spec 001 §5 "Hosting", §13 Q1/Q9, ADR-0012):

| Thing | Value |
| --- | --- |
| Vercel scope (team/account slug) | `ahmedsheikh2654-6252s-projects` |
| Vercel project name | `flowers-overseas` |
| GitHub repo | private `flowers-overseas` under the founder's personal account |
| Production branch | `main` |
| Function region | `fra1` (committed in `vercel.json`; do not set it in the dashboard) |
| Node version | 24 (matches `.node-version` / `engines.node`) |
| Preview protection | Vercel Authentication (Q9) |
| Plan | Pro (ADR-0012); see step 8 if the account is on Hobby |

Prerequisites: `vercel` CLI (`pnpm dlx vercel@latest --version`), logged in (`vercel login`),
`gh` authenticated with access to the repo, a clean checkout of `main`.

---

## 1. Link the repository to the Vercel project

From the repository root:

```bash
vercel link --yes --project flowers-overseas --scope ahmedsheikh2654-6252s-projects
```

Creates the project if it does not exist and writes `.vercel/` (git-ignored, AC-32). Verify:

```bash
vercel project ls --scope ahmedsheikh2654-6252s-projects
```

The framework preset and the `fra1` region come from the committed `vercel.json`
(`framework: nextjs`, `regions: ["fra1"]`) — nothing to click.

## 2. Connect the Git integration

```bash
vercel git connect --scope ahmedsheikh2654-6252s-projects
```

Confirm the detected GitHub remote. Then in the dashboard
(Project → Settings → Git), check:

- **Production Branch** = `main`.
- **Preview Deployments**: enabled for all branches (default) — the `preview` CI job waits for the
  GitHub Deployment that this integration creates for the PR head SHA.
- Deploy hooks: none needed.

## 3. Build and runtime settings

Project → Settings → Build & Deployment:

- **Framework Preset**: Next.js (already implied by `vercel.json`).
- **Node.js Version**: **24** — must match `.node-version`; a mismatch is the most common cause of
  a preview that builds locally and fails on Vercel.
- **Install Command**: leave the default (Vercel detects pnpm from `packageManager`).
- **Automatically expose System Environment Variables**: **on**. This is what supplies `VERCEL_ENV`
  and `VERCEL_GIT_COMMIT_SHA` (read by `src/lib/env.schema.ts` and by the Sentry release) *and*
  their framework-prefixed mirrors `NEXT_PUBLIC_VERCEL_ENV` and
  `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, which are the only way the browser bundle can know the
  release. All four stay blank in `.env.example` and must **not** be created by hand in step 6.

## 4. Deployment Protection on previews (Q9)

Project → Settings → Deployment Protection:

- **Vercel Authentication**: **Standard Protection** (all preview deployments; production stays
  public). A browser without a Vercel session then gets `401`/`403` on any preview URL, which is
  what AC-29 and the `preview` CI job assert.
- **Password Protection**: not configured in 001. Q9's shared password is for a `staging`
  environment that does not exist yet (no `staging` branch in 001); add it in the spec that
  introduces florist-facing staging.

## 5. Protection Bypass for Automation + GitHub secret

Same settings page → **Protection Bypass for Automation** → generate the secret and copy it.
Then, from the repository root (never paste the value into a shell history-visible command or a
workflow file):

```bash
# reads the value from a prompt, not from argv
gh secret set VERCEL_AUTOMATION_BYPASS_SECRET
```

CI sends it as the `x-vercel-protection-bypass` header (see the `preview` job in
`.github/workflows/ci.yml`). It is also the secret Playwright and Lighthouse will use from
TASK-008 onwards.

## 6. Environment variables for `preview` and `production`

The key set is exactly the keys of `.env.example`; `pnpm env:check` guarantees the file and the zod
schema agree (AC-11). In 001 the values are the committed placeholders — the real Supabase, Sentry
and cron values arrive with spec 002.

Create them with a loop over `.env.example`, feeding each value on stdin so no value is echoed or
stored in shell history:

```bash
# from the repository root, on a clean checkout of main
set -euo pipefail
for target in preview production; do
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    # Platform-injected keys must stay unset: Vercel provides them itself (step 3).
    case "$key" in VERCEL_ENV|VERCEL_GIT_COMMIT_SHA|NEXT_PUBLIC_VERCEL_ENV|NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA) continue ;; esac
    # Blank in .env.example means "unset unless you have a real value" (Sentry DSNs, tokens).
    [ -n "$value" ] || continue
    printf %s "$value" | vercel env add "$key" "$target" \
      --scope ahmedsheikh2654-6252s-projects --force
  done < .env.example
done
```

Then set the two values that are not literal copies of `.env.example`:

```bash
# Public site origin: the production alias (https, per the schema's production rule)
printf %s 'https://flowers-overseas.vercel.app' | vercel env add NEXT_PUBLIC_SITE_URL production \
  --scope ahmedsheikh2654-6252s-projects --force

# 001-only escape hatch: production runs on the .env.example placeholders until spec 002 provides
# the real Supabase values. Only the exact string "true" is accepted; assertEnv() logs one warn
# line when it is honoured. Spec 002 deletes this variable.
printf %s 'true' | vercel env add ALLOW_PLACEHOLDER_ENV production \
  --scope ahmedsheikh2654-6252s-projects --force
```

Notes:

- Previews may keep the placeholder `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000`) only if you
  also set `ALLOW_PLACEHOLDER_ENV=true` for `preview`; the schema requires an `https` origin in
  both deployed environments, so the simpler route is to set the preview origin to the production
  alias as well. Either way the build must succeed — check the first deployment's log.
- Verify the result without printing values: `vercel env ls --scope ahmedsheikh2654-6252s-projects`.
  `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` will not appear there — it is injected at build time by
  step 3's toggle. Confirm it on a deployed preview instead: the Sentry release is set only when
  it is present, and the build log lists the exposed system variables.
- If a value needs changing later, `vercel env rm KEY target` then add it again.

## 7. Verify (T-30 evidence for the PR)

```bash
# 1. Pick the preview URL of the open PR (the GitHub Deployment the integration created)
gh pr checks           # the `preview` CI job prints the URL in its step summary
PREVIEW_URL=https://<deployment>.vercel.app

# 2. Without the bypass: Deployment Protection must refuse
curl -sI "$PREVIEW_URL/api/health" | head -n1        # expect HTTP/2 401 or 403

# 3. With the bypass: 200, fra1, noindex
curl -sI "$PREVIEW_URL/api/health" \
  -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
  -H "x-vercel-set-bypass-cookie: false" \
  | grep -iE '^(HTTP|x-vercel-id|x-robots-tag)'
# expect: 200 · x-vercel-id starting with `fra1` · X-Robots-Tag: noindex...

# 4. Open the preview URL in a fresh browser profile → Vercel Authentication prompt
```

Then re-run CI on the TASK-007 PR (`gh pr checks --watch`, or push an empty commit): the `preview`
job performs the same three assertions automatically and writes them to the step summary. Paste the
output of steps 2–4 into the PR as the T-30 record and move the task out of `blocked`.

## 8. If the account is not on Pro

Vercel Authentication **and** Password Protection on previews are paid features; on Hobby there is
no way to protect a preview deployment. Two options, both recorded:

1. **Upgrade to Pro** (what ADR-0012 assumes: it prices Vercel Pro as the hosting line item). Then
   restart at step 4.
2. **Accept unprotected previews as a recorded deviation**: previews stay public but every response
   already carries `X-Robots-Tag: noindex` (AC-15) and Phase 0 contains no real data at all. In this
   case AC-29 cannot be satisfied as written — record the deviation in the PR and in
   `docs/decisions-log.md`, open a follow-up task to revisit before the first real customer data
   exists (spec 002), and note that the `preview` CI job will keep failing until previews are
   protected (do not delete the assertion; that is the tripwire).

Nothing in the repository changes in either case.

## Rollback

`rm -rf .vercel`, disconnect the Git integration in the dashboard, delete the project. Nothing is
stateful: no data, no migrations (spec 001 §12).
