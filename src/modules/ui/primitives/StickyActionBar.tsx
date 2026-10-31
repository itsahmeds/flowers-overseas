/**
 * `StickyActionBar` — the phone's docked primary action (spec 004 §14 A24 clause 4 (a), AC-48;
 * TASK-195 for the primitive; TASK-196, TASK-197, TASK-182 and TASK-183 mount it).
 *
 * It reproduces the `.dock` of `docs/design/wireframes/home-mobile.dc.html` and
 * `product-mobile.dc.html`: a card-white bar on the viewport's foot with a rule and the sticky
 * shadow above it, an optional price on the inline start (caption over the amount, in the display
 * face) and the action filling the rest. Below `md` only; from `md` up it is `display: none`.
 *
 * The rules it must keep live in one place, `src/app/globals.css` (`@utility action-bar` and the
 * `body:has([data-fo-action-bar])` block after it):
 *
 *  - **opaque**: `--color-card`, alpha 1 (the artboard's 96 % mix would let text show through);
 *  - **the safe area**: the bar's block size and its `padding-block-end` both add
 *    `env(safe-area-inset-bottom)`, and the document's foot is padded by the same amount, so at
 *    the bottom of the page no content box sits under the bar;
 *  - **the consent sheet never covers the action**: while a bar is on the page the sheet stands on
 *    top of it rather than over it;
 *  - **CLS 0**: it is `position: fixed` and hides by a transform (`hidden`), so showing or hiding
 *    it moves nothing.
 *
 * **It repeats, it never replaces.** Every action in it has a twin in the page's flow, or is an
 * in-page link to one (`#send`, `#buy`), so with JavaScript off nothing is lost. A price in it is
 * the caller's formatted string from **the same projection** the visible selected price prints
 * (price shown = price charged); this component formats nothing.
 */
import type { ReactElement, ReactNode } from "react";

import { Button } from "./Button.tsx";

/**
 * A twin of one of the page form's submits (the checkout entry, spec 010 AC-5): a `<button>` of
 * that form by its `form` id, posting where the flow's twin posts, so the bar submits the same
 * selection and adds no control the page lacks. Works with JavaScript off.
 */
export interface StickySubmit {
  /** The `id` of the page's form the twin belongs to. */
  readonly form: string;
  readonly formAction: string;
  readonly name: string;
  readonly value: string;
  readonly label: ReactNode;
  /** `accent` for the live action, `ghost` for every other (the board's `.btn ghost`). */
  readonly look: "accent" | "ghost";
  /** As wide as its label (the board's "Add to basket", `flex: none`), not the rest of the bar. */
  readonly narrow?: boolean;
}

/** The two looks the board draws in the dock: the poppy action and the ghost outline. */
const SUBMIT_LOOK = {
  accent: "bg-accent text-on-accent hover:bg-accent-strong",
  ghost:
    "bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] hover:bg-surface-muted",
} as const;

export interface StickyActionBarProps {
  /**
   * The action, **an in-page link to its twin in the flow** (`#buy`, `#send`): the bar repeats the
   * page's action and never replaces it, so the type admits nothing but a fragment and the render
   * refuses anything else that slips past it (PR 208 breaker hole 3). There is no `children`
   * slot, so a bar cannot carry a control the page lacks.
   */
  readonly action: { readonly href: `#${string}`; readonly label: ReactNode };
  /**
   * In place of `action`'s link, the twins of the page form's submits (the product page's
   * checkout entry, `product-mobile.dc.html` "the docked bar with Add to basket"): the bar then
   * draws these buttons and no price. Each must name its form.
   */
  readonly submits?: readonly StickySubmit[] | undefined;
  /**
   * The selected price, already formatted by `formatMoney` from the same view the page prints it
   * from (a string, or that string in an element the page keeps in step, as the product page's
   * size slot), and its caption (e.g. the size). Omitted on a bar with no price (the home).
   */
  readonly price?:
    { readonly amount: ReactNode; readonly caption?: ReactNode } | undefined;
  /** Hidden until the page decides to show it (e.g. once the hero has scrolled out). */
  readonly hidden?: boolean;
  readonly className?: string;
}

export function StickyActionBar({
  action,
  submits,
  price,
  hidden = false,
  className,
}: StickyActionBarProps): ReactElement {
  if (!/^#[^\s#]+$/u.test(action.href)) {
    throw new Error(
      `StickyActionBar: the action must be an in-page link to its twin in the flow (#id), got "${action.href}"`,
    );
  }
  for (const submit of submits ?? []) {
    if (!/^[A-Za-z][\w-]*$/u.test(submit.form)) {
      throw new Error(
        `StickyActionBar: a submit must name the page form it repeats (form id), got "${submit.form}"`,
      );
    }
  }
  if (submits !== undefined && submits.length > 0) {
    return (
      <div
        className={["action-bar md:hidden", className]
          .filter(Boolean)
          .join(" ")}
        data-fo-action-bar={hidden ? "hidden" : "shown"}
      >
        <div className="flex min-w-0 flex-1 gap-[10px]">
          {submits.map((submit) => (
            <button
              className={`inline-grid min-h-[52px] cursor-pointer place-items-center rounded-full text-center leading-[1.15] font-bold ${
                submit.narrow === true
                  ? "flex-none px-[16px]"
                  : "min-w-0 flex-1 px-[20px]"
              } ${SUBMIT_LOOK[submit.look]}`}
              form={submit.form}
              formAction={submit.formAction}
              formMethod="post"
              key={submit.value}
              name={submit.name}
              type="submit"
              value={submit.value}
            >
              {submit.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className={["action-bar md:hidden", className].filter(Boolean).join(" ")}
      data-fo-action-bar={hidden ? "hidden" : "shown"}
    >
      {price === undefined ? null : (
        <p className="m-0 grid leading-[1.15]" data-fo-action-bar-price>
          {price.caption === undefined ? null : (
            <small className="text-ink-subtle text-xs">{price.caption}</small>
          )}
          <strong className="display num text-md">{price.amount}</strong>
        </p>
      )}
      <div className="flex min-w-0 flex-1 [&>*]:min-h-[52px] [&>*]:flex-1">
        {/* An in-page jump to its twin, never a page load, so motion 3's pending state (which
            waits for the next page) is off (TASK-283). */}
        <Button href={action.href} pending={false} variant="accent">
          {action.label}
        </Button>
      </div>
    </div>
  );
}
