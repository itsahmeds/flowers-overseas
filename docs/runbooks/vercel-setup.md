# Runbook — Vercel project setup (spec 001 AC-29, TASK-007)

> **Superseded (2026-09-16, ADR-0018).** Hosting moves to Railway behind Cloudflare. This runbook is kept only for the cold Vercel fallback and is replaced by `docs/runbooks/railway-cloudflare-setup.md` (spec 040, TASK-104). Set no new production variables in Vercel; PR #62's variable gate is now the Railway variable set (spec 040, TASK-098).


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
| Plan | Hobby (as set up 2026-09-07). Vercel Authentication on previews **is** available on Hobby; Password Protection is not — see step 8 |

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
  public). This is available on the Hobby plan and satisfies Q9's default for previews.
- What a protected preview actually answers: **not** `401`/`403` to a plain request. Vercel
  Authentication replies **`HTTP 302` with `location: https://vercel.com/sso-api?url=…`** and a
  `_vercel_sso_nonce` cookie (a browser follows it to the Vercel login screen). AC-29 and the
  `preview` CI job therefore accept 401, 403, **or** a redirect whose location is
  `https://vercel.com/sso-api…`; a `200`, or a redirect to anywhere else, fails.
- **Password Protection**: not available on Hobby, and not configured in 001 anyway. Q9's shared
  password is for a `staging` environment that does not exist yet (no `staging` branch in 001); add
  it in the spec that introduces florist-facing staging — that is the point at which the plan may
  have to move to Pro.

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

- `ALLOW_PLACEHOLDER_ENV=true` is required on **both** `preview` and `production` in 001. The
  schema rejects the committed placeholders in every deployed environment, preview included, so the
  loop above must be followed by:

  ```bash
  printf %s 'true' | vercel env add ALLOW_PLACEHOLDER_ENV preview \
    --scope ahmedsheikh2654-6252s-projects --force
  ```

  With that set, previews may keep the placeholder `NEXT_PUBLIC_SITE_URL`
  (`http://localhost:3000`); otherwise the schema's `https` origin rule fails the preview build.
  Spec 002 deletes this variable from both environments.
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
curl -sI "$PREVIEW_URL/api/health" | grep -iE '^(HTTP|location)'
# expect either HTTP 401/403, or HTTP 302 + `location: https://vercel.com/sso-api?url=...`
# (the redirect is what Vercel Authentication actually sends). A 200 means previews are public.

# 3. With the bypass: 200, fra1, noindex
curl -sI "$PREVIEW_URL/api/health" \
  -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
  -H "x-vercel-set-bypass-cookie: false" \
  | grep -iE '^(HTTP|x-vercel-id|x-robots-tag)'
# expect: 200 · X-Robots-Tag: noindex...
# x-vercel-id is `<cdn-node>::<function-region>::<id>`: the first segment is the edge node that
# took your request (e.g. `bom1`), so check that `fra1` is *one of* the `::` segments, not the
# prefix.

# 4. Open the preview URL in a fresh browser profile → Vercel Authentication prompt
```

Then re-run CI on the TASK-007 PR (`gh pr checks --watch`, or push an empty commit): the `preview`
job performs the same three assertions automatically and writes them to the step summary. Paste the
output of steps 2–4 into the PR as the T-30 record and move the task out of `blocked`.

## 8. Plan notes (Hobby vs Pro)

Verified on the live project 2026-09-07: on **Hobby**, Deployment Protection → **Vercel
Authentication** is available and Standard Protection can be enabled, so AC-29 and Q9's preview
default are satisfied without upgrading. **Password Protection** is Pro-only; it is not used in 001
(see step 4).

ADR-0012 still prices Vercel Pro as the hosting line item — the trigger to upgrade is the
florist-facing staging environment (Q9's shared password) or Pro-only limits, not AC-29.

If preview protection is ever unavailable, the only acceptable route is a recorded deviation:
previews stay public but every response already carries `X-Robots-Tag: noindex` (AC-15) and Phase 0
contains no real data. Record it in the PR and in `docs/decisions-log.md`, open a follow-up before
spec 002 puts real data anywhere, and leave the `preview` CI assertion in place — it is the
tripwire.

Nothing in the repository changes in either case.

## Rollback

`rm -rf .vercel`, disconnect the Git integration in the dashboard, delete the project. Nothing is
stateful: no data, no migrations (spec 001 §12).
