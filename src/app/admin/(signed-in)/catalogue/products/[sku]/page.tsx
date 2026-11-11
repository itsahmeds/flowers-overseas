/**
 * @purpose GET /admin/catalogue/products/[sku]: one product's details, sizes, text, prices and margin, with its status card
 * @spec 012b
 *
 * Spec 012b §2.5, §2.6, §5.3 (TASK-297, TASK-298), after
 * `docs/design/wireframes/admin-product-edit-desktop.dc.html`, `-mobile` and
 * `admin-price-change-*`. The form on two thirds, the status card on the last third. Every
 * signed-in role reads; a control the user cannot use is absent with the reason as text (spec 004
 * §14 A20). The price confirmation is this page with `country`, `tier` and `amount` in the query:
 * the server computes the preview, the Confirm form posts it. Photos are spec 012b's task 7.
 */
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";

import { isCurrencyCode } from "@/config/currencies";
import { launchLocales, localeConfig } from "@/config/locales";
import {
  type ActivationCondition,
  type CatalogueActor,
  type ProductEditorView,
  adminRequestId,
  adminT,
  can,
  marginTab,
  previewPriceChange,
  productEditorView,
  requireAdminPage,
} from "@/modules/admin";
import { formatMoney, formatNumber, formatPercentBp } from "@/modules/i18n";
import { AdminButton, AdminRefusal } from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminCode,
  AdminField,
  AdminNote,
  AdminRow,
  AdminTable,
  AdminTabs,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminCard,
  AdminChecklist,
  AdminKeyValues,
  AdminRecordColumns,
  AdminRecordHead,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";
import { AdminFrame } from "../../../frame";
import {
  confirmPriceAction,
  removeFromCountryAction,
  saveCopyAction,
  saveProductAction,
  saveTiersAction,
  setStatusAction,
} from "../actions";
import {
  DetailsForm,
  type Outcome,
  OutcomeBanner,
  OutcomeSchema,
  fieldError,
  rulesByField,
  ruleText,
} from "../view";

export const dynamic = "force-dynamic";

const BASE = "/admin/catalogue/products";
const TABS = ["details", "sizes", "text", "prices", "margin"] as const;
type Tab = (typeof TABS)[number];
const CONDITIONS: readonly ActivationCondition[] = [
  "en_copy",
  "sizes",
  "primary_photo",
  "price",
];
const STATUSES = ["draft", "active", "retired"] as const;

const QuerySchema = z
  .object({
    tab: z.enum(TABS).catch("details"),
    locale: z
      .enum(launchLocales as unknown as [string, ...string[]])
      .catch("en"),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .optional()
      .catch(undefined),
    tier: z
      .string()
      .regex(/^[a-z0-9_]{1,40}$/u)
      .optional()
      .catch(undefined),
    amount: z.string().max(32).optional().catch(undefined),
  })
  .catch({ tab: "details", locale: "en" });

function money(amountMinor: number, currency: string): string {
  return isCurrencyCode(currency)
    ? formatMoney({ amountMinor, currency }, "en")
    : currency;
}

function statusLabel(status: string): string {
  const known = z.enum(STATUSES).safeParse(status);
  return known.success
    ? adminT(`admin.catalogue.status.${known.data}`)
    : status;
}

function Hidden({ view }: { readonly view: ProductEditorView }): ReactElement {
  return (
    <>
      <input type="hidden" name="productId" value={view.id} />
      <input type="hidden" name="sku" value={view.sku} />
      <input
        type="hidden"
        name="updatedAt"
        value={view.updatedAt.toISOString()}
      />
    </>
  );
}

