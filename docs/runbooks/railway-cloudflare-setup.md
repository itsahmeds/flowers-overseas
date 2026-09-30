# Runbook — Railway + Cloudflare setup (spec 040, ADR-0018)

> **Status: part 1 of 2.** TASK-098 (this task) writes the **staging `web` service** half: the
> container, `config/railway.json`, the variable set, the health endpoint and the access wall.
> The Cloudflare half (zone settings, DNS, cache rules, rate limit) is TASK-100/TASK-101, and the
> production cutover plus the supersession of `docs/runbooks/vercel-setup.md` is TASK-104.
> Until then `vercel-setup.md` stays in place as the cold fallback's runbook (ADR-0018).

**Owner:** founder — every step below is a click or a paste in a dashboard the agents have no
credential for, by ruling (2026-09-16): variable values and `STAGING_BASIC_AUTH` are pasted by the
founder, never by an agent and never into a file in this repository.
**When:** once, after the PR of TASK-098 merges. `APP_ENV` (TASK-097) is already on `main`, which
ADR-0018 makes the precondition for any Railway deploy.
**Time:** ~30 minutes.
**Outcome:** `staging` runs the committed image in Amsterdam, single replica, answers
`/api/health` with `status`/`commit`/`appEnv`/`region`, is behind a 401 wall for everything else,
and reports to Sentry as `environment: staging` with the commit SHA as the release.

Facts this runbook assumes:

| Thing | Value |
| --- | --- |
| Railway project | `flowers-overseas`, in **Grovant's workspace** (founder is a member; 2026-09-16 ruling, reversing spec 040 §13 Q2) |
| Environments | `production`, `staging` (both already exist) |
| Region | `europe-west4` (Amsterdam) — ADR-0018 |
| Replicas on `web` | **1, pinned.** A second replica serves a second, divergent ISR cache; raising it needs the shared cache handler of §13 Q4 |
| Build | the committed `Dockerfile` (Node 24, non-root), config-as-code `config/railway.json` |
| Healthcheck | `GET /api/health`, the one path exempt from the 401 wall |
| Database | Neon **staging** branch, seeded |
| Node | 24, from the image — nothing to select in the dashboard |

---

## 1. Create the `web` service on `staging`

Railway dashboard → project `flowers-overseas` → environment **`staging`** → **New** → **GitHub
Repo** → `flowers-overseas`, branch `main`.

Then Service → **Settings**:

1. **Service name**: `web` (exactly — `pnpm railway:check` looks the service up by this name).
2. **Config as code**: path `config/railway.json`. Save. The region, replica count, healthcheck
   path, restart policy, builder and start command all come from that file; do not set them by
   hand in the dashboard, or the next `railway:check` will report drift against the repository.
3. **Region**: confirm it shows `europe-west4 (Amsterdam)` after the first deploy.
4. **Public networking**: generate the Railway domain for now (`…up.railway.app`). The
   `staging.flowersoverseas.com` record is added with the Cloudflare half (TASK-100/101).
5. **Resources**: 1 GB memory / 1 vCPU (sharp OOMs at 512 MB — spec 040 §5.3).

Do **not** create the `worker` service here: it is TASK-103's seat, at zero replicas.

## 2. Paste the variables (`staging`)

Service → **Variables** → **Raw Editor** and paste the block below in one go, filling each value.
The key set is exactly the 28 keys of `.env.example`; `pnpm env:check` keeps that file and the zod
schemas in step, and `pnpm railway:check --env staging` (step 6) verifies the live key set — key
**names** only, never a value.

