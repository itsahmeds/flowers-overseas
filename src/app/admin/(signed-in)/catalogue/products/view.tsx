/**
 * @purpose The product editor's shared pieces: the outcome banner, rule messages, the details form
 * @spec 012b
 *
 * Spec 012b §5.3 (TASK-297): a hard rule is named beside its field; the banner names the outcome
 * a redirect carried (`?result=` and `?rule=id:field`). Server components only.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import {
  colours,
  flowerTypes,
  priceTiers,
  productTypes,
  styles,
  substitutionClasses,
} from "@/config/catalogue/schemas";
import { type CatalogueRefusalReason, adminT } from "@/modules/admin";
import { RULE_IDS, type RuleId } from "@/modules/catalog";
import {
  AdminButton,
  AdminRefusal,
  AdminToast,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";

const REASONS = [
  "invalid",
  "rules",
  "reason_required",
  "conflict",
  "not_found",
  "duplicate_sku",
  "forbidden_locale",
  "exposed",
  "preconditions",
  "same_day",
  "not_draft",
  "below_payout",
  "supplier",
  "mapping_failed",
  "no_vat_rate",
  "transition",
] as const satisfies readonly CatalogueRefusalReason[];

const asList = (value: unknown): string[] =>
  value === undefined
    ? []
    : [value].flat().filter((item) => typeof item === "string");

/** A product type's label; a value outside the closed list is shown as itself. */
export function typeLabel(type: string): string {
  const known = z.enum(productTypes).safeParse(type);
  return known.success ? adminT(`admin.catalogue.type.${known.data}`) : type;
}

/** The outcome a redirect carried. */
export const OutcomeSchema = z
  .object({
    result: z
      .enum(["saved", ...REASONS])
      .optional()
      .catch(undefined),
    rule: z.unknown().transform(asList),
    unmet: z.unknown().transform(asList),
  })
  .catch({ rule: [], unmet: [] });
export type Outcome = z.infer<typeof OutcomeSchema>;

/** The rule ids per field of an outcome, unknown ids dropped. */
export function rulesByField(outcome: Outcome): Map<string, RuleId[]> {
  const out = new Map<string, RuleId[]>();
  for (const entry of outcome.rule) {
    const [rule = "", field = ""] = entry.split(":");
    if (!(RULE_IDS as readonly string[]).includes(rule)) continue;
    const list = out.get(field) ?? [];
    list.push(rule as RuleId);
    out.set(field, list);
  }
  return out;
}

/** The sentence of one rule id, with the id itself (the one `catalogue:check` prints). */
export function ruleText(rule: RuleId): string {
  return `${adminT(`admin.catalogue.rule.${rule}`)} (${rule})`;
}

/** The first rule message on `field`, if any. */
export function fieldError(
  rules: Map<string, RuleId[]>,
  field: string,
): string | undefined {
  const first = rules.get(field)?.[0];
  return first === undefined ? undefined : ruleText(first);
}

export function OutcomeBanner({
  outcome,
}: {
  readonly outcome: Outcome;
}): ReactElement | null {
  if (outcome.result === undefined) return null;
  if (outcome.result === "saved") {
    return <AdminToast>{adminT("admin.catalogue.saved")}</AdminToast>;
  }
  return (
    <AdminRefusal>
      {adminT(`admin.catalogue.refused.${outcome.result}`)}
    </AdminRefusal>
  );
}

function Select({
  id,
  name,
  label,
  hint,
  values,
  value,
  labelOf,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly values: readonly string[];
  readonly value: string | undefined;
  readonly labelOf?: (value: string) => string;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint}>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className={adminControlClass(false)}
        {...adminFieldAria(id, hint, undefined)}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {labelOf === undefined ? option : labelOf(option)}
          </option>
        ))}
      </select>
    </AdminField>
  );
}

export interface DetailsValues {
  readonly productId?: string;
  readonly updatedAt?: string;
  readonly sku: string;
  readonly productType: string;
  readonly primaryFlower: string;
  readonly colourPrimary: string;
  readonly style: string;
  readonly priceTier: string;
  readonly substitutionClass: string;
  readonly vaseIncluded: boolean;
  readonly stemCount: number | null;
  readonly freshnessDays: number;
  readonly partnerOnly: boolean;
  readonly supplierId: string;
}

