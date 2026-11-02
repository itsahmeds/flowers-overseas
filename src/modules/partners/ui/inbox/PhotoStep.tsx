/**
 * The photo step (spec 011 §2 "The delivery photo", §5.3 "Photo step"; `florist-inbox-*`;
 * TASK-210 draws it, TASK-215 wires the upload).
 *
 * Back to the order, the order in one line (product, tier, date), and the photo field. The send
 * button is the caller's, docked in `InboxFrame`, inside the caller's `<form>`.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { FloristOrderView } from "../../inbox/view.ts";

import { deliveryDateLabel, tierLabel } from "./format.ts";
import { PhotoField } from "./PhotoField.tsx";
import { ChevronIcon } from "./parts.tsx";

export interface PhotoStepProps {
  readonly view: FloristOrderView;
  readonly locale: string;
  /** The order page: a link on the inbox, text inside the walkthrough's picture. */
  readonly backHref?: string;
  /** The field's id, unique on the page. */
  readonly fieldId: string;
  readonly error?: string;
}

export function PhotoStep({
  view,
  locale,
  backHref,
  fieldId,
  error,
}: PhotoStepProps): ReactElement {
  const t = useTranslations();
  const backClass =
    "text-link -my-[8px] -mb-[12px] inline-flex min-h-(--target-min) items-center gap-[4px] justify-self-start font-bold no-underline";
  const back = (
    <>
      <ChevronIcon back />
      {view.product.name}
    </>
  );
  return (
    <div className="grid gap-[24px]" data-fo-photo-step>
      {backHref === undefined ? (
        <span className={backClass}>{back}</span>
      ) : (
        <a className={backClass} href={backHref}>
          {back}
        </a>
      )}
      <p className="text-eyebrow m-0 text-xs font-bold tracking-(--tracking-label) uppercase">
        {view.product.name} · {tierLabel(t, view.product.tier)} ·{" "}
        {deliveryDateLabel(view.delivery.date, locale, view.delivery.timeZone)}
      </p>
      <PhotoField id={fieldId} {...(error === undefined ? {} : { error })} />
    </div>
  );
}