```dotenv
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_SITE_URL=https://<the Railway domain from step 1, https, no trailing slash>
DATABASE_URL=<Neon → branch `staging` → pooled connection string>
DATABASE_URL_UNPOOLED=<the same dialog, direct connection string>
INTERNAL_CRON_SECRET=<openssl rand -hex 32>
LOG_LEVEL=info
CSP_REPORT_ONLY=true
ENABLE_PSEUDO_LOCALES=false
ENABLE_DEV_UI=false
R2_ACCOUNT_ID=<Cloudflare → R2 → account details>
R2_S3_ENDPOINT=<https://<account-id>.eu.r2.cloudflarestorage.com>
R2_BUCKET=flowersoverseas-media
R2_BACKUPS_BUCKET=flowersoverseas-backups
R2_ACCESS_KEY_ID=<scoped R2 token>
R2_SECRET_ACCESS_KEY=<scoped R2 token, shown once>
R2_PUBLIC_BASE_URL=<R2 → media bucket → public access URL, no trailing slash>
NEON_API_KEY=
NEON_PROJECT_ID=
NEON_BRANCH=staging
SENTRY_DSN=<EU-org DSN, or blank>
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=<EU-org DSN, or blank>
NEXT_PUBLIC_GA4_MEASUREMENT_ID=
```

Two rules that are easy to get wrong:

- **`ENABLE_PSEUDO_LOCALES` and `ENABLE_DEV_UI` must not be `true` on `staging`** — the zod schema
  refuses them there, naming the key (spec 040 AC-5). Since TASK-135 the refusal happens at server
  start rather than at build time: the deployment fails its healthcheck and never turns `● Active`.
  `staging` is shown to florists.
- The four Vercel keys (`VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`,
  `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`) are **not** pasted here. They are part of the declared
  contract but are platform-injected on Vercel only; `railway:check` allows them to be absent and
  `src/lib/railway.ts` says why.

## 3. Switch on the access wall

Still in **Variables**, add one more:

```dotenv
STAGING_BASIC_AUTH=<a user name>:<a long random password>
```

That single variable is the wall (spec 040 AC-25): every document request to `staging` answers
`401` with a browser prompt until the credential is given, and **`/api/health` stays open** so the
Railway healthcheck, the uptime monitor and CI can reach it. Absent means off — `production` never
gets this variable, and `railway:check --env production` reports it as an unexpected key if it
ever appears there.

Give the credential to the florists you demo to; do not put it in the repository, in an issue or
in a PR description.

## 4. Deploy, and watch the first build

Deployments → **Deploy**. The build runs the committed `Dockerfile`: `pnpm install
--frozen-lockfile`, `pnpm build` (standalone), then a runtime stage that copies `.next/standalone`,
`.next/static` and `public/` only and runs as the unprivileged `node` user.

**The build sees no credential, by design** (spec 001 §14 A17, spec 040 §14 A1; TASK-135). Railway
passes a service variable to a build only when the `Dockerfile` declares an `ARG` for it, and the
image declares one for `APP_ENV` and the `NEXT_PUBLIC_*` keys only — a build argument would survive
in the image's layer history. `next.config.ts` therefore asserts exactly those keys; `DATABASE_URL`,
the `R2_*` keys and `INTERNAL_CRON_SECRET` are asserted when the **server starts** and on every
`/api/health`.

What that changes for you when something is wrong:

| symptom | where to look |
|---|---|
| the build fails naming `NEXT_PUBLIC_*` or `APP_ENV` | the variable is missing or malformed in the service's variables; fix and redeploy |
| the build succeeds, the deploy never turns `● Active`, and the deploy log shows `Invalid environment (staging). N problem(s)` with server keys | a server variable is missing or still a `.env.example` placeholder; paste the real value — no rebuild is needed, only a redeploy |
| `/api/health` answers 500 | the same thing, seen from the outside: the report names keys and never prints a value |

The deploy is healthy when Railway's healthcheck gets a 200 from `/api/health` inside the grace
window.

## 5. Verify by hand (5 minutes)

With `DOMAIN` = the Railway domain from step 1 and `CRED` = the `STAGING_BASIC_AUTH` value:

```bash
# 1. health is open, and reports the right four fields (AC-31)
curl -s "https://$DOMAIN/api/health" | tee /dev/stderr | grep -q '"appEnv":"staging"'
#    expect: {"status":"ok","version":"<sha>","env":"staging","commit":"<sha>","appEnv":"staging","region":"europe-west4"}

# 2. health is fast: under 200 ms, and it makes no database call by construction
curl -s -o /dev/null -w '%{time_total}\n' "https://$DOMAIN/api/health"

# 3. a document is walled (AC-25)
curl -s -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/en"          # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -u "$CRED" "https://$DOMAIN/en"  # expect 200

# 4. staging is never indexable (AC-4)
curl -sI -u "$CRED" "https://$DOMAIN/en" | grep -i x-robots-tag        # expect: noindex
```

