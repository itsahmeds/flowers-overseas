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
 *    closed only because we are not taking orders (§13 design round Q6). **No cutoff time**
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

import { DateChip } from "./DateChip.tsx";
import { messageFor, zoneCity } from "./labels.ts";

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
}

export function DeliveryDatePicker({
  delivery,
  selectedDate,
  locale,
  country,
  corridorPath,
  idPrefix = "delivery",
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
  const fieldset =
    "border-border p-md gap-md m-0 flex min-w-0 flex-col rounded-sm border";
  const legend = (
    <legend className="px-sm text-sm font-semibold">{d("legend")}</legend>
  );

  if (delivery.state === "unavailable") {
    return (
      <fieldset
        className={`${fieldset} border-border-strong bg-surface-raised`}
        data-fo-picker-state="unavailable"
        disabled
      >
        {legend}
        <p className="text-md m-0 leading-[1.55]" id={noticeId}>
          {notice}
        </p>
        {corridorPath === undefined ? null : (
          <p className="m-0 text-sm">
            <a
              className="text-accent underline underline-offset-[3px]"
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
        <div className="border-warning p-md flex flex-col gap-[2px] border">
          <p className="text-md m-0 font-semibold" id={noticeId}>
            {notice}
          </p>
        </div>
      )}
      <div className="gap-sm grid grid-cols-4 sm:grid-cols-7" data-fo-date-grid>
        {delivery.dates.map((date) => (
          <DateChip
            key={date.date}
            checked={live && date.date === selectedDate}
            country={country}
            date={date}
            locale={locale}
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
        <button
          className="border-border-strong bg-surface text-ink px-md inline-flex min-h-[44px] items-center justify-center self-start rounded-sm border text-sm font-semibold"
          type="submit"
        >
          {d("submit")}
        </button>
      ) : null}
      {showCutoff ? (
        <div
          className="border-accent bg-surface-raised p-md flex flex-col gap-[2px] border"
          data-fo-cutoff
          id={noticeId}
        >
          <p className="m-0 text-sm font-semibold">{notice}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
