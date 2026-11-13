# Runbook: the catalogue in admin (bouquets, prices, photos, countries, publishing)

| Field       | Value                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Severity    | P2 (a wrong price or a missing bouquet costs sales; a lost database loses the catalogue)            |
| Detect      | the admin pages, the backup warning, a failed or timed-out publish run, `pnpm catalogue:parity`     |
| Owner       | founder                                                                                            |
| Owning spec | 012b (`specs/012b-cms.md`), slice A                                                                |
| Last tested | not yet (fill at the slice A exit signal: a bouquet made in admin on the staging shop after one publish) |

Since spec 012b slice A the **database is the master copy** of bouquets, sizes, product text,
prices, photos and countries. The repository files (`src/config/catalogue/*.data.ts`,
`seed/data/**`, `src/config/countries.ts`) only fill a fresh database and the tests. UI strings,
guides and legal pages stay in the repository. Every change below is a data change made in
`/admin`, never a pull request.

## 1. Before the first edit in production (founder, once, in this order)

1. **Backups first.** Spec 002's nightly backup (TASK-028) runs and one restore drill is recorded
   (TASK-030). Until a verified backup is recorded, every `/admin/catalogue`, `/admin/media`,
   `/admin/countries` and `/admin/publish` page in production shows "No checked backup in the
   last 48 hours." (§5).
2. **The build login.** In Neon, give the `app_build` role a login and password (migration 0018
   created the role). Put its connection string in Railway as `DATABASE_BUILD_URL` on `web` in
   `staging` and `production`. Without it the deployment builds and serves the repository files
   and boot logs `catalogue.source_fallback`.
3. **The publish target.** In Railway, create one **project token per environment** (Project
   settings, Tokens, scoped to `staging`, then to `production`). In each environment set
   `RAILWAY_PUBLISH_TOKEN` to its own token and `PUBLISH_TARGET=railway`. PR environments get
   `PUBLISH_TARGET=none`. A deployed environment with `railway` and no token refuses to boot (the
   previous deployment keeps serving); `fake` is refused in `staging` and `production`.
4. **Check the declarations.** `pnpm env:check` (the repository) and `pnpm railway:check --env
   staging`, then `--env production` (the live variables, names only). Both must pass.
5. **Seed, import, compare.** Against production, through the path spec 002's runbook uses:
   `pnpm db:migrate`, `pnpm db:seed --insert-only`, `pnpm attestations:import
   --only=catalogue,media`, then `pnpm catalogue:parity --target=<production database>`. Parity
   must print no differing URL before the cutover release.
6. **Reviewers.** `pnpm admin:grant --email <address> --locale en --locale en-gb` for the founder;
   a native reviewer gets `--locale pl` or `--locale de`. Only a signed-in person with the locale can approve that locale's text.

## 2. Putting a florist's bouquets on sale

The flow is drawn in `docs/design/flows/admin-florist-bouquets.dc.html`.

1. Record the florist's terms (`/admin/partners/[code]`) before approving any of their photos.
2. `/admin/catalogue/products/new`: name, type, the supplier florist and their payout per size.
3. Sizes, then the text per locale (each locale only by someone granted it).
4. `/admin/media`: upload each photo with its provenance; approve it (`media.review`); attach the
   main photo and write the alt text per locale.
5. Prices per country on the prices tab: the typed amount is the **all-in** price (VAT and
   delivery included). The preview shows four locales, the 30-day lowest and the margin.
6. Approve the English text; ask the Polish reviewer to approve the Polish text.
7. Make the bouquet active, then **Publish** (§3). A new bouquet has no page until a publish.

Content changes to an existing bouquet (a price, a name, a description, a photo) reach the edge
within 60 seconds without a publish. Editing approved text makes that locale unreviewed again:
its page leaves the index, the sitemap and hreflang until it is approved again.

## 3. Publishing

`/admin/publish` lists what the database would add and remove against the running deployment,
per locale. **Publish** asks Railway to rebuild the environment's tracked branch head
(`release` in production, `main` in staging); it never builds another commit, so it cannot undo
or skip a release. A normal release publishes too.

- A run moves `requested`, `building`, `deployed`, `verified`; or `failed`, or `timed_out` after
  30 minutes. The new deployment verifies itself at boot, purges the sitemaps and warms every
  added URL.
- One open run per environment; at most 10 runs a day per environment. Both refusals create
  nothing.
- Once the placeholder window is closed, a publish that would remove an indexable URL is refused
  and names the URLs.
- **Failed or timed out:** read the run's error on the page, then the build log in Railway. A
  failed build leaves the previous deployment serving. Fix the data and publish again.
- **A bad publish went live:** roll back in Railway to the previous deployment
  (`docs/runbooks/rollback.md`), fix the data, publish again.
- **Publish is absent:** `PUBLISH_TARGET` is unset or `none` there; structural changes wait for the
  next release.

## 4. Countries and going live

The flow is drawn in `docs/design/flows/admin-go-live.dc.html`.

- `/admin/countries/[iso2]` shows the go-live check with every unmet reason. The switch appears
  only when none remains and asks for the country code typed out.
- The flip invalidates the country's pages and requests a publish when the URL set changes. VAT
  rate and supply model are set once on the same page while they are empty.
- **Rollback:** `live` to `demo` on the same page; the country's pages return to
  `noindex,follow` and leave the sitemaps within 60 seconds. `live` to `disabled` is refused.

## 5. The backup warning

In production, while the newest successful `db.backup_verify` is older than 48 hours or absent,
the catalogue, photos, countries and publish pages show the warning. It never shows in staging or
on previews. **What to do:** check the last nightly backup run and its verification; do not make
bulk edits until a verified backup exists. Until TASK-028 records verifications, the warning
always shows in production, which is the truth: no backup has been verified.

## 6. Reverting the cutover

Reverting the cutover PR brings back the repository providers; database rows stay. Anything
written in admin after the cutover is then invisible on the site until the cutover is applied
again. Prefer fixing the data over reverting.

## 7. Keys

| Key | Where | Secret |
| --- | ----- | ------ |
| `DATABASE_BUILD_URL` | Railway build variable of `web`, staging and production | yes |
| `PUBLISH_TARGET` | Railway, every environment (`railway`, or `none` on PR environments) | no |
| `RAILWAY_PUBLISH_TOKEN` | Railway, staging and production, one token each | yes |

No value of these keys belongs in a log, an issue, a chat or the repository. `.env.example`
documents each.
