/**
 * A line's delivery date, re-checked (spec 010 §2 "The date"; §14 A-founder-2026-10-22 D8, item
 * 6; AC-60 server half; TASK-348).
 *
 * A basket waits up to 30 days, so a line's date can pass, or pass its cutoff, while it waits.
 * Every render and every action re-reads it against the destination's calendar **at `now`, in
 * the destination's zone**: `geo`'s `checkoutDeliveryWindow()`, the grid as if the country's
 * florists were active (the demo calendar in `demo` and `test`, the product page's own grid in
 * `live`). A date that is no longer a selectable chip is `gone`, with the first one that is as
 * `next` for the "Use {next}" submit; the clock is always injected, so a test crosses a cutoff
 * (the Warsaw DST night included) without waiting for one.
 */
import type { CountryIso2 } from "@/config/countries";
import { checkoutDeliveryWindow } from "@/modules/geo";

/** What a line's date is at `now`. */
export type LineDateStatus =
  | { readonly status: "none" }
  | { readonly status: "ok" }
  | { readonly status: "gone"; readonly next: string | null };

/** The first selectable date of the destination's checkout calendar at `now`, or `null`. */
export function nextDeliveryDate(
  countryIso: CountryIso2,
  now: Date,
): string | null {
  const window = checkoutDeliveryWindow({ countryIso, from: now });
  return window.dates.find((date) => date.selectable)?.date ?? null;
}

/**
 * `none` when the line has no date yet (a demo line before its step 1); `ok` when the date is a
 * selectable chip of the destination's checkout calendar at `now`; otherwise `gone`, with the
 * next selectable date.
 */
export function lineDateStatus(
  countryIso: CountryIso2,
  deliveryDate: string | null,
  now: Date,
): LineDateStatus {
  if (deliveryDate === null) return { status: "none" };
  const window = checkoutDeliveryWindow({ countryIso, from: now });
  const chip = window.dates.find((date) => date.date === deliveryDate);
  if (chip?.selectable === true) return { status: "ok" };
  return {
    status: "gone",
    next: window.dates.find((date) => date.selectable)?.date ?? null,
  };
}
