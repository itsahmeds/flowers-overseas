/**
 * `DateChip` — one day of the delivery grid, with its money **before** it is chosen (spec 009 §2,
 * §5.3, AC-7's render half, AC-9; `docs/design/system/components.dc.html` "Date chip"; TASK-126).
 *
 * Three states, decided by the view model and by nothing here:
 *
 *  - **included** — a selectable date with no fee prints "included". The fee is printed even when
 *    it is nothing, so "included" and "+£5.00" are the same element in two states.
 *  - **surcharge** — the exact amount the view model carries (`DeliveryDate.surcharge`, which
 *    `productView()` derived from `dateSurcharges()` as the difference of two projected totals),
 *    through `formatMoney`, on the chip, before selection. On a selectable date it is signed
 *    ("+£5.00"); on a closed one it is the destination's fact ("18 zł").
 *  - **closed** — a `disabled` radio **and** the reason in words, never colour or opacity alone
 *    (WCAG 1.4.1). The reason is part of the `<label>`, so it is in the radio's accessible name.
 *    The one exception is `delivery.reason.notOrderable`, the `preview` state's shared reason:
 *    spec 009 §13 design round Q6 rules that those chips **share one sentence**, so they print
 *    none of their own and their radio's `aria-labelledby` names the chip **and** the picker's
 *    notice, which is visible above the grid. The reason is then visible once and in every
 *    chip's accessible name.
 *    In `preview` a **past-cutoff** chip shares it too (spec 009 §14 A8, TASK-171 ruling E-1): its
 *    own sentence names a cutoff time, and `preview` states none because no florist has agreed to
 *    one. The calendar's `pastCutoff` reason is unchanged and stays on `data-fo-date-reason`; in
 *    `live` the chip still prints "Ordering closed at 14:00 in Warsaw".
 *
 * An occasion observed on the day is marked with its own name (`catalog.facet.occasion.*`), on a
 * closed date too: an occasion is a fact about the destination's calendar, the closure is a fact
 * about us. No date literal exists here; the date is the view model's, formatted by `formatDate`.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { occasionByKey } from "@/config/catalogue/occasions.data";
import type { ProductView } from "@/modules/catalog";
import { formatDate, formatMoney } from "@/modules/i18n";

import { instantOf, localeOf, messageFor, zoneCity } from "./labels.ts";

export type ProductDeliveryDate = ProductView["delivery"]["dates"][number];

/** The shared `preview` reason (spec 009 §13 design round Q6). Mirrors `geo`'s constant. */
export const SHARED_REASON_KEY = "delivery.reason.notOrderable";

/** The one calendar reason whose sentence names the cutoff time (`{time}`). */
const CUTOFF_REASON_KEY = "delivery.reason.pastCutoff";

/**
 * Whether a chip prints no reason of its own and is named by the picker's notice instead: the
 * shared `notOrderable` reason in any state, and a past-cutoff day in `preview` (§14 A8, E-1).
 */
function sharesNotice(
  reasonKey: string | undefined,
  pickerState: "preview" | "live",
): boolean {
  if (reasonKey === SHARED_REASON_KEY) return true;
  return pickerState === "preview" && reasonKey === CUTOFF_REASON_KEY;
}

export type DateChipState = "included" | "surcharge" | "closed";

/** Which of the three drawn states a date is in — a reading of the value, not a decision. */
export function dateChipState(date: ProductDeliveryDate): DateChipState {
  if (!date.selectable) return "closed";
  return date.surcharge === undefined ? "included" : "surcharge";
}

export interface DateChipProps {
  readonly date: ProductDeliveryDate;
  readonly locale: string;
  /** Whether this is the date the page is pricing (live state only). */
  readonly checked?: boolean;
  /** The destination's name, for the reasons that name it. */
  readonly country: string;
  /** The destination's authored cutoff and zone, for `pastCutoff`'s sentence. */
  readonly cutoffLocal?: string;
  readonly timeZone?: string;
  /** The picker notice's id: the shared reason of a `notOrderable` chip (Q6). */
  readonly sharedReasonId: string;
  /**
   * The picker's state. In `preview` a past-cutoff chip prints no time and shares the notice
   * (§14 A8). Defaults to `live`, the state in which a chip's own reason is always printed.
   */
  readonly pickerState?: "preview" | "live";
  /** The form field name; `date` is `ProductSearchParamsSchema`'s (TASK-128). */
  readonly name?: string;
}

export function DateChip({
  date,
  locale,
  checked = false,
  country,
  cutoffLocal,
  timeZone,
  sharedReasonId,
  pickerState = "live",
  name = "date",
}: DateChipProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const code = localeOf(locale);
  const state = dateChipState(date);
  const chipId = `date-${date.date}`;
  const shared = sharesNotice(date.reasonKey, pickerState);
  const occasions = date.occasionKeys.map((key) =>
    messageFor(t, occasionByKey(key).labelKey),
  );

  const tone =
    state === "closed"
      ? "border-dashed border-border-strong bg-surface-muted text-ink-muted"
      : "border-border-strong has-[:checked]:border-2 has-[:checked]:border-border-emphasis has-[:checked]:bg-surface-raised cursor-pointer";

  return (
    <label
      id={chipId}
      className={`${tone} py-sm has-[:focus-visible]:outline-focus flex min-h-[82px] flex-col justify-center gap-[2px] rounded-sm border px-[6px] text-center text-xs has-[:focus-visible]:outline-2 ${
        occasions.length > 0 ? "border-b-accent border-b-[3px]" : ""
      }`}
      data-fo-date={date.date}
      data-fo-date-state={state}
      {...(date.reasonKey === undefined
        ? {}
        : { "data-fo-date-reason": date.reasonKey })}
    >
      <input
        className="sr-only"
        defaultChecked={checked}
        disabled={!date.selectable}
        name={name}
        type="radio"
        value={date.date}
        {...(shared
          ? { "aria-labelledby": `${chipId} ${sharedReasonId}` }
          : {})}
      />
      <b className="text-sm font-semibold">
        {formatDate(instantOf(date.date), code, "deliveryDate", "UTC")}
      </b>
      {date.surcharge === undefined ? (
        state === "included" ? (
          <span className="text-ink-muted" data-fo-date-fee="included">
            {product("included")}
          </span>
        ) : null
      ) : (
        <bdi
          className="text-accent font-semibold tabular-nums"
          data-fo-date-fee="surcharge"
        >
          {formatMoney(date.surcharge, code, {
            signDisplay: date.selectable ? "always" : "auto",
          })}
        </bdi>
      )}
      {date.reasonKey === undefined || shared ? null : (
        <span className="text-ink-muted leading-[1.35]" data-fo-date-why>
          {messageFor(t, date.reasonKey, {
            country,
            time: cutoffLocal ?? "",
            city: timeZone === undefined ? "" : zoneCity(timeZone),
          })}
        </span>
      )}
      {occasions.length === 0 ? null : (
        <b className="text-accent" data-fo-date-occasion>
          {occasions.join(" · ")}
        </b>
      )}
      <span
        aria-hidden="true"
        className="text-accent hidden text-xs [label:has(:checked)>&]:inline"
      >
        {product("selected")}
      </span>
    </label>
  );
}
