# Imagery generator — commercial-use terms

| Field | Value |
| --- | --- |
| Status | **Filed 2026-09-18.** Generator: **OpenAI ChatGPT**, model **`gpt-image 2.0`** (as the C2PA manifest of every original names it: `OpenAI Media Service API`, `softwareAgent gpt-image 2.0`). Terms copy: `imagery-generator-terms-texts-2026-09-18.md` (verbatim capture, 2026-09-18 ≈ 08:00 UTC). Three account facts (residence country, plan, training toggle) **not supplied — founder declined 2026-09-18 ("just build")**; see §Answers for why none is a condition of the commercial-use grant. |
| Owner | Ahmed (founder) |
| Required by | ADR-0014 ("check generator terms for commercial use"), spec 006 §8, AC-29 |
| Blocks | nothing since 2026-09-18 — TASK-080 may commit image bytes; the 31 originals were approved by the founder 2026-09-18 07:30Z / 07:45Z |
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

## Answers (filed 2026-09-18, read by the orchestrator; founder accepted the filing without the three account facts)

Quotations are from the captured texts in `imagery-generator-terms-texts-2026-09-18.md` (Terms of Use published/effective 2026-01-01; EU Terms of Use for EEA/UK residents; Usage Policies; Sharing & Publication Policy; Privacy Policy as captured).

1. **Generator and model.** `generator: "OpenAI ChatGPT"`, `generatorModel: "gpt-image 2.0"` — TASK-080 swaps the `to-be-confirmed` placeholder on the 31 `seed/data/media.json` rows and the 13 prompt files, re-hashes, and `seed:check` must pass.
2. **Terms as they stood.** Verbatim copies in the appendix file, not links.
3. **Commercial use** — allowed. The Terms grant the user the right to use Output "for any purpose, including commercial purposes such as sale or publication", subject to the Terms and Usage Policies. No clause conditions this on plan tier.
4. **Ownership** — "As between you and OpenAI, and to the extent permitted by applicable law, you (a) retain your ownership rights in Input and (b) own the Output. We hereby assign to you all our right, title, and interest, if any, in and to Output." Not conditional on a paid plan remaining active; the assignment is not revoked on cancellation.
5. **Attribution** — not required by the Terms. Our own honesty label ("Example arrangement · your florist hand-makes each one", spec 006 AC-17) is a consumer-law measure, not a licence condition.
6. **Exclusivity** — none: "Due to the nature of our Services … Output may not be unique and other users may receive similar output". Accepted; the images are illustrations of a style, not the delivered product.
7. **Training on inputs** — consumer ChatGPT may use content to improve models unless the user opts out via the data-controls / privacy portal. Our prompts carry no personal data (spec 006 §8), so this is a confidentiality question only; the prompts are already public in this repository, so the toggle's state is immaterial to the record. *Founder did not state the toggle's state.*
8. **C2PA / content credentials** — present on every original (manifest issuer "OpenAI Media Service API", plus a SynthID watermark). **Carry-forward to TASK-080:** the AVIF/WebP re-encode strips the manifest; keep the originals (with manifests) in the Drive store of record and in `.local/imagery/originals/`, and record the manifest hash per asset in `media.json` so provenance stays verifiable even though the served derivative cannot carry it.
9. **Restricted-use list** — nothing in the Usage Policies touches flowers, funerals or product advertising; the relevant prohibitions (deception, impersonation, sexual content, minors, violence) are not engaged by botanical product illustration.
10. **Account facts not filed.** Residence country of the account, plan, and whether the training toggle is off were requested and **declined by the founder on 2026-09-18**. None of them is a condition of clauses 3–6 above: the commercial-use grant and the Output assignment apply to all plans and both the RoW and EU terms. The record is therefore complete for ADR-0014's purpose; the three facts can be appended later without reopening TASK-080.
11. **Read by** the orchestrator (Claude), 2026-09-18; **filing accepted by** Ahmed (founder), 2026-09-18.

## The swap, landed (TASK-080, 2026-09-18)

- `generator` / `generatorModel` are now `OpenAI ChatGPT` / `gpt-image 2.0` on all 31
  `seed/data/media.json` rows and in all 31 prompt records; `tests/unit/imagery-prompts.test.ts`
  pins **those** values against this file, so the data and the compliance record cannot name
  different generators. The placeholder appears nowhere in either, which the same test asserts.
- Re-hashing every prompt record was intended and happened: `promptHash` covers the model, so the
  change arrived as one whole-manifest diff rather than a silent edit.
- Every asset is `reviewState: "approved"` (`reviewedBy: founder`, 2026-09-18 07:30Z / 07:45Z), the
  bytes are derived and committed, and the pages render them under the honesty label.
- **Clause 8 is discharged in data.** Every `ai` row records `originalSha256` — the digest of the
  original that carries the C2PA manifest and the SynthID watermark — and `derivativeC2pa:
  "stripped"`, because the AVIF/WebP re-encode cannot carry a JUMBF-boxed manifest. The originals
  stay in the Drive store of record and in `.local/imagery/originals/`; the verification path is
  written down in `docs/runbooks/imagery.md` §3.

## Until it was filed (historical — superseded 2026-09-18)

- `generator` and `generatorModel` were the literal string `to-be-confirmed` on all 31 demo assets
  and in all 31 prompt records, pinned by a test that named this file, so the placeholder could not
  quietly become permanent.
- Every asset stayed `reviewState: "pending"`, which meant no image rendered (spec 006 AC-18) — and
  there were no committed image bytes either.

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