/** The details form (`createProduct` / `updateProduct`), with the supplier florist when allowed. */
export function DetailsForm({
  values,
  florists,
  maySupply,
  mayEdit,
  action,
}: {
  readonly values: DetailsValues;
  readonly florists: readonly { id: string; code: string; currency: string }[];
  readonly maySupply: boolean;
  readonly mayEdit: boolean;
  readonly action: (form: FormData) => Promise<void>;
}): ReactElement {
  const yesNo = (value: string): string =>
    adminT(
      value === "yes"
        ? "admin.catalogue.details.yes"
        : "admin.catalogue.details.no",
    );
  const creating = values.productId === undefined;
  return (
    <form action={action} className="grid gap-[16px] md:grid-cols-2">
      {creating ? null : (
        <>
          <input type="hidden" name="productId" value={values.productId} />
          <input type="hidden" name="updatedAt" value={values.updatedAt} />
        </>
      )}
      <AdminField
        id="product-sku"
        label={adminT("admin.catalogue.details.sku")}
        hint={adminT("admin.catalogue.details.skuHint")}
      >
        <input
          id="product-sku"
          name="sku"
          defaultValue={values.sku}
          readOnly={!creating}
          required
          pattern="FO-(BQ|AR|PT|FN|GS)-[0-9]{3}"
          className={`${adminControlClass(false)} ${creating ? "" : "bg-paper-2"}`}
          {...adminFieldAria(
            "product-sku",
            adminT("admin.catalogue.details.skuHint"),
            undefined,
          )}
        />
      </AdminField>
      {maySupply ? (
        <>
          <Select
            id="product-florist"
            name="supplierId"
            label={adminT("admin.catalogue.details.florist")}
            hint={adminT("admin.catalogue.details.floristHint")}
            values={["", ...florists.map((florist) => florist.id)]}
            value={values.supplierId}
            labelOf={(id) =>
              id === ""
                ? adminT("admin.catalogue.details.floristNone")
                : (florists.find((florist) => florist.id === id)?.code ?? id)
            }
          />
          <AdminField
            id="product-florist-price"
            label={adminT("admin.catalogue.details.floristPrice")}
            hint={adminT("admin.catalogue.details.floristPriceHint")}
          >
            <input
              id="product-florist-price"
              name="floristPrice"
              inputMode="decimal"
              autoComplete="off"
              className={adminControlClass(false)}
              {...adminFieldAria(
                "product-florist-price",
                adminT("admin.catalogue.details.floristPriceHint"),
                undefined,
              )}
            />
          </AdminField>
        </>
      ) : (
        <p className="text-ink-3 col-span-full text-[13px]">
          {adminT("admin.catalogue.details.supplierAbsent")}
        </p>
      )}
      <Select
        id="product-type"
        name="productType"
        label={adminT("admin.catalogue.details.productType")}
        values={productTypes}
        value={values.productType}
        labelOf={typeLabel}
      />
      <Select
        id="product-flower"
        name="primaryFlower"
        label={adminT("admin.catalogue.details.primaryFlower")}
        values={flowerTypes}
        value={values.primaryFlower}
      />
      <Select
        id="product-colour"
        name="colourPrimary"
        label={adminT("admin.catalogue.details.colourPrimary")}
        values={colours}
        value={values.colourPrimary}
      />
      <Select
        id="product-style"
        name="style"
        label={adminT("admin.catalogue.details.style")}
        values={styles}
        value={values.style}
      />
      <Select
        id="product-band"
        name="priceTier"
        label={adminT("admin.catalogue.details.priceTier")}
        hint={adminT("admin.catalogue.details.priceTierHint")}
        values={priceTiers}
        value={values.priceTier}
      />
      <Select
        id="product-substitution"
        name="substitutionClass"
        label={adminT("admin.catalogue.details.substitutionClass")}
        hint={adminT("admin.catalogue.details.substitutionHint")}
        values={substitutionClasses}
        value={values.substitutionClass}
      />
      <Select
        id="product-vase"
        name="vaseIncluded"
        label={adminT("admin.catalogue.details.vaseIncluded")}
        values={["no", "yes"]}
        value={values.vaseIncluded ? "yes" : "no"}
        labelOf={yesNo}
      />
      <AdminField
        id="product-stems"
        label={adminT("admin.catalogue.details.stemCount")}
        hint={adminT("admin.catalogue.details.stemCountHint")}
      >
        <input
          id="product-stems"
          name="stemCount"
          inputMode="numeric"
          defaultValue={values.stemCount ?? ""}
          className={adminControlClass(false)}
          {...adminFieldAria(
            "product-stems",
            adminT("admin.catalogue.details.stemCountHint"),
            undefined,
          )}
        />
      </AdminField>
      <AdminField
        id="product-fresh"
        label={adminT("admin.catalogue.details.freshnessDays")}
      >
        <input
          id="product-fresh"
          name="freshnessDays"
          inputMode="numeric"
          defaultValue={values.freshnessDays}
          required
          className={adminControlClass(false)}
        />
      </AdminField>
      <Select
        id="product-partner-only"
        name="partnerOnly"
        label={adminT("admin.catalogue.details.partnerOnly")}
        values={["no", "yes"]}
        value={values.partnerOnly ? "yes" : "no"}
        labelOf={yesNo}
      />
      {mayEdit ? (
        <div className="col-span-full flex flex-wrap items-center gap-[12px]">
          <AdminButton tone="primary">
            {adminT(
              creating
                ? "admin.catalogue.details.create"
                : "admin.catalogue.details.save",
            )}
          </AdminButton>
          <span className="text-ink-3 text-[13px]">
            {adminT("admin.catalogue.details.saveHint")}
          </span>
        </div>
      ) : null}
    </form>
  );
}