If (1) reports `"appEnv":"development"`, `APP_ENV` did not reach the runtime: fix the variable
rather than anything in the code — unset is *meant* to fail closed to `noindex`.

## 6. Run the drift gate

From a clean checkout of `main`, with a Railway **workspace token** for Grovant's workspace
exported in your shell only. A project token does not work here: it is scoped to one environment
and Railway expects it in a different header from the one the scripts send. "Release branch" → F5
below says how to create the right one.

```bash
export RAILWAY_API_TOKEN='<workspace token>'
export RAILWAY_PROJECT_ID='<project id>'

pnpm railway:check                 # trigger branches only (spec 040 AC-34)

export RAILWAY_ENVIRONMENT_ID='<the staging environment id>'
pnpm railway:check                 # triggers, plus the four AC-9 values of `web` against config/railway.json
pnpm railway:check --env staging   # all of that, plus the key set: missing or unexpected keys, names only
```

Every run checks the **trigger branches** of every environment against
`config/deploy-triggers.json` (spec 040 AC-34). Production's `web` and `worker` must trigger on
`release`, staging's services on `main`, and no other environment on `release`. A `worker` with no
repository source is not checked. `RAILWAY_ENVIRONMENT_ID` is **optional**: it enables the service
check (AC-9), and `--env` needs it. A red run prints one line per difference, such as
`production · web · triggers on main, declared release`, on stdout, and a verdict on stderr.

**The expected red, until TASK-104 and TASK-103.** While production has no `web` service
(TASK-104 creates it, on `release`), or staging has no `worker` service (TASK-103 creates it), a
run with `RAILWAY_ENVIRONMENT_ID` unset exits **1** (spec 040 AC-42, AC-44). Its stdout is exactly
the `production · <service> · triggers on none, declared release` lines for the production services
that do not exist, and `staging · worker · triggers on none, declared main` while staging has no
`worker`. Its stderr is exactly one of these three lines, depending on which of the two is missing:

```text
railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` (spec 040 AC-42, T-44): every failure above is a declared production service that does not exist yet. Once production `web` exists, this output is a real failure.
railway:check: EXPECTED RED until TASK-103 creates staging `worker` (spec 040 AC-44, T-45): every failure above is staging's `worker`, which does not exist yet. Once staging `worker` exists, this output is a real failure.
railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` and TASK-103 creates staging `worker` (spec 040 AC-42, AC-44, T-44, T-45): every failure above is a declared production service or staging's `worker`, none of which exists yet. Once both exist, this output is a real failure.
```

The first is for production missing, the second for staging's `worker` missing, and the third for
both. A missing production service counts only while production's `web` is missing too. A label
appears only when every failure is one of those cases and every other check on the run passed. Any
other red carries no label and is a real failure, including a missing staging `web`, a staging
`worker` that exists with no trigger or on another branch, and a missing production `worker` while
production `web` exists. Once TASK-104 and TASK-103 have both run, every run must exit 0.

Otherwise every run must exit 0. `railway:check` prints key names and configuration values only; it
never reads a variable value, which is why it is safe to paste its output into a PR.

## 7. The verification that is still outstanding

Spec 040 §12 step 2 asks for the **full Playwright + LHCI suite against the staging URL**,
origin-direct (no Cloudflare yet). That needs the live URL and the credential, so it is yours:

```bash
export PLAYWRIGHT_BASE_URL="https://$DOMAIN"
export STAGING_BASIC_AUTH='<the same credential>'   # the auth spec skips without it
pnpm test:e2e
pnpm test:a11y
pnpm lighthouse
```

Record the result in `docs/tasks/TASK-098.md` `## Result` (spec 040 AC-30: while GitHub Actions is
billing-blocked, the local/manual gate run is the evidence). Nothing in this repository claims that
run has happened.

