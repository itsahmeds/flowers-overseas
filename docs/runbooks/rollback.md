# Runbook — Rollback a production deploy

| Field | Value |
|---|---|
| Severity | P1 |
| Detect | Error rate >1% during canary; broken checkout; any P1 caused by a deploy |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Post-deploy checks failing; Sentry spike right after release.

## Hosting: put the image and the branch back (spec 040 §14 A3, AC-39)

Production's `web` service on Railway deploys from the `release` branch. A rollback puts back
**both** the running image (step 1) and the branch (step 2); doing only step 1 leaves `release`
naming the bad commit, and the next build from it brings the bad code back.

### The 2 a.m. version (for the founder)

**(a) Step 1 is a click in Railway's dashboard. It takes under five minutes and needs nothing else.**

1. Find the previous deployment. On GitHub, open `docs/releases/` on `main` and the newest
   `production` note whose "Visit 1" line reads `RELEASE: READY <bad-sha>`. Its "Visit 2" line
   reads `RELEASE: PROMOTED <bad-sha>`, or `RELEASE: ROLLED BACK <bad-sha>` if the watch already
   caught it; a `RELEASE: HALTED <bad-sha>` added later does not change which note it is. Its
   `## Rollback plan` section has two lines: `Previous release: <sha>` and
   `Previous deployment id: <id>`. Keep that page open, because step 2 needs both SHAs.
2. In Railway, open the Flowers Overseas project and pick the **production** environment in the
   environment switcher at the top.
3. Click the **web** service, then its **Deployments** tab.
4. Find the deployment with the id from the note. Railway shows a deployment's id when you open
   the deployment (T-43 records exactly where). Its commit is the note's `Previous release` SHA,
   so the short SHA in the list is a second check.
5. Click the three dots (**⋮**) at the end of that deployment's row and choose **Rollback**, then
   confirm. Railway restores that deployment's image and its variables, without a build.
6. Wait until that deployment shows **Active**. Then open `https://flowersoverseas.com/api/health`
   and check that its `commit` is the previous release SHA.

**(b) Step 2 can wait.** You may run it from your own terminal now, or leave it to the
orchestrator in the morning. Production is already safe after step 1. The guard stops an agent
from running step 2; it does not stop you.

**(c) Until step 2 has run, nobody changes a production variable and nobody redeploys the latest
deployment.** Either one would rebuild from `release`, which still names the bad commit.
_This is the advisor's inference, not documented Railway behaviour._ It rests on Railway building
the service's branch on a variable change or a redeploy. Treat it as true until a rehearsal
(T-43) shows otherwise.

### Step 1 — redeploy the previous image

As in (a) above: the previous deployment's **Rollback** action on production `web`. The release
note's `Previous deployment id` (written by `/launch` gate 8) says which deployment it is.

### Step 2 — move `release` back

From your checkout of this repository (`cd ~/dev/flowers-overseas`), on any branch, with no
Railway token needed:

```sh
git fetch origin
pnpm release:rollback --to <previous-release-sha> --expect <bad-sha>
pnpm release:status
```

- `--to` is the note's `Previous release` SHA, and `--expect` is the SHA the note promoted (the
  bad one). The command reads the note from `origin/main` after its own fetch, so a checkout that
  is behind does not matter.
- It refuses, and pushes nothing, when `release` on the remote is not `<bad-sha>`, when `--to` is
  not an ancestor of `release`, or when `--to` is neither (a) a past production `web` deployment
  from `release` that succeeded (read from Railway's API when a token is set) nor (b) the
  previous release named in the production note that promoted `<bad-sha>`. That note still
  counts when it also says `HALTED <bad-sha>` after the promotion. A note that halted on
  `<bad-sha>` without promoting it does not count, and neither does a later note's rollback
  plan. The refusal names both routes. Without a token, or when the API cannot be
  reached, only (b) is checked, and the output says so.
- The move is a lease push (`--force-with-lease=release:<bad-sha>`), so if `release` moved since
  the check, git refuses too.
- Done when `release:status` prints `invariant: ok` and production (`/api/health`, `commit`) equals
  `release`.

Afterwards, write a **new** production note under `docs/releases/` recording the rollback (see
Fix / recovery), and open a fix task. Never edit the note that promoted `<bad-sha>`: it is the
record route (b) reads. The
fix reaches production through the normal path: merge to `main`, staging, `/launch production`,
`release:promote`.

## Immediate actions (first 15 minutes)
1. Hosting: steps 1 and 2 above. Only if the Vercel cold fallback is the one serving traffic,
   promote its previous deployment instead (dashboard or `vercel rollback`). 2. If a migration shipped: assess whether the previous code works with the new schema (additive migrations do); only run the rollback SQL if not, in reverse order, after a DB backup.

## Diagnosis
Read the release note's rollback plan.

## Fix / recovery
Verify health endpoints, a test order, sitemap. Write a new production note under `docs/releases/`
that records the rollback (`RELEASE: ROLLED BACK <bad-sha>`, the previous release SHA it went back
to, the time and the reason); leave the note that promoted `<bad-sha>` as it is. Name it
`YYYY-MM-DD-production-<bad-short-sha>-rollback.md`: the `-rollback` suffix means a rollback on the
day of the promotion never overwrites the promoting note, which has the same name without it.
Open a fix task.

## Communication
Status page/email only if buyers were affected >15 min.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
