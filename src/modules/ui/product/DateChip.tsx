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

  // v2's date chip (product artboards; components sheet "Date chip"): card white with a hairline
  // inset, the chip radius, 92 px tall. A closed day (and every `preview` day) sits on the cream
  // band; its reason is still in words inside the label (WCAG 1.4.1), never a strike or a fade.
  // Checked is the cornflower fill. An occasion day carries a poppy inset and its name as a tag on
  // the chip's top edge, in the Fraunces italic.
  const tone =
    state === "closed" || pickerState === "preview"
      ? "bg-surface-raised text-ink-muted"
      : "bg-card text-ink cursor-pointer has-[:checked]:bg-selected has-[:checked]:text-on-selected has-[:checked]:shadow-none";
  const edge =
    occasions.length > 0
      ? "shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
      : "shadow-[inset_0_0_0_1.5px_var(--color-rule)]";

  return (
    <label
      id={chipId}
      className={`${tone} ${edge} rounded-chip has-[:focus-visible]:outline-focus relative flex min-h-[92px] flex-col items-center justify-start gap-[2px] px-[4px] py-[10px] text-center text-xs has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2`}
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
      <b className="display text-h3-s leading-[1.15] font-normal">
        {formatDate(instantOf(date.date), code, "deliveryDate", "UTC")}
      </b>
      {date.surcharge === undefined ? (
        state === "included" ? (
          <span
            className="text-ink-muted [label:has(:checked)_&]:text-on-selected"
            data-fo-date-fee="included"
          >
            {product("included")}
          </span>
        ) : null
      ) : (
        <bdi
          className="text-accent-strong [label:has(:checked)_&]:text-on-selected text-[12px] font-bold tabular-nums"
          data-fo-date-fee="surcharge"
        >
          {formatMoney(date.surcharge, code, {
            signDisplay: date.selectable ? "always" : "auto",
          })}
        </bdi>
      )}
      {date.reasonKey === undefined || shared ? null : (
        <span
          className="text-ink-muted text-[11px] leading-[1.15]"
          data-fo-date-why
        >
          {messageFor(t, date.reasonKey, {
            country,
            time: cutoffLocal ?? "",
            city: timeZone === undefined ? "" : zoneCity(timeZone),
          })}
        </span>
      )}
      {occasions.length === 0 ? null : (
        <b
          className="display-em text-accent bg-surface absolute -start-[12px] -end-[12px] -top-[10px] z-1 rounded-md py-px text-center text-[13px] leading-none font-light whitespace-nowrap"
          data-fo-date-occasion
        >
          {occasions.join(" · ")}
        </b>
      )}
    </label>
  );
}