## 8. What must not be done here

- **No production deploy** until the Cloudflare half and the cutover task (§12 steps 4–6). ADR-0018
  states it as a rule.
- **No second `web` replica** without the shared ISR cache handler (§13 Q4).
- **No lifting of `noindex`.** The indexing flip is spec 007 §12 / TASK-096, on the founder's word,
  and must not be bundled with a hosting change.
- **No `STAGING_BASIC_AUTH` on `production`** — AC-25: the public site has no auth wall.

## Release branch (spec 040 §14 A3: F1–F6)

**Why.** Production no longer deploys on every merge. It deploys only from a branch called
`release`, which only `pnpm release:promote` moves, after `/launch production` has passed every
gate on that exact commit. `main` deploys to `staging`. Six settings make that true, and only you
can change them: you are Admin in Grovant's Railway workspace and the only writer on GitHub.
**Owner:** founder (F1–F6); the orchestrator only pushes `release` in F1 and runs the checks.
**When:** now. F4 needs CI to run on every push to `main`, which is on `main` already (TASK-155).
**Time:** about 20 minutes.

| # | What | Who | The command that proves it |
|---|---|---|---|
| F1 | `release` exists; production `web` (and `worker`, if it has a source) deploys from it | orchestrator (branch), founder (trigger) | `git ls-remote origin refs/heads/release`, `pnpm release:status`, `pnpm railway:check` |
| F2 | staging `web` and `worker` deploy from `main` | founder | `pnpm railway:check` |
| F3 | PR environments still fork from `staging`, and none follows `release` | founder | `pnpm railway:check` (plus a look at the screen) |
| F4 | staging `web` waits for CI | founder | `gh run list --workflow ci --branch main --event push --limit 1`, staging `/api/health`, `pnpm railway:check` |
| F5 | the token `railway:check` uses can read every environment's triggers | founder | `pnpm railway:check` prints exactly what "What the checks print today" shows |
| F6 | a ruleset stops `release` being deleted, and nothing else | founder | `gh api repos/itsahmeds/flowers-overseas/rules/branches/release --jq '[.[].type]'` |

Do them in the order below: F5 first, because every other check needs its token.

Railway's dashboard is renamed from time to time. If a label below does not match your screen,
the setting is the one Railway's docs call by the name in _italics_, and the check after each step
tells you whether it took. Every check prints names and branches, never a secret.

Before you start, in a terminal in your checkout (`cd ~/dev/flowers-overseas`, then `git pull`):

```bash
export RAILWAY_API_TOKEN='<the workspace token from F5>'   # F5 first if you have none
export RAILWAY_PROJECT_ID='<project id: Railway → the project → Settings → General → Project ID>'
unset RAILWAY_ENVIRONMENT_ID    # these checks read triggers only
```

### F5 — the token `railway:check` uses can read deployment triggers

Do this one first: every other check needs it.

1. In Railway, click your avatar (top right) → **Account Settings** → **Tokens**.
2. Under _workspace token_, give it the name `railway-check` and choose **Grovant's workspace**
   as its workspace. Click **Create**. Copy the token once; Railway shows it only now.
3. Paste it into your shell as `RAILWAY_API_TOKEN` (above), and into your password manager. Never
   into a file in this repository, an issue, or a PR.

A project token (Project → Settings → Tokens) is **not** the right one: it can see only one
environment, so it cannot read `production` and `staging` together.

**Proof:**

```bash
pnpm railway:check; echo "exit $?"
```

Today, while production has no `web` service, you should see **exactly** the output under "What
the checks print today" at the end of this section, and `exit 1`. That output may or may not
include the `staging · worker · triggers on none, declared main` line: it is there while staging has
no `worker` (until TASK-103), and either way is right. A red run prints only the lines that fail,
so seeing no `staging · web` line is right. How to read anything else:

- `exit 2`: the token or the project id is not set in this shell.
- An error that says not authorised: Railway refused the token. Make a new one in step 2 and
  check the workspace you chose.
- A `staging · web · …` line: the token cannot see `staging`. Railway reports an environment it
  hides as having no services. Make a new token in step 2.
