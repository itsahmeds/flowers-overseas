# TASK-299 — Spec 012b photos

Row: `TASKS.md` → TASK-299. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 7. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-22, AC-23; tests T-22, T-23 and T-38's AC-23 rows.
- After TASK-293, TASK-297, TASK-082 and TASK-083 (spec 006; both unblocked or `todo` 2026-10-20).
- A florist's photo is approved only once that florist has a recorded `terms_version` (§12 founder action 7: the lawyer's photo-licence clause).
- Add this task's commands to T-09's table (TASK-296).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): uploads, security and the photo licence.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/lib/storage.ts`, the `media.derive_variants` job, `admin-media-*`, `admin-media-review-*`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-11 (implementer, TASK-299): **T-38's AC-23 rows** (axe on `/admin/media`, `/admin/media/[id]` and the photos tab; the polite live region of the upload progress) are not run: no 012b admin template is in the a11y suite yet, which TASK-301 adds ("the a11y and visual runs"). The live region exists (`MediaUploadForm`, `role="status"`, `aria-live="polite"`).
- 2026-11-11 (implementer, TASK-299): **T-23's e2e half** (no `<img>` on a public page for a pending photo): the storefront still renders from the seed manifest, so an uploaded photo reaches no public page until the database media provider lands with the cutover's media half. The rule is in place on both sides: `resolveMedia` refuses unapproved assets and now a file-name alt (`altIsFileName`, unit test), and `photoRendersIn` is the admin's view of the same rule.
- 2026-11-11 (implementer, TASK-299): the upload's `media.derive_variants` job ends `not_approved` for a pending public photo (the worker never publishes before approval, TASK-082); the approval enqueues it again and that run publishes the ladder. A lost enqueue after commit is recovered by approving again (idempotent worker).
- 2026-11-11 (implementer, TASK-299): `/admin/media` shows a placeholder tile with the short id, not a thumbnail: a pending photo has no variant and the private original is too heavy for a grid. A private thumbnail ladder is a later nicety.
- 2026-11-11 (implementer, TASK-299): main is red on two things outside this task: `tests/unit/ui-barrel.test.ts` (TASK-370's `RatingStars` and `StarRadioGroup` are not in the expected surface) and `tests/integration/media-derive-variants.test.ts` (its fixture inserts approved assets directly, which TASK-293's `review_write_guard()` refuses, `REVIEW_DIRECT_WRITE`). `pnpm check:no-db` also fails on `src/modules/analytics` (two `drizzle-orm` imports).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11: upload route, `src/modules/admin/media.ts` commands (upload, review through `attest()`, attach, alt), the metadata strip (`media-image.ts`), `/admin/media`, `/admin/media/[id]`, the photos tab, 143 admin texts; typecheck green. Next: tests (unit for the strip, integration T-22/T-23 on a scratch PG16), lint.
- 2026-11-11: tests green (unit 11 + 1, integration 10 on a local PG16); codebase map regenerated; `record-approval-299.py` written. Next: clean-env build in the build slot, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#548](https://github.com/itsahmeds/flowers-overseas/pull/548). AC-22: `POST /admin/api/media` (`media.upload`, a new permission for admin and content) refuses a body over 15 MiB before reading it and stops reading past it; `uploadPhoto` (`src/modules/admin/media.ts`) refuses a delivery photo, a florist photo with no florist and each missing provenance field (`MediaProvenanceSchema`, discriminated on `source`), then `cleanUploadedImage` (`media-image.ts`) refuses anything but JPEG, PNG or WebP by magic bytes (SVG, HEIC), more than 15 MiB and more than 40 MP from the header, and re-encodes in the same format with no EXIF, GPS, XMP, IPTC or ICC block; only then is the original put to the private bucket at `originals/{kind}/{assetId}`, one `media_asset` row written (`partner`: florist, its code as credit, its `terms_version` as licence; `ai`: generator, model, prompt hash, seed; `photo`: credit, licence) and one `media.derive_variants` job enqueued; a duplicate photo is refused by checksum. The worker takes an upload's ladder from its `depicts` (uuid keys only; settles TASK-082's open question, no schema change). AC-23: `attest()` refuses `no_supplier_terms` for a florist photo whose florist has no `terms_version`; `reviewPhoto` needs the four checks to approve and a note to reject, and enqueues the derive job on approval; `attachPhoto` refuses a pending or rejected main photo and a second main photo; `savePhotoAlt` refuses a file-name alt, removes an empty one, and the public `resolveMedia` refuses a file-name alt too (`altIsFileName`). Pages: `/admin/media` (grid, filters, upload form with a polite progress island), `/admin/media/[id]` (photo, checks, approve or reject, provenance), the product editor's Photos tab, the Photos nav entry. Tests: unit `admin-media-upload` (11), `ui-media-asset` (+1), `admin-permissions`, `review-attestation`; integration `admin-media` (10 on PG16: T-22, T-23, T-09's photo rows). 143 admin texts, `reviewed: false`; `.claude/state/record-approval-299.py`. No migration.
