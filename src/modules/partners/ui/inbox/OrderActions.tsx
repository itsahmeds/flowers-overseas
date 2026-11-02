/**
 * The order page's actions and their states (spec 011 §2 "Actions", "The delivery photo", §5.3;
 * artboard `florist-inbox-*`: `.fr-dock`, `.fr-reasons`, `.fm-notice`, `.fr-photo`; TASK-215).
 *
 *  - `InboxDock`: the actions docked at the thumb, sticky at the bottom, 56 px targets; `wide`
 *    is Decline beside Accept.
 *  - `DeclineReasons`: the five reasons as a radio list with its legend, the first chosen, so a
 *    no-JS post always carries one of the closed list.
 *  - `InboxNotice`: the already-answered and changed lines (`warn`, `role="alert"`) and the photo
 *    received line (`ok`, `role="status"`).
 *  - `DeliveredPhoto`: the florist's own photo, from the same-origin photo route (which reads it
 *    through a five-minute signed URL).
 *
 * Presentational: every word and every URL arrives as a prop. Logical properties only.
 */
import type { ReactElement, ReactNode } from "react";

import { ChevronIcon } from "./parts.tsx";

export function InboxDock({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  /** Decline beside Accept (`.fr-dock.wide`). */
  readonly wide?: boolean;
}): ReactElement {
  return (
    <div
      className="bg-paper border-rule sticky bottom-0 z-20 border-t px-[20px] pt-[12px] pb-[16px] shadow-(--shadow-sticky) md:px-[56px]"
      data-fo-inbox-dock
    >
      <div
        className={`grid gap-[10px] md:mx-auto md:max-w-[608px] ${wide ? "grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]" : "auto-cols-[minmax(0,1fr)] grid-flow-col"}`}
      >
        {children}
      </div>
    </div>
  );
}

export interface DeclineReasonOption {
  readonly value: string;
  readonly label: string;
}

export function DeclineReasons({
  legend,
  options,
}: {
  readonly legend: string;
  readonly options: readonly DeclineReasonOption[];
}): ReactElement {
  return (
    <fieldset
      className="m-0 grid min-w-0 gap-[14px] border-0 p-0"
      data-fo-decline-reasons
    >
      <legend className="font-display mb-[8px] p-0 text-[30px] leading-[1.1] font-normal">
        {legend}
      </legend>
      <div className="bg-card overflow-hidden rounded-(--radius-photo-s) shadow-[inset_0_0_0_1px_var(--color-rule)]">
        {options.map((option, index) => (
          <label
            key={option.value}
            className="border-rule text-body-s has-[:checked]:bg-sage-wash flex min-h-[56px] cursor-pointer items-center gap-[14px] border-b px-[16px] last:border-b-0 has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px]"
          >
            <input
              className="size-[22px] flex-none accent-(--color-selected)"
              type="radio"
              name="reason"
              value={option.value}
              defaultChecked={index === 0}
              required
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The decline step: back to the order (its product's name), then the reasons (`.fr-back`). */
export function DeclineStep({
  backHref,
  backLabel,
  legend,
  options,
}: {
  readonly backHref: string;
  readonly backLabel: string;
  readonly legend: string;
  readonly options: readonly DeclineReasonOption[];
}): ReactElement {
  return (
    <div className="grid gap-[24px]" data-fo-decline-step>
      <a
        className="text-link -my-[8px] -mb-[12px] inline-flex min-h-(--target-min) items-center gap-[4px] justify-self-start font-bold no-underline"
        href={backHref}
      >
        <ChevronIcon back />
        {backLabel}
      </a>
      <DeclineReasons legend={legend} options={options} />
    </div>
  );
}

/** Each notice tone's ground and role (artboard `florist-inbox-*`, `.fm-notice`). */
const NOTICE_TONES = {
  warn: { ground: "bg-blush", role: "alert" },
  ok: { ground: "bg-leaf-wash", role: "status" },
  // Spec 026a: the paused notice, plain text on the paper ground with the rule, not a colour.
  note: {
    ground: "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)]",
    role: "note",
  },
} as const;

export function InboxNotice({
  tone,
  children,
  id,
}: {
  readonly tone: keyof typeof NOTICE_TONES;
  readonly children: ReactNode;
  readonly id?: string;
}): ReactElement {
  return (
    <p
      className={`text-ui text-ink m-0 grid gap-[6px] rounded-(--radius-field) px-[18px] py-[16px] leading-(--line-height-tight) ${NOTICE_TONES[tone].ground}`}
      role={NOTICE_TONES[tone].role}
      data-fo-order-notice={tone}
      {...(id === undefined ? {} : { id })}
    >
      {children}
    </p>
  );
}

export function DeliveredPhoto({
  src,
  alt,
}: {
  readonly src: string;
  readonly alt: string;
}): ReactElement {
  return (
    <div
      className="aspect-[4/5] max-w-[420px] overflow-hidden rounded-(--radius-photo-s)"
      data-fo-delivered-photo
    >
      {/* A plain `<picture>`, as the tracking page draws its photo: `next/image` would route a
          private photo through the image optimiser and its cache. */}
      <picture className="contents">
        <img
          className="bg-paper-3 block size-full object-cover"
          src={src}
          alt={alt}
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </picture>
    </div>
  );
}
