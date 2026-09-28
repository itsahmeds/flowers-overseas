ADVISOR: GO WITH FIXES

# Spec 040 §14 A3: production deploys from a `release` branch

**In one sentence:** A3 stops every merge to `main` from reaching production. It does this with a `release` branch that only `pnpm release:promote` moves, and only to the exact commit `/launch` tested. The design is sound and the Railway facts it relies on check out. Three gaps remain before it can work on day one: the first `release` branch has no tool to create it, gate 1 depends on Q9 being answered "yes", and the 2 a.m. rollback is not written for the founder.

## Verdict: GO WITH FIXES
1. **§14 A3 change 10 (F1) and AC-36: say how `release` is first created.** F1 "comes right after approval", and it has the orchestrator create `release` with `release:promote --create`. That script only exists after suggested task (2) merges. Change F1 to one of two things. Either name the one-time command (`git push origin <sha>:refs/heads/release`, run by the orchestrator before AC-40's guard lands), or say F1 waits until task (2) is merged. Add one sentence: "From F1 until the first `/launch production` under A3, production stays on its current commit."
2. **AC-38 and AC-37 gate 1: make Q9 = yes a precondition, not an option.** Gate 1 needs "a green CI run whose `head_sha` is that SHA". A squash-merge commit gets no CI run unless something runs CI on pushes to `main`. If Q9 is "no", every production launch halts. Either delete "(subject to §13 Q9)" from AC-38, or write Q9's alternative into AC-37's gate 1 text. Also state that task (1), which adds the push trigger, must merge before the first `/launch production`.
3. **AC-39 (the rollback runbook): write the 2 a.m. version.** Step 1 (redeploy the previous image) is a dashboard click the founder can do. Add two things. (a) The founder may run step 2 (`pnpm release:rollback …`) in their own terminal, because the guard binds only agent sessions. (b) Until step 2 has run, nobody changes a production variable or presses "redeploy" on the latest deployment. Either of those would rebuild `release`, which still names the bad commit [inferred from change 4 and Railway's redeploy behaviour].

## The four hats
**Building**
1. The guard (AC-40) binds only Claude sessions. Three other routes can still move `release`: your own terminal, a GitHub PR opened with `release` as its base by mistake, and anyone else with write access. `release:status` (AC-35) catches a moved branch only when someone runs it; the nightly job checks Railway's triggers, not the branch. GitHub rulesets support a bypass list for the repository-admin role ([GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). So "restrict updates, admin bypasses" would close these routes without blocking the rollback.
2. The promotion itself is sound. It checks that the commit is on `main` and that the old release is an ancestor. Then it pushes a fast-forward with a lease on `<old-sha>`, which is atomic on GitHub's side. A push to `main` between the two launch visits reaches staging only, and T-36 tests exactly that. **Rollback timing:** Railway's docs say a rollback "will use the source code from the selected deployment". They do not say it skips the rebuild ([Railway deployments](https://docs.railway.com/reference/deployments)), so "under five minutes, no rebuild" is proven only by T-13/T-43, not by the docs.
3. The Railway claims check out. Railway sets the trigger branch per service under Settings, and its docs mention no tag trigger. "Wait for CI" needs a workflow that runs `on: push` and holds a deployment until the commit's check suites finish ([Railway autodeploys](https://docs.railway.com/guides/github-autodeploys)). The config-as-code keys are `build`, `deploy`, `environments` and `watchPatterns`, with no key for a trigger branch ([Railway config-as-code](https://docs.railway.com/reference/config-as-code)). So a separate `config/deploy-triggers.json` is the right call.

**Google:** Staging is not a concern: its `noindex` and basic-auth (§5.2, §5.4) are unchanged. One caution: the TASK-096 row in `TASKS.md` still calls the indexing flip "a configuration act, not a deploy", which contradicts AC-43. Also, a `/seo-audit` on staging will see `noindex` everywhere, as expected, so indexability is proven only in visit 2 on production.

**Law and compliance:** No concern. Release notes that record each commit make it easier to show when a privacy or terms version went live (plan/07). This is not legal advice, and nothing here needs a lawyer.

**Customer:** No concern. Production is not on the domain yet (TASK-104 is still `todo`), so no buyer sees the switch. Railway keeps the old deployment running briefly while the new one starts ("slight overlap for zero downtime", [Railway deployments](https://docs.railway.com/reference/deployments)).

## Questions the founder should ask
1. What is my role in Grovant's Railway workspace? Railway's Member and Admin roles can change service settings; the Deployer role cannot ([Railway teams](https://docs.railway.com/reference/teams)). The answer decides whether I or Grovant does F1–F4.
2. Besides me, does anyone (Grovant included) have write access to the GitHub repository? The answer decides whether Q8's (b) is enough.
3. When the repository goes private again, what happens to Q9's CI minutes on every merge and to Q8's ruleset?
4. After F1, how long until production can receive anything again, and which tasks does that wait for?
5. At 2 a.m., which one click restores the site, and can the rest wait until morning?

## What looks right
The branch never gets its own commits: it is always equal to `main` or behind it. It moves only to a named, tested SHA, under a lease. The spec also says plainly that the image tested on staging is rebuilt for production. Together those are the right shape for a solo founder.
