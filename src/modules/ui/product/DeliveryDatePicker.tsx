/**
 * `DeliveryDatePicker` — the date grid in the one state the data allows (spec 009 §2 "Three states,
 * chosen by data", §5.3, AC-7's render half, AC-8, AC-9, AC-10; `docs/design/system/
 * components.dc.html` "Date picker"; TASK-126).
 *
 * The state is `delivery.state`, which `pickerState()` decided upstream from (`operations` present,
 * `hasActivePartners`). This component **reads** it and branches only on what each state is
 * allowed to say — there is no country anywhere in this file:
 *
 *  - **`unavailable`** — a disabled `<fieldset>`, **no dates at all**, the state's own sentence
 *    (`delivery.picker.unavailable`) and a link to the destination's corridor guide where one is
 *    published. No cutoff, no calendar, no "next available".
 *  - **`preview`** — the full computed grid with **every date disabled**, under the sentence that
 *    says what it is (`delivery.picker.preview`), which is also the shared reason of every chip
 *    closed only because we are not taking orders (§13 design round Q6), and of a day past the
 *    cutoff, whose own sentence would name a time (TASK-171 ruling E-1). **No cutoff time**
 *    (spec 009 §14 A8): no florist has agreed to one, and the delivery-facts row on the same page
 *    says exactly that, so a time here would contradict it.
 *  - **`live`** — selectable dates, the earliest preselected by the view model, the cutoff line in
 *    the present tense, and the "Use this date" submit — rendered **only** when a date can be
 *    chosen, because a button that submits nothing selectable is the same lie as a checkbox that
 *    does nothing.
 *
 * The cutoff is an **absolute** wall-clock time with its zone named by its city — the authored
 * `sameDayCutoffLocal`, and the exemplar city of the `ianaZone` the calendar computed in
 * (`zoneCity()`) — and never a countdown or a relative day label (§13 Q4): this HTML is served
 * from cache.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ProductView } from "@/modules/catalog";

import { Button } from "../primitives/Button.tsx";

import { DateChip } from "./DateChip.tsx";
import { messageFor, zoneCity } from "./labels.ts";
import { StepLegend } from "./StepLegend.tsx";

export interface DeliveryDatePickerProps {
  readonly delivery: ProductView["delivery"];
  readonly selectedDate?: string;
  readonly locale: string;
  /** The destination's name in this locale. */
  readonly country: string;
  /** The corridor guide, where one is published (`ProductView.country.corridorPath`). */
  readonly corridorPath?: string;
  /** A page-unique id prefix, so two pickers on `/dev/components` do not share ids. */
  readonly idPrefix?: string;
  /** The step number the v2 page draws beside the legend (decorative; `StepLegend`). */
  readonly step?: number;
}

/** v2's picker note: the cornflower wash, 16 px inline padding, the field radius (TASK-179). */
const NOTE =
  "bg-sage-wash text-ink rounded-field text-ui m-0 px-[16px] py-[12px] leading-[1.4]";

export function DeliveryDatePicker({
  delivery,
  selectedDate,
  locale,
  country,
  corridorPath,
  idPrefix = "delivery",
  step,
}: DeliveryDatePickerProps): ReactElement {
  const t = useTranslations();
  const d = useTranslations("delivery");
  const noticeId = `${idPrefix}-notice`;
  const city =
    delivery.timeZone === undefined ? "" : zoneCity(delivery.timeZone);
  const notice = messageFor(t, delivery.noticeKey, {
    country,
    time: delivery.cutoffLocal ?? "",
    city,
  });
  const fieldset = "m-0 flex min-w-0 flex-col gap-[10px] border-0 p-0";
  const legend = <StepLegend step={step}>{d("legend")}</StepLegend>;

  if (delivery.state === "unavailable") {
    return (
      <fieldset
        className={fieldset}
        data-fo-picker-state="unavailable"
        disabled
      >
        {legend}
        <p className={NOTE} id={noticeId}>
          {notice}
        </p>
        {corridorPath === undefined ? null : (
          <p className="text-ui m-0">
            <a
              className="text-link hover:text-link-strong font-bold underline underline-offset-4"
              href={corridorPath}
            >
              {d("corridorLink", { country })}
            </a>
          </p>
        )}
      </fieldset>
    );
  }

  const live = delivery.state === "live";
  const anySelectable = delivery.dates.some((date) => date.selectable);
  // A cutoff renders only in `live` (spec 009 §14 A8): in `preview` no florist has agreed to one.
  const showCutoff =
    live &&
    delivery.cutoffLocal !== undefined &&
    delivery.timeZone !== undefined;

  return (
    <fieldset
      className={fieldset}
      data-fo-picker-state={delivery.state}
      disabled={!live}
    >
      {legend}
      {live ? null : (
        <p className={`${NOTE} self-start`} id={noticeId}>
          {notice}
        </p>
      )}
      {showCutoff ? (
        <div className={`${NOTE} self-start`} data-fo-cutoff id={noticeId}>
          <p className="m-0 font-bold">{notice}</p>
        </div>
      ) : null}
      {/* Seven columns from `md`; below it the 390 artboard's rail of 66 px chips, which scrolls
          rather than wraps so a fortnight reads as one line. The block padding leaves room for an
          occasion tag that sits on a chip's top edge. */}
      <div
        className="grid auto-cols-[66px] grid-flow-col gap-[8px] overflow-x-auto pt-[10px] max-md:-mx-(--gutter-s) max-md:px-(--gutter-s) md:grid-flow-row md:grid-cols-7 md:overflow-visible"
        data-fo-date-grid
      >
        {delivery.dates.map((date) => (
          <DateChip
            key={date.date}
            checked={live && date.date === selectedDate}
            country={country}
            date={date}
            locale={locale}
            pickerState={live ? "live" : "preview"}
            sharedReasonId={noticeId}
            {...(delivery.cutoffLocal === undefined
              ? {}
              : { cutoffLocal: delivery.cutoffLocal })}
            {...(delivery.timeZone === undefined
              ? {}
              : { timeZone: delivery.timeZone })}
          />
        ))}
      </div>
      {live && anySelectable ? (
        <Button
          className="self-start"
          size="sm"
          type="submit"
          variant="secondary"
        >
          {d("submit")}
        </Button>
      ) : null}
    </fieldset>
  );
}
