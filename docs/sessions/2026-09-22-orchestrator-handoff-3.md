# Session handoff — 2026-09-22 (orchestrator, day 5)

Read this, then `TASKS.md` (the Log's last ~30 rows — several agents were still running when this
was written, so their outcomes are in the log, not here), then `CLAUDE.md`. The standing rules in
`docs/sessions/2026-09-18-orchestrator-handoff-2.md` are still valid except where this file
supersedes them.

## The one-line state

**85 / 144 tasks done.** Six PRs merged this session. The site browses in four locales with real
photographs; it does not sell, and **its shop is still unreachable from the home page** — that is
TASK-113, in flight.

## What changed that matters

| | |
|---|---|
| **CI grew teeth** | PR 90 gave the browser suites an origin CI owns. **`e2e` (828), `a11y` (83) and `visual` had never executed on any PR in this project's history** — 85 merged PRs judged by lint, types, units and Lighthouse alone. They run now. |
| **294 shop URLs** | PR 89 (country category + occasion) and PR 88 (the hubs). Verified clean on canonicals and hreflang across all 294. |
| **Images are on R2** | The 6 MB committed-media cap is gone. `media.flowersoverseas.com` is connected to the bucket (EU jurisdiction) and serving. PR 94 carries the code; **not merged** — see the open blocker. |
| **Sitemaps + JSON-LD** | PRs 84 and 87. The schema validator could not fail before 87; it can now. |
| **144 image prompts** | TASK-144. `content/imagery/remaining-images.csv`, one row per image with the prompt inline, Mother's Day first. The founder is generating them. |

## The blocker that decides PR 94

`lighthouse` is **red**: LCP 2,248 ms (`/en`) and 2,238 ms (`/pl`) against a ≤ 2,000 ms budget.
Cause is PR 94 itself — the hero photograph moved to a third-party origin, putting DNS + TCP + TLS
on the LCP critical path. `media.flowersoverseas.com` (same Cloudflare zone) plus a `preconnect`
is the fix being measured. **Do not lower the budget, remove a URL from `lighthouse-urls.json`, or
mark the job `continue-on-error`** — `/review 90` settled that demoting a gate takes a spec
amendment, not a workflow edit.

## What the founder still owes, and nothing else

1. **The 144 images.** Rows 1–14 of the CSV are Mother's Day, whose page renders **no photograph at
   all** — no Mother's Day product has an approved asset. Originals go in
   `.local/imagery/originals/{assetId}.png`, long edge ≥ 2000 px. **Record the rejection count**:
   ADR-0014 wants it as a risk measure and the first run recorded none, so it is unmeasured rather
   than zero.
2. **An EU phone number.** `src/config/company.ts` ships `+1 (213) 592-5150` — a Los Angeles number
   beside "Mon–Sat 8–20 CET", also in `tel:`, the WhatsApp link and the `Organization` JSON-LD.
   TASK-140(b). **Do not invent one.**
3. **`de`/`pl` category and occasion slugs** (TASK-106). Without them two of four locales ship
   English-only: the depth-4 pages emit **no page and no alternate** for `de`/`pl` today.

## Rules added this session, all of them paid for

- **No assertion may pass with its subject removed.** *Nine* defects of this class were found in
  two days — a validator that could not fail, an AC proved in prose, `[200, 404]` over the only two
  reachable statuses (twice), a descriptor term deletable at two links and **fail-open**, an
  uploader's size cap and watermark refusal both neutered with 4,357 tests green, and hub tests
  with no AC-24 assertion at all. Every one was caught by a reviewer **mutating the subject**, never
  by reading. The line, settled: the rule is not "never assert over a set", it is **"the assertion
  must be able to fail"**. `[301, 308]` was inspected and *kept*. TASK-143 sweeps `main` for the
  rest.
- **Merging (founder's instruction).** The orchestrator merges on a recorded `/review` pass plus
  green CI **against the head being merged** — check the SHA; `statusCheckRollup` reports the latest
  run, not necessarily one against the current head. I got this wrong on PR 88 and merged a tree
  that had never been through CI.
- **CI re-runs need a label toggle**, not `gh workflow run`. A dispatch cannot reach `preview` and
  therefore never reaches `e2e`/`visual`/`a11y` — it re-runs exactly the half that was already
  green. A push to a ready, labelled PR fires nothing at all.
- **The build slot is a lock** (`.claude/bin/build-slot.sh`), not a `pgrep`. The old pattern matched
  the waiting shell's own command line, so waiters blocked each other; it is the likeliest cause of
  the 346-, 243- and 199-minute runs. Kill only your own PID on release — a broad
  `pkill -f "next-server"` took out a sibling's server.

## Things that bit, so they do not bite again

- **Three orchestrator commits to `main` broke a test they did not run.** Run the touched suite
  before every commit, and read the checker's exit code — piping it to `tail` hides the failure.
- `.claude/bin/task.sh clear` was a **silent no-op from a worktree** (fixed). Its mirror image
  survives: the worktree's own pointer file is not removed when clearing from the main checkout.
- Probing a mis-cased URL against a local `pnpm start` **corrupts the build on macOS** — APFS is
  case-insensitive, so the 404 Next writes lands on the real page's prerendered file, which then
  serves "Page not found" until a rebuild. Delete `.next` after any such probe.
- `tests/unit/dev-os.test.ts` "leaves this repository's active-task pointer untouched" times out at
  5 s under load and passes alone. Environmental, confirmed three times.
- **`main`'s `country-shop-{desktop,mobile}` darwin baselines are stale** — PR 88's squash
  overwrote newer ones. CI compares `linux/`, so this bites only a local `pnpm test:visual` on a
  Mac. TASK-139 can absorb it.

## Open PRs at close

`gh pr list --repo itsahmeds/flowers-overseas` for the truth. At writing: **93** (sort and
pagination — passed review, on its third rebase), **94** (R2 — blocked on the LCP number), **96**
(product page existence set), **97** (delivery calendar, draft), **95** (Linux baselines, draft),
**92** (competitor benchmark artboards — founder has not looked yet), **86** (locale dialog, draft,
conflicting).

## Where the UI actually stands

The competitor benchmark (PR 92) measured four competitors from the live DOM and **contradicts the
founder's complaint on desktop**: chrome before content is 183 px, mid-field against 128 / 143 /
174 / 200, and the card is 70.1 % photograph, inside the field's range. **No desktop change is
proposed.** Mobile is the real defect — 245 px of chrome (30.2 %) against 57 / 107 / 154 / 156, and
the listing reaches its first product at **779 of 812 px**, where Bloom & Wild reaches it at 386.
Neither comparator prints any body prose above a grid on a phone; we print 252 px of it.

My own earlier "377 px / 42 %" figure was wrong and is retracted in the log.