function StatusCard({
  view,
  mayEdit,
}: {
  readonly view: ProductEditorView;
  readonly mayEdit: boolean;
}): ReactElement {
  return (
    <AdminCard
      title={adminT("admin.catalogue.statusCard.title", {
        status: statusLabel(view.status),
      })}
    >
      {view.status === "draft" ? (
        <>
          <p className="text-[14px]">
            {adminT("admin.catalogue.statusCard.toActivate")}
          </p>
          <AdminChecklist
            checks={CONDITIONS.map((condition) => ({
              key: condition,
              met: !view.unmet.includes(condition),
              text: adminT(`admin.catalogue.statusCard.condition.${condition}`),
            }))}
            metLabel={adminT("admin.catalogue.statusCard.met")}
            missingLabel={adminT("admin.catalogue.statusCard.missing")}
          />
          {mayEdit && view.unmet.length === 0 ? (
            <form action={setStatusAction} className="grid gap-[6px]">
              <Hidden view={view} />
              <input type="hidden" name="status" value="active" />
              <AdminButton tone="primary">
                {adminT("admin.catalogue.statusCard.activate")}
              </AdminButton>
              <AdminNote>
                {adminT("admin.catalogue.statusCard.activateHint")}
              </AdminNote>
            </form>
          ) : null}
        </>
      ) : null}
      {view.status === "active" && mayEdit ? (
        view.exposed ? (
          <AdminNote>
            {adminT("admin.catalogue.statusCard.retireAbsent")}
          </AdminNote>
        ) : (
          <form action={setStatusAction}>
            <Hidden view={view} />
            <input type="hidden" name="status" value="retired" />
            <AdminButton tone="danger">
              {adminT("admin.catalogue.statusCard.retire")}
            </AdminButton>
          </form>
        )
      ) : null}
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "onSite",
            label: adminT("admin.catalogue.statusCard.onSite"),
            value: adminT(
              view.exposed
                ? "admin.catalogue.statusCard.exposedYes"
                : "admin.catalogue.statusCard.exposedNo",
            ),
          },
        ]}
      />
      {view.windowOpen && view.source === "seed" ? (
        <AdminNote>{adminT("admin.catalogue.statusCard.window")}</AdminNote>
      ) : null}
    </AdminCard>
  );
}

function SizesTab({
  view,
  outcome,
  mayEdit,
  maySupply,
}: {
  readonly view: ProductEditorView;
  readonly outcome: Outcome;
  readonly mayEdit: boolean;
  readonly maySupply: boolean;
}): ReactElement {
  const rules = rulesByField(outcome);
  const supplier = view.mappings[0];
  const rows = [
    ...view.tiers,
    { tierKey: "", stems: null, sort: view.tiers.length, isDefault: false },
    { tierKey: "", stems: null, sort: view.tiers.length + 1, isDefault: false },
  ];
  return (
    <AdminSection title={adminT("admin.catalogue.sizes.title")}>
      <form action={saveTiersAction} className="grid gap-[12px]">
        <Hidden view={view} />
        <input type="hidden" name="rows" value={rows.length} />
        {supplier === undefined ? null : (
          <input type="hidden" name="supplierId" value={supplier.partnerId} />
        )}
        {rules.get("tiers") === undefined ? null : (
          <AdminRefusal>
            {(rules.get("tiers") ?? []).map(ruleText).join(" ")}
          </AdminRefusal>
        )}
        <div className="overflow-x-auto">
          <AdminTable
            columns={[
              { key: "key", label: adminT("admin.catalogue.sizes.key") },
              { key: "stems", label: adminT("admin.catalogue.sizes.stems") },
              { key: "sort", label: adminT("admin.catalogue.sizes.sort") },
              {
                key: "default",
                label: adminT("admin.catalogue.sizes.default"),
              },
              ...(maySupply && supplier !== undefined
                ? [
                    {
                      key: "payout",
                      label: adminT("admin.catalogue.sizes.floristPrice"),
                    },
                  ]
                : []),
            ]}
          >
            {rows.map((tier, index) => {
              const at = String(index);
              const error = fieldError(rules, `tiers.${at}.stems`);
              const payout = view.mappings.find(
                (mapping) =>
                  mapping.partnerId === supplier?.partnerId &&
                  mapping.tierKey === tier.tierKey,
              );
              return (
                <AdminRow key={`row-${at}`}>
                  <AdminCell>
                    <input
                      name={`tierKey.${at}`}
                      defaultValue={tier.tierKey}
                      aria-label={adminT("admin.catalogue.sizes.key")}
                      className={adminControlClass(false)}
                    />
                  </AdminCell>
                  <AdminCell>
                    <input
                      name={`stems.${at}`}
                      inputMode="numeric"
                      defaultValue={tier.stems ?? ""}
                      aria-label={adminT("admin.catalogue.sizes.stems")}
                      className={adminControlClass(error !== undefined)}
                      {...(error === undefined
                        ? {}
                        : { "aria-invalid": true as const })}
                    />
                    {error === undefined ? null : (
                      <p className="text-danger text-[13px] font-bold">
                        {error}
                      </p>
                    )}
                  </AdminCell>
                  <AdminCell>
                    <input
                      name={`sort.${at}`}
                      inputMode="numeric"
                      defaultValue={tier.sort}
                      aria-label={adminT("admin.catalogue.sizes.sort")}
                      className={adminControlClass(false)}
                    />
                  </AdminCell>
                  <AdminCell>
                    <input
                      type="radio"
                      name="default"
                      value={at}
                      defaultChecked={tier.isDefault}
                      aria-label={adminT("admin.catalogue.sizes.default")}
                    />
                  </AdminCell>
                  {maySupply && supplier !== undefined ? (
                    <AdminCell>
                      <input
                        name={`payout.${at}`}
                        inputMode="decimal"
                        defaultValue=""
                        placeholder={
                          payout === undefined
                            ? ""
                            : money(payout.payoutMinor, payout.currency)
                        }
                        aria-label={adminT(
                          "admin.catalogue.sizes.floristPrice",
                        )}
                        className={adminControlClass(false)}
                      />
                    </AdminCell>
                  ) : null}
                </AdminRow>
              );
            })}
          </AdminTable>
        </div>
        <AdminNote>{adminT("admin.catalogue.sizes.addRow")}</AdminNote>
        <AdminNote>{adminT("admin.catalogue.sizes.hint")}</AdminNote>
        {mayEdit ? (
          <div>
            <AdminButton tone="primary">
              {adminT("admin.catalogue.sizes.save")}
            </AdminButton>
          </div>
        ) : null}
      </form>
    </AdminSection>
  );
}

