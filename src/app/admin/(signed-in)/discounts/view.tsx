/**
 * @purpose The discount pages' shared server pieces: status chip, offer and money text, form copy, preview view model
 * @spec 047
 *
 * Artboards `admin-discounts-{desktop,mobile}` (spec 047 §5.3; TASK-446). Server only: it reads
 * the admin catalogue and the formatters, and hands the client form (`discount-form.tsx`) strings.
 * Every amount goes through `formatMoney` from integer minor units, every percent through
 * `formatPercentFromBasisPoints`, every instant through `formatDate` in the zone shown beside it.
 * The URL carries the code's id and an outcome code only, never a value a person typed.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import type { CurrencyCode } from "@/config/currencies";
import { DISCOUNT_DEFAULT_TIME_ZONE } from "@/config/discounts";
import {
  adminT,
  bpToPercentText,
  type DiscountComputedStatus,
  type DiscountCostPreview,
  type DiscountDetail,
  minorToAmountText,
} from "@/modules/admin";
import type { Money } from "@/modules/discounts";
import {
  formatDate,
  formatMoney,
  formatPercentFromBasisPoints,
  formatRegionName,
  instantToWallClock,
} from "@/modules/i18n";
import { AdminChip, type AdminChipTone } from "@/modules/ui/admin/AdminData";

import type {
  DiscountFormCopy,
  DiscountFormValues,
  DiscountPreviewView,
} from "./form-types";

const STATUS_TONE: Readonly<Record<DiscountComputedStatus, AdminChipTone>> = {
  scheduled: "sky",
  active: "ok",
  ended: "plain",
  used_up: "warn",
  disabled: "demo",
};

export function DiscountStatusChip({
  status,
}: {
  readonly status: DiscountComputedStatus;
}): ReactElement {
  return (
    <AdminChip tone={STATUS_TONE[status]}>
      {adminT(`admin.discounts.status.${status}`)}
    </AdminChip>
  );
}

/** An amount in the admin's English. */
export function money(value: Money): string {
  return formatMoney(value as Parameters<typeof formatMoney>[0], "en");
}

/** "10%" or "£6 / €7 / 30 zł". */
export function offerText(
  kind: "percent" | "fixed",
  percentBp: number | null,
  amounts: readonly Money[],
): string {
  if (kind === "percent")
    return formatPercentFromBasisPoints(percentBp ?? 0, "en");
  return amounts.map(money).join(adminT("admin.discounts.separator.offer"));
}

/** "£166.05 · €24.30", or empty when nothing was given. */
export function givenText(amounts: readonly Money[]): string {
  return amounts.map(money).join(adminT("admin.discounts.separator.given"));
}

/** A date in the list and the stats, in the zone shown beside it. */
export function dayText(
  at: Date,
  zone: string = DISCOUNT_DEFAULT_TIME_ZONE,
): string {
  return formatDate(at, "en", "dayMonthYear", zone);
}

/** The outcome a redirect names (`?result=`). */
export const DiscountResultSchema = z.object({
  result: z
    .enum(["created", "saved", "disabled", "enabled", "not_found"])
    .optional()
    .catch(undefined),
});

/** Every word of the form. */
export function discountFormCopy(
  currencies: readonly CurrencyCode[],
  submit: string,
  frozenUses: number | null,
): DiscountFormCopy {
  const t = adminT;
  return {
    section: t("admin.discounts.form.section"),
    code: t("admin.discounts.form.code"),
    generate: t("admin.discounts.form.generate"),
    codeHint: t("admin.discounts.form.codeHint"),
    campaign: t("admin.discounts.form.campaign"),
    campaignHint: t("admin.discounts.form.campaignHint"),
    offer: t("admin.discounts.form.offer"),
    kindPercent: t("admin.discounts.form.kind.percent"),
    kindFixed: t("admin.discounts.form.kind.fixed"),
    percent: t("admin.discounts.form.percent"),
    percentHint: t("admin.discounts.form.percentHint"),
    perCurrency: t("admin.discounts.form.perCurrency"),
    currency: t("admin.discounts.form.currency"),
    amountOff: t("admin.discounts.form.amountOff"),
    minOrder: t("admin.discounts.form.minOrder"),
    amountLabels: Object.fromEntries(
      currencies.map((currency) => [
        currency,
        {
          amount: t("admin.discounts.form.amountLabel", { currency }),
          min: t("admin.discounts.form.minLabel", { currency }),
        },
      ]),
    ),
    fixedOnly: t("admin.discounts.form.fixedOnly"),
    starts: t("admin.discounts.form.starts"),
    startsHint: t("admin.discounts.form.startsHint"),
    ends: t("admin.discounts.form.ends"),
    optional: t("admin.discounts.form.optional"),
    zone: t("admin.discounts.form.zone"),
    maxRedemptions: t("admin.discounts.form.maxRedemptions"),
    maxRedemptionsHint: t("admin.discounts.form.maxRedemptionsHint"),
    maxPerEmail: t("admin.discounts.form.maxPerEmail"),
    maxPerEmailHint: t("admin.discounts.form.maxPerEmailHint"),
    destinations: t("admin.discounts.form.destinations"),
    destinationsHint: t("admin.discounts.form.destinationsHint"),
    allDestinations: t("admin.discounts.form.allDestinations"),
    bouquets: t("admin.discounts.form.bouquets"),
    bouquetsHint: t("admin.discounts.form.bouquetsHint"),
    allBouquets: t("admin.discounts.form.allBouquets"),
    chosen: t("admin.discounts.form.chosen", { count: 7 }).replace("7", "#"),
    note: t("admin.discounts.form.note"),
    submit,
    cancel: t("admin.discounts.form.cancel"),
    invalid: t("admin.discounts.result.invalid"),
    notFound: t("admin.discounts.result.not_found"),
    frozen:
      frozenUses === null
        ? null
        : t("admin.discounts.form.frozen", { count: frozenUses }),
    previewTitle: t("admin.discounts.preview.title"),
    previewLead: t("admin.discounts.preview.lead"),
    previewUpdating: t("admin.discounts.preview.updating"),
    previewEmpty: t("admin.discounts.preview.empty"),
    claimTitle: t("admin.discounts.preview.claimTitle"),
    columns: {
      bouquet: t("admin.discounts.preview.column.bouquet"),
      destination: t("admin.discounts.preview.column.destination"),
      price: t("admin.discounts.preview.column.price"),
      discount: t("admin.discounts.preview.column.discount"),
      vat: t("admin.discounts.preview.column.vat"),
      payout: t("admin.discounts.preview.column.payout"),
      margin: t("admin.discounts.preview.column.margin"),
    },
  };
}

