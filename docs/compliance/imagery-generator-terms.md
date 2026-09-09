# Imagery generator — commercial-use terms

| Field | Value |
| --- | --- |
| Status | **pending** — the founder has not yet named the generator |
| Owner | Ahmed (founder) |
| Required by | ADR-0014 ("check generator terms for commercial use"), spec 006 §8, AC-29 |
| Blocks | approving any generated asset (`reviewState: "approved"`), committing image bytes (TASK-080) |
| Does not block | TASK-077 — the prompt records, the provenance data and the style guide ship with a labelled placeholder |

## Why this file exists

ADR-0014 accepted AI-generated catalogue imagery **conditional on** two things: honest labelling on
every page, and the generator's commercial-use terms being checked. The label is enforced in code
(spec 006 AC-17). The terms are a founder action with a filed answer, and this is the file the
answer goes in. Spec 006 §8 names it explicitly, and AC-29 asserts it exists.

Nothing here is invented. No generator is named, no terms are summarised and no rights are claimed,
because doing any of that from a specification would be a compliance record that says whatever the
author guessed. The record is worth exactly what the founder files.

## What the founder must file here

1. **The generator and the model**, by name and version, exactly as they will appear in
   `generator` / `generatorModel` in `seed/data/media.json` and every
   `content/imagery/prompts/*.json` record.
2. **The terms as they stood on the day of generation** — a copy of the licence or terms-of-service
   text (or a PDF print), not a link. A URL that changes later is not evidence.
3. **Answers, quoted from those terms**, to:
   - May the outputs be used **commercially**, on a site that sells goods?
   - Who **owns** the outputs, and is ownership conditional on a paid plan remaining active?
   - Is **attribution** to the generator required, and if so where must it appear?
   - Are outputs **exclusive**, or may the provider serve a similar image to another customer?
   - Does the provider **train on our prompts or inputs**, and can that be switched off? (Our
     prompts contain no personal data — spec 006 §8 — so this is a confidentiality question, not a
     GDPR one.)
   - Does the provider embed **C2PA / content-credential metadata**? Ours must be preserved; the
     pipeline strips EXIF/GPS only (spec 006 §2.4, `plan/01` §6).
   - Is there a **restricted-use list** touching flowers, funerals or advertising?
4. **The date and the person** who read them, so the record can be re-checked when the terms change.

## Until it is filed

- `generator` and `generatorModel` are the literal string `to-be-confirmed` on all 31 demo assets
  and in all 31 prompt records. `tests/unit/imagery-prompts.test.ts` pins that value and names this
  file, so the placeholder cannot quietly become permanent.
- Every asset stays `reviewState: "pending"`, which means no image renders (spec 006 AC-18) —
  there are no committed image bytes yet either.
- Confirming the generator re-hashes every prompt record (the hash covers the model), so the change
  arrives as one whole-manifest diff rather than a silent edit. That is intended.

## The related legal items that are *not* this file's

Two questions go to the lawyer on the October legal-drafts list (`plan/07` §11, spec 006 §13 Q8) and
do not block Phase 0, because no money changes hands during the demo phase:

1. Does "Example arrangement · your florist hand-makes each one" satisfy the UCPD/CRD and the German
   and Polish transpositions for AI-generated product illustration, and should it also appear in the
   checkout summary and the confirmation email?
2. Does the **EU AI Act Art. 50** transparency duty reach us as a *deployer* of AI-generated product
   imagery, or only the generative system's provider? The reading recorded in spec 006 §8 is that a
   labelled, non-deceptive product illustration is outside Art. 50(2)/(4) — and provenance is per-
   asset data, so if that reading is wrong the fix is a configuration change rather than a rebuild.