function TextTab({
  view,
  outcome,
  locale,
  mayEdit,
  maySaveLocale,
}: {
  readonly view: ProductEditorView;
  readonly outcome: Outcome;
  readonly locale: string;
  readonly mayEdit: boolean;
  readonly maySaveLocale: boolean;
}): ReactElement {
  const rules = rulesByField(outcome);
  const copy = view.copy.find((item) => item.locale === locale);
  const words = (copy?.description ?? "")
    .split(/\s+/u)
    .filter((word) => word !== "").length;
  const field = (
    id: string,
    name: "name" | "slug" | "description" | "seoTitle" | "seoDescription",
    value: string,
    hint?: string,
  ): ReactElement => {
    const error = fieldError(rules, name);
    const control = {
      id,
      name,
      defaultValue: value,
      readOnly: !maySaveLocale || (name === "slug" && view.exposed),
      className: adminControlClass(error !== undefined),
      ...adminFieldAria(id, hint, error),
    };
    return (
      <AdminField
        id={id}
        label={adminT(`admin.catalogue.text.${name}`)}
        hint={hint}
        error={error}
        full
      >
        {name === "description" ? (
          <textarea rows={6} {...control} />
        ) : (
          <input {...control} />
        )}
      </AdminField>
    );
  };
  return (
    <div className="grid gap-[16px]">
      <AdminTabs
        label={adminT("admin.catalogue.text.languages")}
        tabs={launchLocales.map((code) => {
          const item = view.copy.find((entry) => entry.locale === code);
          return {
            key: code,
            label: localeConfig(code).nativeName,
            count:
              item === undefined
                ? adminT("admin.catalogue.text.noText")
                : adminT(
                    item.reviewed
                      ? "admin.catalogue.text.approved"
                      : "admin.catalogue.text.notReviewed",
                  ),
            href: `${BASE}/${view.sku}?tab=text&locale=${code}`,
            current: code === locale,
          };
        })}
      />
      {maySaveLocale ? null : (
        <AdminNote>{adminT("admin.catalogue.text.forbidden")}</AdminNote>
      )}
      <form action={saveCopyAction} className="grid gap-[16px]">
        <Hidden view={view} />
        <input type="hidden" name="locale" value={locale} />
        {field("copy-name", "name", copy?.name ?? "")}
        {field(
          "copy-slug",
          "slug",
          copy?.slug ?? "",
          adminT(
            view.exposed
              ? "admin.catalogue.text.slugLocked"
              : "admin.catalogue.text.slugFree",
          ),
        )}
        {field(
          "copy-description",
          "description",
          copy?.description ?? "",
          adminT("admin.catalogue.text.descriptionHint", { words }),
        )}
        {field(
          "copy-seo-title",
          "seoTitle",
          copy?.seoTitle ?? "",
          adminT("admin.catalogue.text.seoTitleHint", {
            count: formatNumber([...(copy?.seoTitle ?? "")].length, "en"),
          }),
        )}
        {field(
          "copy-seo-description",
          "seoDescription",
          copy?.seoDescription ?? "",
          adminT("admin.catalogue.text.seoDescriptionHint", {
            count: formatNumber([...(copy?.seoDescription ?? "")].length, "en"),
          }),
        )}
        {outcome.result === "reason_required" ? (
          <AdminField
            id="copy-reason"
            label={adminT("admin.catalogue.text.reason")}
            hint={adminT("admin.catalogue.text.reasonHint")}
            full
          >
            <input
              id="copy-reason"
              name="overrideReason"
              required
              minLength={3}
              className={adminControlClass(false)}
            />
          </AdminField>
        ) : null}
        {mayEdit && maySaveLocale ? (
          <div>
            <AdminButton tone="primary">
              {adminT("admin.catalogue.text.save")}
            </AdminButton>
          </div>
        ) : null}
      </form>
    </div>
  );
}

