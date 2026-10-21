# TASK-323 — Spec 044 admin and publishing

Row: `TASKS.md` → TASK-323. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-323`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 3. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-15, AC-16, AC-19; tests T-15, T-16, T-19 and T-22's admin half (`admin-blog-edit` at 1440).
- Depends on TASK-321 (commands, rules, triggers), TASK-322 (the public template the preview reuses) and TASK-295 (publish runs; its brief carries the `isRemovalRefused(url, context)` seam this task wires the exemption into).
- **Design:** `docs/design/wireframes/admin-blog-list-*.dc.html`, `admin-blog-edit-*.dc.html`, `admin-blog-authors-*.dc.html` and `docs/design/flows/admin-blog-publish.dc.html` (write, link, preview, approve, publish, live, edit, publish changes, unpublish, with a failed run). Pixel match.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): the publish path, unpublish, permissions and auth.
- Permission rows `blog.edit`, `blog.publish`, `blog.unpublish`, `blog.authors` exactly as §5.2's table; approval is spec 012b's `translation.attest` in the user's reviewer locales. Every action calls `requirePermission(...)` first, then `withAdminContext({ action, reason })`.
- Every `/admin/blog` page, action and the preview is found by spec 012's enumerated unauthenticated and `noindex` suites with no hand-edited list; admin pages are SSR `no-store`, `noindex`, Cloudflare bypass.
- The spec 012b removal-guard exemption (§2.6, AC-16): a blog URL whose post was unpublished through `unpublishPost` with its reason on the audit row is exempt from the indexable-removal refusal; every other removal keeps it, and the test pins both.
- Admin strings in `messages/admin/en.json` only, `reviewed: false`; the artboards' `[slot]`s are proposed wording the founder approves as one batch.
- May share a PR with TASK-325 as one feature (CLAUDE.md Conventions).

## Read

- `specs/044-blog.md`: `## 0. Index`, then §2.3 (editor), §2.4, §2.5, §2.6, §5.2, §5.3, §5.4, §9 AC-15, AC-16 and AC-19, §10
- `specs/012-admin-shell.md` (permission rows, enumerated suites), `specs/012b-cms.md` §2.3 and §2.8 (publish runs), `docs/tasks/TASK-295.md`
- `docs/codebase-map.md`; `src/app/admin/(signed-in)/`, `src/modules/content/blog/` (from TASK-321)

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** the byline is the person's own name; the author form must show the person's own-name confirmation as an act only that person can give when signed in (§2.2); an admin cannot give it for them. Authors created here are slice A's; public author pages are slice B.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
