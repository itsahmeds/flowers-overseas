/**
 * `PrintedCardPreview` — the card the buyer's words will be printed on (spec 004 §14 A21 clauses 3
 * and 5; `docs/design/system/components.dc.html` "Printed card preview"; `docs/design/wireframes/
 * product-{desktop,mobile}.dc.html`; TASK-179).
 *
 * A server component: a cornflower-wash stage with the white card on it, tilted, the logo mark,
 * the message line and the "Printed on our card · included" label. Without JavaScript the message
 * line is the labelled sample sentence; `CardMessageField`, the page's one island, replaces it
 * with what the buyer types (`data-fo-card-text`).
 *
 * **Caveat lives here and nowhere else** (A21 clause 3). `handFontVariables` puts the two Caveat
 * faces in scope on this figure only, and only the message line uses `font-hand`; `./fonts/hand.ts`
 * is imported by this file alone (`tests/unit/product-card-preview.test.tsx`). The faces are never
 * preloaded, so a browser fetches one only when this line is painted.
 *
 * **Printed, never handwritten** (founder, 2026-10-03): the label says so in words, whatever the
 * face looks like.
 */
import type { ReactElement } from "react";

import { handFontVariables } from "../fonts/hand.ts";
import { Mark } from "../icons/Mark.tsx";

export interface PrintedCardPreviewProps {
  /** The sample sentence shown until the buyer types (`catalog.addon.card.description`). */
  readonly sample: string;
  /** "Printed on our card · included" (`product.card.printed`). */
  readonly printed: string;
  readonly className?: string;
}

export function PrintedCardPreview({
  sample,
  printed,
  className,
}: PrintedCardPreviewProps): ReactElement {
  return (
    <figure
      className={[
        handFontVariables,
        "bg-sage-wash rounded-photo relative m-0 grid aspect-[4/5] place-items-center p-[28px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-card-preview
    >
      <div className="bg-card shadow-paper flex aspect-[5/6] w-[78%] rotate-(--tilt-card) flex-col rounded-md px-[24px] py-[26px]">
        <Mark className="mb-[14px] shrink-0" size={26} />
        <p
          className="font-hand text-lg-s text-ink-subtle data-[fo-card-text=typed]:text-ink m-0 flex-1 overflow-hidden leading-[1.25] font-[500] break-words whitespace-pre-line md:text-lg"
          data-fo-card-text="sample"
        >
          {sample}
        </p>
        <p className="text-ink-subtle m-0 mt-[10px] text-xs font-bold tracking-(--tracking-label) uppercase">
          {printed}
        </p>
      </div>
    </figure>
  );
}