/** A new code's starting values: percent off, one use per buyer, UK time. */
export function emptyFormValues(): DiscountFormValues {
  return {
    code: "",
    campaignLabel: "",
    kind: "percent",
    percent: "",
    amounts: {},
    startsAt: "",
    endsAt: "",
    zone: DISCOUNT_DEFAULT_TIME_ZONE,
    maxRedemptions: "",
    maxPerEmail: "1",
    countryIds: [],
    productIds: [],
    note: "",
  };
}

/** A saved code as the form's text values, dates in Europe/London. */
export function detailFormValues(detail: DiscountDetail): DiscountFormValues {
  const zone = DISCOUNT_DEFAULT_TIME_ZONE;
  const { code } = detail.loaded;
  return {
    code: detail.code,
    campaignLabel: detail.loaded.campaignLabel,
    kind: code.kind,
    percent: code.percentBp === null ? "" : bpToPercentText(code.percentBp),
    amounts: Object.fromEntries(
      detail.loaded.currencies.map((row) => [
        row.currency,
        {
          amount:
            row.amountOffMinor === null
              ? ""
              : minorToAmountText(
                  row.amountOffMinor,
                  row.currency as CurrencyCode,
                ),
          min: minorToAmountText(
            row.minOrderMinor,
            row.currency as CurrencyCode,
          ),
        },
      ]),
    ),
    startsAt: instantToWallClock(code.startsAt, zone),
    endsAt: code.endsAt === null ? "" : instantToWallClock(code.endsAt, zone),
    zone,
    maxRedemptions:
      code.maxRedemptions === null ? "" : String(code.maxRedemptions),
    maxPerEmail: code.maxPerEmail === null ? "" : String(code.maxPerEmail),
    countryIds: detail.loaded.countryIds,
    productIds: detail.loaded.productIds,
    note: detail.note ?? "",
  };
}

/** The form values as the fields the commands read (the shape `FormData` gives). */
export function valuesAsFields(
  values: DiscountFormValues,
): Record<string, string | readonly string[]> {
  const fields: Record<string, string | readonly string[]> = {
    code: values.code,
    campaignLabel: values.campaignLabel,
    kind: values.kind,
    percent: values.percent,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    zone: values.zone,
    maxRedemptions: values.maxRedemptions,
    maxPerEmail: values.maxPerEmail,
    countryIds: values.countryIds,
    productIds: values.productIds,
    note: values.note,
  };
  for (const [currency, row] of Object.entries(values.amounts)) {
    fields[`amount_${currency}`] = row.amount;
    fields[`min_${currency}`] = row.min;
  }
  return fields;
}

/** The cost preview with every figure formatted and every warning worded. */
export function previewView(preview: DiscountCostPreview): DiscountPreviewView {
  const country = (iso: string) => formatRegionName(iso, "en");
  const below = preview.rows.filter((row) => row.belowCost);
  return {
    rows: preview.rows.map((row) => ({
      key: `${row.productId}:${row.countryIso}`,
      product: row.productName,
      destination: country(row.countryIso),
      vatRate: formatPercentFromBasisPoints(row.vatRateBp, "en"),
      price: money({ amountMinor: row.priceMinor, currency: row.currency }),
      discount: money({
        amountMinor: row.discountMinor,
        currency: row.currency,
      }),
      vat: money({ amountMinor: row.vatMinor, currency: row.currency }),
      payout:
        row.highestPayoutMinor === null
          ? adminT("admin.discounts.preview.notMapped")
          : money({
              amountMinor: row.highestPayoutMinor,
              currency: row.currency,
            }),
      margin:
        row.marginMinor === null
          ? adminT("admin.discounts.preview.notMapped")
          : money({ amountMinor: row.marginMinor, currency: row.currency }),
      belowCost: row.belowCost,
    })),
    belowTitle:
      below.length === 0
        ? null
        : adminT("admin.discounts.preview.belowTitle", { count: below.length }),
    belowItems: below.map((row) =>
      adminT("admin.discounts.preview.belowItem", {
        product: row.productName,
        country: country(row.countryIso),
        margin: money({
          amountMinor: row.marginMinor ?? 0,
          currency: row.currency,
        }),
      }),
    ),
    claimItems: preview.reductionClaims.map((claim) =>
      adminT("admin.discounts.preview.claimItem", {
        product: claim.productName,
        country: country(claim.countryIso),
        lowest: money(claim.lowest),
        today: money(claim.today),
      }),
    ),
    truncated: preview.truncated
      ? adminT("admin.discounts.preview.truncated", {
          count: preview.rows.length,
        })
      : null,
  };
}
