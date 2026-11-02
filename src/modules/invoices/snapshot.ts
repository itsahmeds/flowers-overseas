/**
 * `InvoiceSnapshotV1` and `CreditNoteSnapshotV1` (spec 018 §5.2; AC-15, AC-17, AC-21; TASK-341).
 *
 * The snapshot is the **only** source of every figure and word the document prints (§5.2
 * `renderPdf`: "from the snapshot and profile only, never from live order rows"), written once at
 * issue into `invoice.snapshot` and never changed (`0021`'s `invoice_immutable`). So it holds what
 * a renderer needs and nothing more:
 *
 *  - `issuer`: from `src/config/company.ts` (legal name, register, registration number, address)
 *    and the issuer's `tax_registration` rows for the profile's country. No person's name, no EIN,
 *    no VAT id from `company.ts` (spec 018 §14 A-founder-2026-10-23).
 *  - `buyer`: the name and country of `order.buyer_snapshot`, as entered (§5.2). No email or
 *    phone: the document does not need them (data minimisation, `plan/07`).
 *  - `lines`: kind, quantity, gross unit and line amounts, rate, and the product or add-on name in
 *    each of the profile's label locales (`{buyer}` resolved to the order's locale) where a
 *    translation exists; the renderer names a surcharge line from its kind.
 *  - `byRate`, `outsideVatMinor`, `totals`: `./vat.ts`'s figures, integer minor units.
 *  - `vatCurrency` / `vatRate`: the profile's second VAT currency and, when it differs from the
 *    invoice currency, the rate the `VatRateProvider` returned, with its source and date (AC-19).
 *
 * Money is integer minor units plus `currency` (ISO 4217); a credit note's amounts are negative.
 */
import { z } from "zod";

const Minor = z.number().int();
const IsoDate = z.iso.date();
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);
const Iso2 = z.string().regex(/^[A-Z]{2}$/);

export const IssuerSnapshotSchema = z
  .object({
    legalName: z.string().min(1),
    registryName: z.string().min(1),
    registrationNumber: z.string().min(1),
    address: z
      .object({
        lines: z.array(z.string().min(1)).min(1),
        postalCode: z.string().min(1),
        city: z.string().min(1),
        countryIso2: Iso2,
      })
      .strict(),
    vatIds: z
      .array(z.object({ countryIso2: Iso2, vatId: z.string().min(1) }).strict())
      .min(1),
  })
  .strict();

export const BuyerOnInvoiceSchema = z
  .object({ name: z.string().min(1).max(200), countryIso2: Iso2 })
  .strict();

export const InvoiceLineSchema = z
  .object({
    kind: z.enum(["product", "addon", "surcharge"]),
    qty: z.number().int().positive(),
    unitGrossMinor: Minor,
    grossMinor: Minor,
    vatRateBp: z.number().int().min(0).max(10_000),
    vatBearing: z.boolean(),
    /** Locale code → name, for the label locales a translation exists in. */
    names: z.record(z.string(), z.string().min(1)),
  })
  .strict();

export const RateSplitSchema = z
  .object({
    rateBp: z.number().int().min(0).max(10_000),
    netMinor: Minor,
    vatMinor: Minor,
    grossMinor: Minor,
  })
  .strict()
  .refine((split) => split.netMinor + split.vatMinor === split.grossMinor, {
    error: "netMinor + vatMinor must equal grossMinor",
  });

export const TotalsSchema = z
  .object({ netMinor: Minor, vatMinor: Minor, grossMinor: Minor })
  .strict();

/** The rate a second VAT currency is printed at (AC-19). */
export const VatRateSnapshotSchema = z
  .object({
    from: CurrencyCode,
    to: CurrencyCode,
    /** The published mid rate as its decimal text (`5.1234`): never a float. */
    rate: z.string().regex(/^\d+\.\d{1,8}$/),
    source: z.literal("nbp_table_a"),
    /** The table's number as published (`212/A/NBP/2026`). */
    table: z.string().min(1),
    effectiveDate: IsoDate,
  })
  .strict();

export type VatRateSnapshot = z.infer<typeof VatRateSnapshotSchema>;

const DocumentFields = {
  issuer: IssuerSnapshotSchema,
  buyer: BuyerOnInvoiceSchema,
  supplyDate: IsoDate,
  issueDate: IsoDate,
  byRate: z.array(RateSplitSchema),
  outsideVatMinor: Minor,
  totals: TotalsSchema,
  currency: CurrencyCode,
  vatCurrency: CurrencyCode.nullable(),
  vatRate: VatRateSnapshotSchema.nullable(),
  profileKey: z.string().min(1),
  /** Labels and title come from the profile; the renderer reads them from here. */
  labelLocales: z.array(z.string().min(1)).min(1),
  orderReference: z.string().regex(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/),
} as const;

export const InvoiceSnapshotV1 = z
  .object({
    ...DocumentFields,
    kind: z.literal("invoice"),
    lines: z.array(InvoiceLineSchema).min(1),
  })
  .strict();

export const CreditNoteSnapshotV1 = z
  .object({
    ...DocumentFields,
    kind: z.literal("credit_note"),
    corrects: z
      .object({
        invoiceId: z.uuid(),
        number: z.string().min(1),
        issueDate: IsoDate,
      })
      .strict(),
    refund: z
      .object({
        refundId: z.uuid(),
        succeededAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type InvoiceSnapshot = z.infer<typeof InvoiceSnapshotV1>;
export type CreditNoteSnapshot = z.infer<typeof CreditNoteSnapshotV1>;

/** `invoice.snapshot_version` for both schemas. */
export const SNAPSHOT_VERSION = 1;
