/**
 * `SegmentedControl` — sizes on the phone (spec 004 §14 A24 clause 4 (b), AC-49; TASK-195; used by
 * TASK-197, and by TASK-187/188 where a choice is a URL).
 *
 * It reproduces the `.seg` of `docs/design/wireframes/product-mobile.dc.html`: a paper-3 pill track
 * with 4 px of padding, one equal segment per option, 52 px tall, the chosen one lifted onto card
 * white with a small shadow (a shape cue as well as a fill, so the choice is never colour alone).
 *
 * Two forms, one look:
 *
 *  - **radios** (`name` given): a `<fieldset>` and `<legend>` with one native radio per option, so
 *    it works with JavaScript off, submits with the page's `GET` form and moves with the arrow keys;
 *    the selection is the radio's `checked`;
 *  - **links** (`href` on every option): where the owning spec makes each option its own URL
 *    (spec 009's `?tier=`, TASK-128), each segment is a link and the chosen one carries
 *    `aria-current="true"`.
 *
 * The focus ring is drawn on the segment around the focused radio (`has-[:focus-visible]`), with
 * the system's ring values. Nothing here formats a price: a segment's `detail` is the caller's
 * string.
 */
import type { ReactElement, ReactNode } from "react";

export interface SegmentOption {
  readonly value: string;
  /** The option's name, bold (e.g. "Medium"). */
  readonly label: ReactNode;
  /** A second line (e.g. "15 stems"). */
  readonly detail?: ReactNode;
  /** Present on every option for the link form; absent on every option for the radio form. */
  readonly href?: string;
}

export interface SegmentedControlProps {
  readonly legend: ReactNode;
  readonly options: readonly SegmentOption[];
  /** The selected option's `value`. */
  readonly selected: string;
  /** The radios' field name. Omit for the link form. */
  readonly name?: string;
  /** Hide the legend visually (it stays the group's name). */
  readonly legendHidden?: boolean;
  readonly className?: string;
}

const TRACK =
  "bg-surface-muted grid auto-cols-fr grid-flow-col rounded-full p-[4px]";
const SEGMENT =
  "text-ink-muted grid min-h-[52px] content-center justify-items-center rounded-full px-[8px] text-center text-sm";
const SELECTED = "bg-card shadow-sm";
const FOCUS =
  "has-[:focus-visible]:[outline:var(--focus-ring)] has-[:focus-visible]:[outline-offset:var(--focus-offset)]";

function SegmentText({ option }: { readonly option: SegmentOption }) {
  return (
    <>
      <b className="text-ink text-ui">{option.label}</b>
      {option.detail === undefined ? null : <span>{option.detail}</span>}
    </>
  );
}

export function SegmentedControl({
  legend,
  options,
  selected,
  name,
  legendHidden = false,
  className,
}: SegmentedControlProps): ReactElement {
  return (
    <fieldset
      className={["m-0 min-w-0 border-0 p-0", className]
        .filter(Boolean)
        .join(" ")}
      data-fo-segmented={name === undefined ? "links" : "radios"}
    >
      <legend
        className={legendHidden ? "sr-only" : "text-ui mb-[10px] p-0 font-bold"}
      >
        {legend}
      </legend>
      <div className={TRACK}>
        {options.map((option) =>
          name === undefined ? (
            <a
              {...(option.value === selected
                ? { "aria-current": "true" as const }
                : {})}
              className={`${SEGMENT} ${option.value === selected ? SELECTED : ""}`.trim()}
              data-fo-segment={option.value}
              href={option.href}
              key={option.value}
            >
              <SegmentText option={option} />
            </a>
          ) : (
            <label
              className={`${SEGMENT} has-[:checked]:bg-card has-[:checked]:shadow-sm ${FOCUS} cursor-pointer`}
              data-fo-segment={option.value}
              key={option.value}
            >
              <input
                className="sr-only"
                defaultChecked={option.value === selected}
                name={name}
                type="radio"
                value={option.value}
              />
              <SegmentText option={option} />
            </label>
          ),
        )}
      </div>
    </fieldset>
  );
}