async function PricesTab({
  view,
  actor,
  query,
  outcome,
  mayPrice,
}: {
  readonly view: ProductEditorView;
  readonly actor: CatalogueActor;
  readonly query: z.infer<typeof QuerySchema>;
  readonly outcome: Outcome;
  readonly mayPrice: boolean;
}): Promise<ReactElement> {
  const asking =
    query.country !== undefined &&
    query.tier !== undefined &&
    query.amount !== undefined;
  const check = asking
    ? await previewPriceChange(actor, {
        productId: view.id,
        countryIso2: query.country,
        tierKey: query.tier,
        amountText: query.amount,
      })
    : undefined;
  const priced = [...new Set(view.prices.map((price) => price.iso2))];
  const rules = rulesByField(outcome);
  return (
    <div className="grid gap-[20px]">
      <AdminSection title={adminT("admin.catalogue.prices.title")}>
        <div className="overflow-x-auto">
          <AdminTable
            columns={[
              {
                key: "country",
                label: adminT("admin.catalogue.prices.country"),
              },
              { key: "size", label: adminT("admin.catalogue.prices.size") },
              {
                key: "price",
                label: adminT("admin.catalogue.prices.current"),
                align: "end",
              },
              { key: "since", label: adminT("admin.catalogue.prices.since") },
            ]}
          >
            {view.prices.map((price) => (
              <AdminRow key={`${price.iso2}-${price.tierKey}`}>
                <AdminCell nowrap>{price.iso2}</AdminCell>
                <AdminCell nowrap>
                  <AdminCode>{price.tierKey}</AdminCode>
                </AdminCell>
                <AdminCell align="end">
                  {money(price.retailMinor, price.currency)}
                </AdminCell>
                <AdminCell nowrap>{price.activeFrom}</AdminCell>
              </AdminRow>
            ))}
          </AdminTable>
        </div>
        {mayPrice ? (
          <form
            method="get"
            action={`${BASE}/${view.sku}`}
            className="grid gap-[12px] md:grid-cols-4 md:items-end"
          >
            <input type="hidden" name="tab" value="prices" />
            <AdminField
              id="price-country"
              label={adminT("admin.catalogue.prices.country")}
            >
              <select
                id="price-country"
                name="country"
                defaultValue={query.country}
                className={adminControlClass(false)}
              >
                {view.countries.map((item) => (
                  <option
                    key={item.iso2}
                    value={item.iso2}
                  >{`${item.iso2} · ${item.currency}`}</option>
                ))}
              </select>
            </AdminField>
            <AdminField
              id="price-size"
              label={adminT("admin.catalogue.prices.size")}
            >
              <select
                id="price-size"
                name="tier"
                defaultValue={query.tier}
                className={adminControlClass(false)}
              >
                {view.tiers.map((tier) => (
                  <option key={tier.tierKey} value={tier.tierKey}>
                    {tier.tierKey}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField
              id="price-amount"
              label={adminT("admin.catalogue.prices.amount")}
              hint={adminT("admin.catalogue.prices.amountHint")}
              error={fieldError(rules, "amount")}
            >
              <input
                id="price-amount"
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={query.amount}
                required
                className={adminControlClass(
                  fieldError(rules, "amount") !== undefined,
                )}
                {...adminFieldAria(
                  "price-amount",
                  adminT("admin.catalogue.prices.amountHint"),
                  fieldError(rules, "amount"),
                )}
              />
            </AdminField>
            <div>
              <AdminButton>
                {adminT("admin.catalogue.prices.check")}
              </AdminButton>
            </div>
          </form>
        ) : (
          <AdminNote>{adminT("admin.catalogue.prices.editAbsent")}</AdminNote>
        )}
      </AdminSection>
      {check === undefined ? null : check.ok ? (
        <AdminCard title={adminT("admin.catalogue.change.title")}>
          <AdminTable
            columns={[
              { key: "locale", label: adminT("admin.catalogue.change.locale") },
              {
                key: "old",
                label: adminT("admin.catalogue.change.old"),
                align: "end",
              },
              {
                key: "new",
                label: adminT("admin.catalogue.change.new"),
                align: "end",
              },
            ]}
          >
            {check.value.preview.rows.map((row) => (
              <AdminRow key={row.locale}>
                <AdminCell nowrap>
                  {localeConfig(row.locale).nativeName}
                </AdminCell>
                <AdminCell align="end">
                  {row.old ?? adminT("admin.catalogue.prices.none")}
                </AdminCell>
                <AdminCell align="end">{row.new}</AdminCell>
              </AdminRow>
            ))}
          </AdminTable>
          <AdminKeyValues
            variant="tight"
            items={[
              ...(check.value.preview.changeBp === null
                ? []
                : [
                    {
                      key: "percent",
                      label: adminT("admin.catalogue.change.percent"),
                      value: formatPercentBp(
                        check.value.preview.changeBp,
                        "en",
                      ),
                      numeric: true,
                    },
                  ]),
              {
                key: "lowest",
                label: adminT("admin.catalogue.change.lowest"),
                value:
                  check.value.preview.lowest ??
                  adminT("admin.catalogue.change.lowestNone"),
              },
            ]}
          />
          {check.value.preview.warn ? (
            <AdminRefusal>{adminT("admin.catalogue.change.warn")}</AdminRefusal>
          ) : null}
          {check.value.violations.map((item) => (
            <AdminNote key={item.rule}>{ruleText(item.rule)}</AdminNote>
          ))}
          {check.value.sameDay && view.firstActiveAt !== null ? (
            <AdminRefusal>
              {adminT("admin.catalogue.change.sameDay")}
            </AdminRefusal>
          ) : check.value.verdict === "below_payout" ? (
            <AdminRefusal>
              {adminT("admin.catalogue.change.below", {
                payout: money(
                  check.value.margin.highestPayoutMinor ?? 0,
                  check.value.currency,
                ),
              })}
            </AdminRefusal>
          ) : (
            <form action={confirmPriceAction} className="grid gap-[10px]">
              <input type="hidden" name="productId" value={view.id} />
              <input type="hidden" name="sku" value={view.sku} />
              <input type="hidden" name="country" value={query.country} />
              <input type="hidden" name="tier" value={query.tier} />
              <input type="hidden" name="amount" value={query.amount} />
              <input
                type="hidden"
                name="draft"
                value={view.firstActiveAt === null ? "yes" : "no"}
              />
              {view.firstActiveAt === null ? (
                <AdminNote>
                  {adminT("admin.catalogue.change.draftNote")}
                </AdminNote>
              ) : null}
              {check.value.verdict === "share_high" ? (
                <AdminNote>
                  {adminT("admin.catalogue.change.share", {
                    share: formatPercentBp(
                      check.value.margin.payoutShareBp ?? 0,
                      "en",
                    ),
                  })}
                </AdminNote>
              ) : null}
              {check.value.verdict === "share_high" ||
              check.value.violations.some(
                (item) => item.severity === "soft",
              ) ? (
                <AdminField
                  id="price-reason"
                  label={adminT("admin.catalogue.change.reason")}
                >
                  <input
                    id="price-reason"
                    name="overrideReason"
                    required
                    minLength={3}
                    className={adminControlClass(false)}
                  />
                </AdminField>
              ) : null}
              <div className="flex flex-wrap gap-[10px]">
                <AdminButton tone="primary">
                  {adminT("admin.catalogue.change.confirm")}
                </AdminButton>
                <a
                  href={`${BASE}/${view.sku}?tab=prices`}
                  className="self-center text-[14px]"
                >
                  {adminT("admin.catalogue.change.cancel")}
                </a>
              </div>
            </form>
          )}
        </AdminCard>
      ) : (
        <AdminRefusal>
          {adminT(`admin.catalogue.refused.${check.reason}`)}
        </AdminRefusal>
      )}
      {mayPrice
        ? priced.map((iso2) =>
            view.exposed ? (
              <AdminNote key={iso2}>
                {adminT("admin.catalogue.prices.removeAbsent", {
                  country: iso2,
                })}
              </AdminNote>
            ) : (
              <form key={iso2} action={removeFromCountryAction}>
                <input type="hidden" name="productId" value={view.id} />
                <input type="hidden" name="sku" value={view.sku} />
                <input type="hidden" name="country" value={iso2} />
                <AdminButton tone="danger">
                  {adminT("admin.catalogue.prices.remove", { country: iso2 })}
                </AdminButton>
              </form>
            ),
          )
        : null}
    </div>
  );
}

async function MarginTab({
  view,
  actor,
  country,
}: {
  readonly view: ProductEditorView;
  readonly actor: CatalogueActor;
  readonly country: string;
}): Promise<ReactElement> {
  const rows = await marginTab(actor, view.id, country);
  const first = rows[0];
  return (
    <AdminSection title={adminT("admin.catalogue.margin.title")}>
      <form
        method="get"
        action={`${BASE}/${view.sku}`}
        className="flex flex-wrap items-end gap-[12px]"
      >
        <input type="hidden" name="tab" value="margin" />
        <AdminField
          id="margin-country"
          label={adminT("admin.catalogue.margin.country")}
        >
          <select
            id="margin-country"
            name="country"
            defaultValue={country}
            className={adminControlClass(false)}
          >
            {view.countries.map((item) => (
              <option key={item.iso2} value={item.iso2}>
                {item.iso2}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminButton tone="ghost">
          {adminT("admin.catalogue.margin.show")}
        </AdminButton>
      </form>
      {first === undefined ? (
        <AdminNote>{adminT("admin.catalogue.margin.none")}</AdminNote>
      ) : (
        <div className="overflow-x-auto">
          <AdminTable
            columns={[
              { key: "size", label: adminT("admin.catalogue.margin.size") },
              {
                key: "gross",
                label: adminT("admin.catalogue.margin.gross"),
                align: "end",
              },
              {
                key: "vat",
                label: adminT("admin.catalogue.margin.vat"),
                align: "end",
              },
              {
                key: "net",
                label: adminT("admin.catalogue.margin.net"),
                align: "end",
              },
              {
                key: "lowest",
                label: adminT("admin.catalogue.margin.lowest"),
                align: "end",
              },
              {
                key: "highest",
                label: adminT("admin.catalogue.margin.highest"),
                align: "end",
              },
              {
                key: "margin",
                label: adminT("admin.catalogue.margin.margin"),
                align: "end",
              },
              {
                key: "share",
                label: adminT("admin.catalogue.margin.share"),
                align: "end",
              },
              {
                key: "suggested",
                label: adminT("admin.catalogue.margin.suggested"),
                align: "end",
              },
            ]}
          >
            {rows.map((row) => {
              const m = row.margin;
              const amount = (value: number | null): string =>
                value === null
                  ? adminT("admin.catalogue.margin.noFlorist")
                  : money(value, m.currency);
              return (
                <AdminRow key={row.tierKey}>
                  <AdminCell nowrap>
                    <AdminCode>{row.tierKey}</AdminCode>
                  </AdminCell>
                  <AdminCell align="end">
                    {money(m.grossMinor, m.currency)}
                  </AdminCell>
                  <AdminCell align="end">
                    {money(m.vatMinor, m.currency)}
                  </AdminCell>
                  <AdminCell align="end">
                    {money(m.netMinor, m.currency)}
                  </AdminCell>
                  <AdminCell align="end">
                    {amount(m.lowestPayoutMinor)}
                  </AdminCell>
                  <AdminCell align="end">
                    {amount(m.highestPayoutMinor)}
                  </AdminCell>
                  <AdminCell align="end">{amount(m.marginMinor)}</AdminCell>
                  <AdminCell align="end">
                    {m.payoutShareBp === null ? null : (
                      <AdminChip tone={row.verdict === "ok" ? "ok" : "bad"}>
                        {formatPercentBp(m.payoutShareBp, "en")}
                      </AdminChip>
                    )}
                  </AdminCell>
                  <AdminCell align="end">
                    {amount(row.suggestedMinor)}
                  </AdminCell>
                </AdminRow>
              );
            })}
          </AdminTable>
        </div>
      )}
      {first?.margin.convertedAsOf === null || first === undefined ? null : (
        <AdminNote>
          {adminT("admin.catalogue.margin.rate", {
            date: first.margin.convertedAsOf,
          })}
        </AdminNote>
      )}
      {rows.some((row) => row.margin.unconverted.length > 0) ? (
        <AdminNote>
          {adminT("admin.catalogue.margin.unconverted", {
            florists: [
              ...new Set(rows.flatMap((row) => row.margin.unconverted)),
            ].join(", "),
          })}
        </AdminNote>
      ) : null}
    </AdminSection>
  );
}

export default async function ProductEditorPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ sku: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const { sku } = await params;
  const raw = await searchParams;
  const query = QuerySchema.parse(raw);
  const outcome = OutcomeSchema.parse(raw);
  const actor: CatalogueActor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const view = await productEditorView(actor, sku);
  if (view === undefined) notFound();
  const mayEdit = can(session.roles, "catalogue.edit");
  const maySupply =
    can(session.roles, "catalogue.supplier") &&
    can(session.roles, "partner.payout");
  const mayPrice = can(session.roles, "price.edit");
  const en = view.copy.find((item) => item.locale === "en");
  const supplier = view.mappings[0];
  const tab: Tab = query.tab;
  const pricedCountries = new Set(view.prices.map((price) => price.iso2));

  const main =
    tab === "details" ? (
      <DetailsForm
        values={{
          productId: view.id,
          updatedAt: view.updatedAt.toISOString(),
          sku: view.sku,
          ...view.details,
          supplierId: supplier?.partnerId ?? "",
        }}
        florists={view.florists}
        maySupply={maySupply}
        mayEdit={mayEdit}
        action={saveProductAction}
      />
    ) : tab === "sizes" ? (
      <SizesTab
        view={view}
        outcome={outcome}
        mayEdit={mayEdit}
        maySupply={maySupply}
      />
    ) : tab === "text" ? (
      <TextTab
        view={view}
        outcome={outcome}
        locale={query.locale}
        mayEdit={mayEdit}
        maySaveLocale={
          session.roles.includes("admin") ||
          view.reviewerLocales.includes(query.locale)
        }
      />
    ) : tab === "prices" ? (
      <PricesTab
        view={view}
        actor={actor}
        query={query}
        outcome={outcome}
        mayPrice={mayPrice}
      />
    ) : (
      <MarginTab
        view={view}
        actor={actor}
        country={query.country ?? view.prices[0]?.iso2 ?? "PL"}
      />
    );

  return (
    <AdminFrame session={session} current="catalogue">
      <div className="grid gap-[16px]">
        <AdminBackLink href={BASE}>
          {adminT("admin.catalogue.back")}
        </AdminBackLink>
        <AdminRecordHead
          title={en?.name ?? view.sku}
          sub={
            <>
              <AdminCode>{view.sku}</AdminCode>
              <AdminChip tone={view.status === "active" ? "ok" : "plain"}>
                {statusLabel(view.status)}
              </AdminChip>
              {view.source === "seed" ? (
                <AdminChip tone="demo">
                  {adminT("admin.catalogue.placeholderChip")}
                </AdminChip>
              ) : null}
              {supplier === undefined ? null : (
                <span>
                  {adminT("admin.catalogue.fromFlorist", {
                    florist: supplier.code,
                  })}
                </span>
              )}
            </>
          }
        />
        <OutcomeBanner outcome={outcome} />
        <AdminTabs
          label={adminT("admin.catalogue.tabs.label")}
          tabs={TABS.map((key) => ({
            key,
            label: adminT(`admin.catalogue.tabs.${key}`),
            ...(key === "sizes"
              ? { count: formatNumber(view.tiers.length, "en") }
              : {}),
            ...(key === "text"
              ? {
                  count: `${formatNumber(view.copy.length, "en")}/${formatNumber(launchLocales.length, "en")}`,
                }
              : {}),
            ...(key === "prices"
              ? { count: formatNumber(pricedCountries.size, "en") }
              : {}),
            href: `${BASE}/${view.sku}?tab=${key}`,
            current: key === tab,
          }))}
        />
        <AdminRecordColumns
          main={main}
          aside={<StatusCard view={view} mayEdit={mayEdit} />}
        />
      </div>
    </AdminFrame>
  );
}
