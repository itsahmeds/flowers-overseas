# TASK-191 — The not-found document built to `errors-*`

Row: `TASKS.md` → TASK-191. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23** owns **AC-40**, **as rebound by A24
  clause 6** (T-42). AC-12's contracts are re-verified unchanged: status 404, `lang` set, styled.
- **AC-40 as rebound (2026-10-05).**
  - **No stamp, no postmark and no airmail edge.** The one decoration is the faint dashed route,
    an `aria-hidden` inline SVG behind the letter. Build it **static**: motion 13 (the route draws
    once) is TASK-194's.
  - **The document fills the first viewport.** Its block size is at least the viewport's minus
    the header, at 1440 × 900 and 390 × 844.
  - Below `md` the logo header is TASK-195's minimal header with no Menu: the notice document has
    no navigation.
  - **A23 open item (iv) is closed.** Round 2 dropped the airmail edge, so the spec and the
    artboard agree and no README row is needed for it.
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md` §1 finding 11: the 404 has no chrome and
  none of its artboard (no letter, no airmail edge, no postmark), a plain centred column at x 483.
  §3 row 11: "`errors-*` unchanged: build to it", now read through A23 clause 10.
- **Artboards (PR 189).** `wireframes/errors-{desktop,mobile}.dc.html`, round 2. Its round-1
  stamp and postmark do not bind (A23 clause 10; A24 clause 6). Its "Tokens" row still lists
  `--tilt-letter`, the stamp and the postmark colours; the drawing and AC-40 as rebound win, so
  nothing is tilted and neither device is built. The structure that binds: the notice document,
  the logo alone in the header, no navigation, no footer; a letter on the paper ground, the code as
  the eyebrow (a paragraph, not a heading), the H1, one sentence and two link actions, Home and
  Destinations. Every decorative mark is `aria-hidden`. Copy verbatim: `errors.notFound.*`,
  `common.homeLink`, `footer.link.destinations`.
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10): the laptop band
  (clause 9), the H1 first in reading order, honesty, tokens only.
- **A23 open item (iv): closed by A24 clause 6.** The round-2 letter has no airmail edge.
- **Dependencies.**
  - **No build starts before the round-2 design PR, PR 189, merges** (A23 clause 10; founder,
    2026-10-05).
  - TASK-186 (the frame and the tokens).
  - **TASK-195** (the phone header).
  - **TASK-179**: PR 170 is open and edits `src/app/not-found.tsx`, `src/app/[locale]/error.tsx`,
    `src/app/global-error.tsx` and `src/modules/ui/layout/NoticeDocument.tsx`. Dispatch only after it
    merges. **Start by re-measuring `main`** at 1440 × 900 and 390 × 844, and build only what PR 170
    left undone. If PR 170 already meets AC-40, this task is the AC-40 test (T-42) and the README row.
- **Unchanged.** Spec 003 AC-8 (every 404 under a known locale is a real document with `lang`); the
  residual 404 shapes of spec 008 §14 A13 stay as pinned in `tests/e2e/locale-routing.spec.ts`; no
  client JS; zero links to a non-200 URL (AC-14).
- **Review class.** Review-only if the diff is presentation only (DoD 4). The reviewer confirms.
- **Tests.** **T-42** (e2e + a11y + visual): `/en/does-not-exist` and `/pl/nie-ma` answer 404 with
  `lang`; the notice document's parts; both links answer 200; no stamp, postmark or airmail edge;
  exactly one `aria-hidden` decoration; the document fills the first viewport; axe clean. Watch it
  go red with the Destinations link removed, and red with a postmark element restored.

### The product page's sweep findings

Recorded as a carry-forward in `docs/tasks/TASK-179.md` (the file exists on `main`), not here.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, AC-12, §14 A21 clause 2, A23 clause 7 and
  open item (iv)
- `specs/003-i18n-foundation.md` — AC-8
- `docs/codebase-map.md`
- `src/app/not-found.tsx`, `src/modules/ui/layout/NoticeDocument.tsx`,
  `src/modules/ui/layout/noticeShell.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._
