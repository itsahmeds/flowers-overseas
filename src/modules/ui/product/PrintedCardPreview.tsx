/**
 * `PrintedCardPreview` — the card preview, **one component** on the product page and at checkout
 * step 2 (spec 042 §5.3.2, AC-10, AC-11, §13 Q4 (a); spec 004 §14 A21 clauses 3 and 5 as
 * A-founder-2026-10-20c amends them; `docs/design/system/motion-interactions.dc.html` motion 15;
 * the spec 042 bands of `docs/design/wireframes/{product,checkout}-{desktop,mobile}.dc.html`,
 * `.card42`; TASK-179, TASK-229, TASK-308).
 *
 * A server component: the white card **upright**, our mark, the buyer's words, at checkout the
 * signature under them, and the page's printed label as its caption. It **grows with its text**
 * (at least 190 px tall, no fixed ratio), so it always shows the whole message; a long unbroken
 * word wraps anywhere inside it, so the page never scrolls sideways (spec 004 AC-49).
 *
 * **The lines.** The words sit in a `<bdi dir="auto">` that carries `data-fo-mirror` with the id of
 * the field they come from, so the island that owns that field writes into its own preview: checkout's
 * `CardCounter` by that id, the product page's `CardMessageField` through the `[data-fo-card-text]`
 * line. The signature line works the same way with the "sign as" field's id. With JavaScript off
 * the server's own values show: the product page's labelled sample, checkout's kept message and
 * signature (spec 010 AC-10).
 *
 * **The sample and the hand-over** (product page only). The sample sentence comes first, in the
 * same grid cell as the words, so the card is as tall as the taller of the two and nothing moves
 * (spec 042 L2). While the sample shows, the words line is transparent; once the field has words,
 * the island marks the sample `aria-hidden="true"` and `globals.css` swaps the two. The crossfade
 * (`opacity`, `--duration-base`, `--ease-standard`) plays only where the build switch
 * `interactions.cardPreviewMotion` puts `data-fo-card-swap` on the cell (spec 042 §12), and only
 * under `prefers-reduced-motion: no-preference`; otherwise the swap is instant. Checkout passes no
 * sample: an empty card shows the mark and the caption, no words (PR 297 escalation 1, drawn as
 * today), and nothing there fades.
 *
 * **Caveat lives here and nowhere else** (A21 clause 3 as amended: the product page and checkout
 * step 2). `handFontVariables` puts the two Caveat faces in scope on this figure only, and only the
 * card's lines use `font-hand`; `../fonts/hand.ts` is imported by this file alone
 * (`tests/unit/product-card-preview.test.tsx`, `tests/unit/fonts.test.ts`). The faces are never
 * preloaded, so a browser fetches one only when a line is painted in it.
 *
 * **Printed, never handwritten** (founder, 2026-10-03; spec 042 §13 Q4): the caption says the card
 * is printed, whatever the face looks like.
 *
 * **One instance per card.** Every hook is keyed by the field ids it is given, so a page with
 * several cards (one per bouquet) renders one preview per card, each with its own field ids.
 */
import type { ReactElement } from "react";

import { interactions } from "@/config/interactions";

import { handFontVariables } from "../fonts/hand.ts";
import { Mark } from "../icons/Mark.tsx";

export interface PrintedCardPreviewProps {
  /** The id of the field whose words the message line mirrors. */
  readonly messageFieldId: string;
  /** The words the server holds (checkout's kept value); empty on the product page. */
  readonly message?: string;
  /** The labelled sample shown while there are no words (`catalog.addon.card.description`). */
  readonly sample?: string;
  /** The signature the server holds; the line is drawn when this or its field id is given. */
  readonly signature?: string;
  /** The id of the "sign as" field the signature line mirrors. */
  readonly signatureFieldId?: string;
  /** The page's printed label: `product.card.printed`, or checkout's `card.preview`. */
  readonly caption: string;
  /** The figure's accessible name (checkout's `card.previewLabel`). */
  readonly label?: string;
  readonly className?: string;
}

/** Caveat 500 at 22/1.25: the card's one face and size, on every line of words. */
const WORDS =
  "font-hand m-0 text-[22px] leading-[1.25] font-[500] wrap-anywhere whitespace-pre-line";

/** The sample and the words share one cell (motion 15: "both lines share one grid cell"). */
const SHARED_CELL = "col-start-1 row-start-1";

export function PrintedCardPreview({
  messageFieldId,
  message = "",
  sample,
  signature,
  signatureFieldId,
  caption,
  label,
  className,
}: PrintedCardPreviewProps): ReactElement {
  const swap = sample !== undefined && interactions.cardPreviewMotion;
  return (
    <figure
      aria-label={label}
      className={[
        handFontVariables,
        "bg-card m-0 grid min-h-[190px] w-full min-w-0 content-start gap-[12px] rounded-md p-[18px] shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--color-rule)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-card-preview
    >
      <Mark size={26} />
      <div className="grid" {...(swap ? { "data-fo-card-swap": "" } : {})}>
        {sample === undefined ? null : (
          <p
            aria-hidden={message === "" ? undefined : true}
            className={`${WORDS} ${SHARED_CELL} text-ink-3`}
            data-fo-card-sample
          >
            {sample}
          </p>
        )}
        <p className={`${WORDS} ${SHARED_CELL} text-ink`} data-fo-card-text>
          <bdi data-fo-mirror={messageFieldId} dir="auto">
            {message}
          </bdi>
        </p>
      </div>
      {signature === undefined && signatureFieldId === undefined ? null : (
        <p className={`${WORDS} text-ink`} data-fo-card-signature>
          <bdi data-fo-mirror={signatureFieldId} dir="auto">
            {signature}
          </bdi>
        </p>
      )}
      <figcaption className="border-rule text-ink-3 mt-auto border-t border-solid pt-[8px] text-xs">
        {caption}
      </figcaption>
    </figure>
  );
}
