"use client";
/**
 * The selection bar's live line (`.ad-selbar`, spec 030a §5.3 "Create Wise export"; artboards
 * `admin-payouts-{desktop,mobile}`; TASK-367): how many rows of a form are ticked and their total
 * per currency, said again in a polite live region whenever a box changes. The one island of the
 * payouts list; the boxes and the submit button are the server's form.
 *
 * Every word arrives as a prop: `summaries[n]` is the catalogue's line for `n` ticked rows, made
 * on the server for each possible count. Amounts go through `formatMoney` from integer minor
 * units, one per currency, never summed across currencies.
 */
import { type ReactElement, useEffect, useState } from "react";

import type { CurrencyCode } from "@/config/currencies";
import { formatMoney } from "@/modules/i18n/client";

export interface AdminSelectableRow {
  readonly id: string;
  readonly currency: CurrencyCode;
  /** Minor units as digits (a `bigint` does not cross to the client). */
  readonly totalMinor: string;
}

export function AdminSelectionSummary({
  formId,
  fieldName,
  rows,
  initial,
  summaries,
  separator,
}: {
  readonly formId: string;
  readonly fieldName: string;
  readonly rows: readonly AdminSelectableRow[];
  /** The ids ticked when the page renders. */
  readonly initial: readonly string[];
  readonly summaries: readonly string[];
  /** Between two currencies' totals (" · "), from the catalogue. */
  readonly separator: string;
}): ReactElement {
  const [ticked, setTicked] = useState<readonly string[]>(initial);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return undefined;
    const read = (): void => {
      const values = new FormData(form)
        .getAll(fieldName)
        .filter((value): value is string => typeof value === "string");
      setTicked(values);
    };
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, [formId, fieldName]);

  const totals = new Map<CurrencyCode, bigint>();
  for (const row of rows) {
    if (ticked.includes(row.id)) {
      totals.set(
        row.currency,
        (totals.get(row.currency) ?? 0n) + BigInt(row.totalMinor),
      );
    }
  }
  const amounts = [...totals]
    .map(([currency, amountMinor]) =>
      formatMoney({ amountMinor, currency }, "en"),
    )
    .join(separator);

  return (
    <p
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[14px]"
    >
      <b>{summaries[ticked.length] ?? summaries.at(-1)}</b>
      {amounts === "" ? null : (
        <span className="[font-variant-numeric:lining-nums_tabular-nums]">
          {amounts}
        </span>
      )}
    </p>
  );
}
