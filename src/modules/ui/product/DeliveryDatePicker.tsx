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
import { HorizontalScroller } from "../primitives/HorizontalScroller.tsx";

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
  /** `buy` (v3, TASK-197): the round-2 buy column's plain legend, no step number. */
  readonly look?: "step" | "buy";
}

/** v2's picker note: the cornflower wash, 16 px inline padding, the field radius (TASK-179). */
const NOTE =
  "bg-sage-wash text-ink rounded-field text-ui m-0 px-[16px] py-[12px] leading-[1.4]";

/** v3's buy column draws the picker's sentence as a plain caption (`.pv-cap`), not a wash box. */
const NOTE_BUY = "text-ink-muted text-sm m-0 leading-[1.35]";

export function DeliveryDatePicker({
  delivery,
  selectedDate,
  locale,
  country,
  corridorPath,
  idPrefix = "delivery",
  step,
  look = "step",
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
  const note = look === "buy" ? NOTE_BUY : NOTE;
  const legend = (
    <StepLegend
      look={look === "buy" ? "buy" : "step"}
      step={look === "buy" ? undefined : step}
    >
      {d("legend")}
    </StepLegend>
  );

  if (delivery.state === "unavailable") {
    return (
      <fieldset
        className={fieldset}
        data-fo-picker-state="unavailable"
        disabled
      >
        {legend}
        <p className={note} id={noticeId}>
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
    <fieldset className={fieldset} data-fo-picker-state={delivery.state}>
      {legend}
      {live ? null : (
        <p className={`${note} self-start`} id={noticeId}>
          {notice}
        </p>
      )}
      {showCutoff ? (
        <div className={`${NOTE} self-start`} data-fo-cutoff id={noticeId}>
          <p className="m-0 font-bold">{notice}</p>
        </div>
      ) : null}
      {/* The date row is a real horizontal scroller at every width (spec 004 §14 A24 clause 4
          (c), AC-49): the 390 artboard's rail of 66 px chips, and from `md` the week's seven
          columns with the rest of the window one scroll away, so the buy column stays one row
          tall (AC-46). `overflow-x: auto`, never the artboards' `hidden`; with no focusable chip
          (every date closed) the row itself takes focus and is named by the legend's question.
          The block padding leaves room for an occasion tag on a chip's top edge. */}
      <div data-fo-date-grid>
        <HorizontalScroller
          className="pt-[10px] pb-[4px] [&>li]:w-[66px]"
          items={delivery.dates.map((date) => ({
            key: date.date,
            node: (
              <DateChip
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
            ),
          }))}
          itemsFocusable={live && anySelectable}
          label={d("legend")}
        />
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
