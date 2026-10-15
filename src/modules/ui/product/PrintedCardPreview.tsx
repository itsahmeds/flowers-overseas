/**
 * `PrintedCardPreview` — the card the buyer's words will be printed on (spec 004 §14 A21 clauses 3
 * and 5; `docs/design/wireframes/product-{desktop,mobile}.dc.html`, `.pv-card .card-paper`;
 * TASK-179, TASK-229).
 *
 * A server component, drawn as the round-2 artboards draw it beside the message field: the white
 * card **upright** (no tilt, no stage behind it), the full width of its column, with the logo
 * mark and the message line. It **grows with its text** (no fixed aspect ratio, at least 190 px
 * tall), so the preview always shows the whole message the buyer typed: what is shown is what
 * will be printed, and nothing is cut without a sign. A long unbroken word (a link, "WWWW…")
 * wraps anywhere inside the card, so the page never scrolls sideways (spec 004 AC-49).
 *
 * Without JavaScript the message line is the labelled sample sentence; `CardMessageField`, the
 * page's one island, replaces it with what the buyer types (`data-fo-card-text`).
 *
 * **Caveat lives here and nowhere else** (A21 clause 3). `handFontVariables` puts the two Caveat
 * faces in scope on this figure only, and only the message line uses `font-hand`; `./fonts/hand.ts`
 * is imported by this file alone (`tests/unit/product-card-preview.test.tsx`). The faces are never
 * preloaded, so a browser fetches one only when this line is painted.
 *
 * **Printed, never handwritten** (founder, 2026-10-03): the page labels the card "Printed on our
 * card · included" in words under the field, whatever the face looks like.
 */
import type { ReactElement } from "react";

import { handFontVariables } from "../fonts/hand.ts";
import { Mark } from "../icons/Mark.tsx";

export interface PrintedCardPreviewProps {
  /** The sample sentence shown until the buyer types (`catalog.addon.card.description`). */
  readonly sample: string;
  readonly className?: string;
}

export function PrintedCardPreview({
  sample,
  className,
}: PrintedCardPreviewProps): ReactElement {
  return (
    <figure
      className={[
        handFontVariables,
        "bg-card m-0 flex min-h-[190px] w-full min-w-0 flex-col rounded-md p-[18px] shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-card-preview
    >
      <Mark className="mb-[14px] shrink-0" size={26} />
      <p
        className="font-hand text-ink-subtle data-[fo-card-text=typed]:text-ink m-0 text-[22px] leading-[1.25] font-[500] wrap-anywhere whitespace-pre-line"
        data-fo-card-text="sample"
      >
        {sample}
      </p>
    </figure>
  );
}