- No `EXPECTED RED` line on stderr. Only **this** output means the token cannot see
  `production` (Railway left production out of its answer, so the check cannot label it), with or
  without the third line, which is there while staging has no `worker`:

  ```text
  production · web · triggers on none, declared release
  production · worker · triggers on none, declared release
  staging · worker · triggers on none, declared main
  ```

  and on stderr exactly `railway:check failed: the lines above name each difference.` For that
  output, and only that one, make a new token in step 2 and run the proof again. Any other
  unlabelled output, such as a single `production · web` line, or `production · worker` with
  `staging · worker` but no `production · web` line, is a fault a token cannot fix. Stop, do not
  change the token, and paste the output as it is to the orchestrator. Do the same if a new token
  prints the output above again.

Once TASK-104 has created production `web`, the same command prints every row, `production ·`
and `staging ·` lines alike, and `exit 0`.

### F1 — `release` exists, and production follows it

**Part 1, the branch (the orchestrator's).** If production is already running a commit, the
orchestrator creates `release` once at that commit, read from production's `/api/health`
`commit`. If production has never deployed, nothing is created now: the first
`/launch production` creates `release` with `pnpm release:promote --create` at the commit it
gates. (The shell guard now refuses every direct push to `release`, so `release:promote` is the
only way in either case.)

**Part 2, the trigger (yours).**

1. Railway → the `flowers-overseas` project. In the environment switcher at the top, choose
   **production**.
2. Click the **web** service → **Settings**.
3. Find **Source**, near the top. It shows the GitHub repository and the branch this environment
   deploys from (Railway's docs: _trigger branch_).
4. Change the branch to `release` and save. Type the name exactly: `release`, lower case.
5. You should now see `release` as the branch. Nothing deploys yet if `release` has not moved.
6. Click the **worker** service and do the same, **only if** its Source section shows a
   repository. A `worker` with no repository has no branch to set; leave it.

**If production has no `web` service yet** (the state today, until TASK-104): part 2 does not
apply now. TASK-104 creates `web` with `release` as its branch from the start, never with `main`,
and only once `release` exists, so production never follows a missing branch.

**Proof:**

```bash
git ls-remote origin refs/heads/release     # one line, <sha>  refs/heads/release (nothing yet if production never deployed)
pnpm release:status; echo "exit $?"         # once release exists: invariant: ok
pnpm railway:check; echo "exit $?"          # once TASK-104 has created web: production · web · triggers on release, declared release
```

### F2 — staging follows `main`

1. Environment switcher → **staging**.
2. **web** → **Settings** → **Source**: the branch reads `main`. If it reads anything else,
   change it to `main` and save.
3. **worker** (if it exists and its Source section shows a repository): the same, `main`.

**Proof:** `pnpm railway:check` prints `staging · web · triggers on main, declared main` on a
green run, and no `staging · web` line on a red one.

### F3 — PR environments still fork from `staging`

1. Railway → the project → **Settings** (the project's, not a service's) → **Environments**.
2. _PR environments_ stay on. Where the screen names the environment they are copied from (the
   _base environment_), it reads `staging`. Change nothing else.
3. If the screen shows no base-environment choice, tell the orchestrator what it does show.

**Proof:** `pnpm railway:check` prints no `triggers on release` line for any environment other
than `production`: AC-34 fails the run if a PR environment follows `release`. The base
environment itself has no command that reads it; your look at the screen in step 2 is the record.

### F4 — staging waits for CI

1. Environment switcher → **staging** → **web** → **Settings** → **Source**.
2. Turn on **Wait for CI**. Railway then waits for the GitHub Actions run of each commit on `main`
   before it deploys it, so a red `main` never reaches staging or the florist demos.

**Proof:** after the next merge to `main`:

```bash
gh run list --workflow ci --branch main --event push --limit 1 --json headSha,status,conclusion
curl -s -u "$CRED" "https://$DOMAIN/api/health"    # DOMAIN and CRED as in step 5 above
```

While the run's `status` is not `completed`, staging's `commit` is still the previous one, and
Railway shows the new deployment as waiting. Once the run concludes `success`, staging's
`commit` becomes the run's `headSha`. Then run `pnpm railway:check` again: the same result as
after F1–F3.

### F6 — `release` cannot be deleted

On GitHub, in the repository:

1. **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name:** `release`. **Enforcement status:** **Active**. **Bypass list:** leave empty.
3. **Target branches** → **Add target** → **Include by pattern** → type `release` → **Add
   Inclusion pattern**.
4. **Branch rules:** tick **Restrict deletions** only. **Untick Block force pushes**, which GitHub
   ticks by default: a rollback moves `release` backwards, and that rule would stop it. Leave
   every other rule unticked.
5. **Create**.

Rulesets apply only while the repository is public on GitHub Free. If it goes private, this
protection silently stops.

**Proof:**

```bash
gh api repos/itsahmeds/flowers-overseas/rules/branches/release --jq '[.[].type]'
```

It prints exactly `["deletion"]`. `[]` means the ruleset is not active or does not match
`release`; anything with `non_fast_forward` in it means **Block force pushes** is still ticked.

### What the checks print today

While production has no `web` service (until TASK-104), `pnpm railway:check` after F1–F3, with
`RAILWAY_ENVIRONMENT_ID` unset, exits **1**, and that is the expected result. Its stdout has one
line per production service that does not exist, the staging `worker` line while staging has no
`worker` service (until TASK-103), and no other line:

```text
production · web · triggers on none, declared release
production · worker · triggers on none, declared release
staging · worker · triggers on none, declared main
```

(The production `worker` line is there only while production has no `worker` service at all, and
the `staging · worker` line only while staging has none.) Its stderr is exactly one line. With the
`staging · worker` line on stdout, it is:

```text
railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` and TASK-103 creates staging `worker` (spec 040 AC-42, AC-44, T-44, T-45): every failure above is a declared production service or staging's `worker`, none of which exists yet. Once both exist, this output is a real failure.
```

Without the `staging · worker` line, it is:

```text
railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` (spec 040 AC-42, T-44): every failure above is a declared production service that does not exist yet. Once production `web` exists, this output is a real failure.
```

TASK-164 taught the check to label the missing staging `worker` (spec 040 AC-44), so this run is
labelled whether or not staging has a `worker` yet. Paste the output into `docs/tasks/TASK-157.md`.
Once TASK-104 has created `web` on `release`, the same command must exit 0 (TASK-104 runs after
TASK-103, so staging has its `worker` by then); that run is recorded in TASK-104's brief, before
the DNS change.

## Cloudflare zone settings (spec 040 §5.4, §12 step 4; TASK-100)

**Why.** Cloudflare sits in front of the whole site. A zone feature switched on by mistake —
Rocket Loader, Auto Minify, Email Obfuscation, Bot Fight Mode, AI-crawler blocking — silently
breaks the inline-script hash (ADR-0016), `robots.txt` or crawling. `config/cloudflare/zone-settings.json`
declares every setting spec 040 §5.4 pins, each with its reason. Two commands read it:

- `pnpm cloudflare:check` only reads. It prints one line per setting that differs, as
  `setting · declared · live · feature`, and exits 1 if there is any.
- `pnpm cloudflare:apply` writes the differences it can, and prints `cloudflare:apply: N changes`.
  Run it twice: the second run must print `cloudflare:apply: 0 changes`.

The zone settings are applied while the zone still points at nothing (§12 step 4). DNS records,
cache rules and the rate limit are TASK-101's and are not in this file.

### Z1 — create the token (Cloudflare dashboard, 3 minutes)

1. Log in at `dash.cloudflare.com`. Click the person icon (top right) → **My Profile** →
   **API Tokens** → **Create Token**. Next to _Create Custom Token_, click **Get started**.
2. **Token name:** `flowersoverseas-zone`.
3. **Permissions.** Add one row for each line below: choose the three values from the dropdowns,
   then click **+ Add more** for the next row.

   | first dropdown | second dropdown | third dropdown |
   |---|---|---|
   | Zone | Zone Settings | Edit |
   | Zone | DNS | Edit |
   | Zone | Cache Purge | Purge |
   | Zone | Zone | Read |
   | Zone | Bot Management | Read |

   The last row is read-only. Only with it can the check see Bot Fight Mode, the managed
   `robots.txt` and the AI-crawler switches. Spec 040 AC-24 lists only the first four, so the
   fifth waits on a ruling (TASK-100 escalation E-1). Without it, the check stops with
   `the token is missing scope Zone → Bot Management → Read`.
4. **Zone Resources:** `Include` · `Specific zone` · `flowersoverseas.com`. Choose nothing else:
   no "All zones", and **no Account row of any kind**.
5. Leave _Client IP Address Filtering_ and _TTL_ empty. Click **Continue to summary**, check that
   the summary shows only `flowersoverseas.com`, then click **Create Token**.
6. Copy the token now: Cloudflare shows it only once. Put it in your password manager. Never
   paste it into a file in the repository, a PR or a chat.

### Z2 — find the zone id

In the dashboard, click **flowersoverseas.com** → **Overview**. In the right-hand column, under
**API**, click the copy button next to **Zone ID**. It is 32 letters and digits. It is not a
secret, but it goes where the token goes.

### Z3 — the first apply, from your shell

From a clean checkout of `main`:

```bash
export CLOUDFLARE_API_TOKEN='<the token from Z1>'
export CLOUDFLARE_ZONE_ID='<the zone id from Z2>'
pnpm cloudflare:check; echo "exit $?"     # read-only: lists what differs today
pnpm cloudflare:apply; echo "exit $?"     # writes it: ends with "cloudflare:apply: N changes"
pnpm cloudflare:apply; echo "exit $?"     # must end with "cloudflare:apply: 0 changes" and exit 0
pnpm cloudflare:check; echo "exit $?"     # must print "… declared values match …" and exit 0
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID
```

Paste the output of all four commands, as they are, into `docs/tasks/TASK-100.md` `## Escalations`
(or send it to the orchestrator). The token never appears in it: the scripts print setting names
and values only.

**What the output can say, and what to do:**

- `skipped: no token`: one of the two `export` lines did not run in this shell. Run them again.
- `exit 2` naming a variable: that variable is empty in this shell.
- `exit 3`, `the token is missing scope X`: the token lacks row X of the Z1 table. Edit the token
  (My Profile → API Tokens → the `…` menu → **Edit**), add the row, and run again.
- `exit 3`, `answered 401`: Cloudflare refused the token. Make a new one (Z1).
- `zone · declared flowersoverseas.com · live …`: the zone id belongs to another zone. Copy it
  again (Z2).
- A line starting `manual:`: the script does not switch this on or off itself. Search the
  dashboard for the name after the last `·` (for example `Bot Fight Mode`), and switch it to the
  declared value. **Under Attack mode** is only ever switched on by you, during an incident;
  switch it off when the incident is over. Then run `pnpm cloudflare:check` again.
- `mirage · retired by Cloudflare … · counts as off`: expected. Cloudflare has removed Mirage.

### Z4 — the two repository secrets, for the `cloudflare-check` CI job

The CI job `cloudflare-check` runs the same check on every push to `main`, every night at 03:17
UTC, and on pull requests that change `config/cloudflare/` or carry `ci:full`. It reads two
repository secrets. **Without them it fails** and names them. It never passes on `skipped`.

1. GitHub → `itsahmeds/flowers-overseas` → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Name `CLOUDFLARE_API_TOKEN`, value: the token from Z1. Click **Add secret**.
3. Again: name `CLOUDFLARE_ZONE_ID`, value: the zone id from Z2. Click **Add secret**.

Do Z3 before Z4: once the secrets exist, the job checks the live zone, and it stays red until Z3's
apply has run.

## Rollback

Deleting the `staging` service or environment has no user impact (§12's per-step rollback). A bad
deploy inside Railway is a **redeploy of the previous image** from Deployments → the previous
deploy → **Redeploy**: no rebuild, under five minutes (AC-13, rehearsed and documented by
TASK-103 in `docs/runbooks/rollback.md`).
