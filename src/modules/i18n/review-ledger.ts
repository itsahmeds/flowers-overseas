/**
 * The review ledger's entry points for the rest of the application (spec 012b §5.2
 * `src/modules/i18n`: `attest`, `requestChange`, `reviewState`; TASK-293).
 *
 * Thin and database-free at load time: each call loads `./db/ledger.ts` on first use, so the
 * module's barrel (which the request proxy and every page import) pulls no SQL builder into a
 * bundle that never records a review. The writer itself, and why it is the only one, is
 * `./db/ledger.ts`.
 */
import {
  type AttestInput,
  type AttestOutcome,
  type RequestChangeInput,
  RequestChangeInputSchema,
  type ReviewState,
  type Subject,
  SubjectSchema,
} from "./attestation.ts";

/**
 * A signed-in reviewer's decision on one subject (AC-10, AC-11). Refusals write nothing and come
 * back as `{ ok: false, refusal, status }`; the admin action answers with `status`.
 */
export async function attest(input: AttestInput): Promise<AttestOutcome> {
  const ledger = await import("./db/ledger.ts");
  return ledger.attest({ channel: "admin", input });
}

/** A change request: an attestation with `changes_requested` and a note (refused without one). */
export async function requestChange(
  input: RequestChangeInput,
): Promise<AttestOutcome> {
  const parsed = RequestChangeInputSchema.parse(input);
  return attest({ ...parsed, decision: "changes_requested" });
}

/** The review state of one subject now (reviewed, edited, stale, imported and not re-read). */
export async function reviewState(subject: Subject): Promise<ReviewState> {
  const ledger = await import("./db/ledger.ts");
  return ledger.reviewState(SubjectSchema.parse(subject));
}
