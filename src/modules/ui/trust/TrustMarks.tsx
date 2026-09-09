/**
 * `TrustMarks` — the slot with an explicit empty state (spec 004 §2 "Footer", §5.3, §8 "Reviews
 * and trust", Phase 0 AC 6; TASK-049).
 *
 * The one component in the design system whose Phase-0 job is to render **nothing**, and to
 * render nothing *visibly*: no payment logo (no live method, and the marks are third-party
 * trademarks), no Trustpilot badge, no star, no rating, no review count, no "as featured in"
 * strip, and — the clause that makes this a component instead of a deletion — **no reserved
 * box**. §5.3: "Empty renders nothing visible and no reserved box, so there is no hole in the
 * footer". A placeholder rectangle waiting for a badge is a promise the site cannot keep and a
 * layout shift the day it is filled; returning `null` is both honest and free.
 *
 * It is not `TrustStrip` (TASK-053): that renders three claims that are true today. This renders
 * *marks* — third-party attestations — and we have none. When one exists (a signed processor
 * agreement's logo licence, or the first real reviews of `plan/07` §7), the task that ships it
 * fills `marks` and this component grows a populated branch; until then the empty state is the
 * whole component and `tests/unit/site-footer.test.tsx` pins it.
 */
import type { ReactElement } from "react";

/**
 * A mark, for the state a later spec ships. Declared rather than inferred so the shape of the
 * eventual data is on the record. `name` is **data, not copy** — "Trustpilot" is a proper noun
 * and is never translated, the same rule `payment-methods.ts` follows — and `licenceRef` is
 * mandatory, because a badge we may not legally display is worse than no badge.
 */
export interface TrustMark {
  readonly id: string;
  /** The mark's own name. A proper noun: data, never a message key. */
  readonly name: string;
  /** Where the right to display it comes from (an agreement id, a licence URL). */
  readonly licenceRef: string;
}

export interface TrustMarksProps {
  /** Empty in Phase 0, and empty means *nothing rendered* — not an empty box. */
  readonly marks?: readonly TrustMark[];
}

export function TrustMarks({
  marks = [],
}: TrustMarksProps): ReactElement | null {
  if (marks.length === 0) return null;
  // Names as **text**, not images: an image would need a trademark licence and an `alt` string,
  // and the spec that acquires the first licence is the one that may add the asset (§8). A list
  // needs no accessible name of its own, so this branch introduces no message key either — which
  // is what keeps `pnpm i18n:check` free of a key nothing renders.
  return (
    <ul className="text-ink-subtle text-xs">
      {marks.map((mark) => (
        <li key={mark.id}>{mark.name}</li>
      ))}
    </ul>
  );
}
