/**
 * @purpose GET /admin/countries/[iso2]: one country read-only, its go-live check, the typed-code flip and the fiscal fields
 * @spec 012b
 *
 * Spec 012b §2.8, §5.3 "`/admin/countries/[iso2]`" (AC-25, AC-39 preflight half, AC-24's slice A
 * clause, §14 A-orchestrator-2026-10-20a; TASK-300), after
 * `docs/design/wireframes/admin-country-detail-desktop.dc.html` and `-mobile` and
 * `flows/admin-go-live.dc.html`. Admin layout, English, SSR `no-store`; any admin role reads it.
 *
 * Operations and corridor flags are shown with **no edit control** (their editor is slice B's,
 * AC-24). The go-live card lists the preflight, read-only on any status. Controls that cannot act
 * are absent with the reason as text (spec 004 §14 A20): Go live only on a demo country whose
 * check is clear, Back to demo on a live or disabled one, both only for `country.status`; the
 * fiscal form only while the VAT rate or the supply model is null, with exactly the null inputs.
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";

import {
  type CountryDetailView,
  adminRequestId,
  adminT,
  can,
  catalogueBackupWarning,
  countryDetail,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  type PreflightReason,
  fiscalInputsFor,
  supplyModels,
} from "@/modules/geo";
import {
  formatDate,
  formatList,
  formatNumber,
  formatPercentBp,
  formatRegionName,
} from "@/modules/i18n";
import { AdminActionDialog } from "@/modules/ui/admin/AdminActionDialog";
import {
  AdminButton,
  AdminRefusal,
  AdminToast,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminCode,
  AdminEmpty,
  AdminField,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminBanner,
  AdminCard,
  AdminChecklist,
  AdminKeyValues,
  AdminLabel,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import { CountryStatusChip, countryPagePublished } from "../status";
import { flipCountryStatusAction, saveFiscalFieldsAction } from "./actions";

export const dynamic = "force-dynamic";

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : [value].flat();

const QuerySchema = z
  .object({
    result: z
      .enum([
        "live",
        "demo",
        "disabled",
        "mismatch",
        "conflict",
        "preflight",
        "unchanged",
        "liveToDisabled",
        "disabledToLive",
        "invalid",
        "notFound",
        "forbidden",
      ])
      .optional(),
    publish: z.enum(["requested", "notStarted"]).optional(),
    code: z
      .string()
      .regex(/^[A-Z_]{1,40}$/u)
      .optional(),
    fiscal: z
      .enum([
        "saved",
        "invalid",
        "FISCAL_FIELD_ALREADY_SET",
        "notFound",
        "forbidden",
      ])
      .optional(),
    field: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => list(value)),
  })
  .catch({ field: [] });

const WEEKDAY_KEYS: Readonly<
  Record<number, `admin.countries.weekday.${1 | 2 | 3 | 4 | 5 | 6 | 7}`>
> = {
  1: "admin.countries.weekday.1",
  2: "admin.countries.weekday.2",
  3: "admin.countries.weekday.3",
  4: "admin.countries.weekday.4",
  5: "admin.countries.weekday.5",
  6: "admin.countries.weekday.6",
  7: "admin.countries.weekday.7",
};

/** ISO weekday 1 to 7 as words; a run of three or more consecutive days reads "Monday to Saturday". */
function daysText(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const name = (day: number): string => {
    const key = WEEKDAY_KEYS[day];
    return key === undefined ? String(day) : adminT(key);
  };
  const first = sorted[0];
  const last = sorted.at(-1);
  if (
    first !== undefined &&
    last !== undefined &&
    sorted.length >= 3 &&
    last - first === sorted.length - 1
  ) {
    return adminT("admin.countries.facts.dayRange", {
      first: name(first),
      last: name(last),
    });
  }
  return formatList(sorted.map(name), "en");
}

/** The checklist's lines: §2.8's conditions, the two fiscal reasons on one line as drawn. */
function checks(
  country: CountryDetailView,
  name: string,
): readonly { key: string; met: boolean; text: string }[] {
  const unmet = new Set<PreflightReason>(country.preflight.reasons);
  const noVat = unmet.has("vatRateMissing");
  const noSupply = unmet.has("supplyModelMissing");
  return [
    {
      key: "operations",
      met: !unmet.has("operationsIncomplete"),
      text: adminT("admin.countries.check.operations"),
    },
    {
      key: "fiscal",
      met: !noVat && !noSupply,
      text: adminT(
        noVat && noSupply
          ? "admin.countries.check.fiscalNeither"
          : noVat
            ? "admin.countries.check.fiscalNoVat"
            : noSupply
              ? "admin.countries.check.fiscalNoSupply"
              : "admin.countries.check.fiscal",
      ),
    },
    {
      key: "florist",
      met: !unmet.has("noRealFlorist"),
      text: adminT("admin.countries.check.florist", { country: name }),
    },
    {
      key: "products",
      met: !unmet.has("tooFewSaleableProducts"),
      text: adminT("admin.countries.check.products", {
        count: country.preflight.saleableProducts,
        floor: country.preflight.productFloor,
      }),
    },
    {
      key: "corridor",
      met: !unmet.has("corridorNotReviewed"),
      text: adminT("admin.countries.check.corridor"),
    },
    {
      key: "sanctions",
      met: !unmet.has("sanctioned"),
      text: adminT("admin.countries.check.sanctions", { country: name }),
    },
  ];
}

/** One status move's form: the country, the status the page showed, the status asked for. */
function FlipFields({
  country,
  to,
}: {
  readonly country: CountryDetailView;
  readonly to: "live" | "demo";
}): ReactElement {
  return (
    <>
      <input type="hidden" name="iso2" value={country.iso2} />
      <input type="hidden" name="from" value={country.status} />
      <input type="hidden" name="to" value={to} />
    </>
  );
}

function GoLiveDialog({
  country,
  name,
  mismatch,
}: {
  readonly country: CountryDetailView;
  readonly name: string;
  readonly mismatch: boolean;
}): ReactElement {
  const fieldId = "go-live-code";
  const error = mismatch
    ? adminT("admin.countries.result.mismatch", { iso2: country.iso2 })
    : undefined;
  return (
    <AdminActionDialog
      id="go-live"
      openLabel={adminT("admin.countries.goLive.button", { country: name })}
      openTone="primary"
      title={adminT("admin.countries.goLive.title", { country: name })}
      initiallyOpen={mismatch}
      closeLabel={adminT("admin.countries.goLive.cancel")}
    >
      <ul className="text-ink-2 grid list-disc gap-[4px] ps-[20px] text-[14px]">
        <li>
          {adminT("admin.countries.goLive.bodySearch", { country: name })}
        </li>
        <li>{adminT("admin.countries.goLive.bodyOffers")}</li>
        <li>{adminT("admin.countries.goLive.bodyPublish")}</li>
        <li>{adminT("admin.countries.goLive.bodyFirstLive")}</li>
      </ul>
      <form action={flipCountryStatusAction} className="grid gap-[14px]">
        <FlipFields country={country} to="live" />
        <AdminField
          id={fieldId}
          label={adminT("admin.countries.goLive.field", { iso2: country.iso2 })}
          error={error}
        >
          <input
            id={fieldId}
            name="confirmCode"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={adminControlClass(error !== undefined)}
            {...adminFieldAria(fieldId, undefined, error)}
          />
        </AdminField>
        <div className="flex justify-end">
          <AdminButton tone="primary">
            {adminT("admin.countries.goLive.confirm")}
          </AdminButton>
        </div>
      </form>
    </AdminActionDialog>
  );
}

function BackToDemoDialog({
  country,
  name,
}: {
  readonly country: CountryDetailView;
  readonly name: string;
}): ReactElement {
  return (
    <AdminActionDialog
      id="back-to-demo"
      openLabel={adminT("admin.countries.backToDemo.button")}
      openTone="danger"
      title={adminT("admin.countries.backToDemo.title", { country: name })}
      closeLabel={adminT("admin.countries.backToDemo.cancel")}
    >
      <p className="text-ink-2 text-[14px]">
        {adminT("admin.countries.backToDemo.body")}
      </p>
      <form action={flipCountryStatusAction} className="flex justify-end">
        <FlipFields country={country} to="demo" />
        <AdminButton tone="dangerFill">
          {adminT("admin.countries.backToDemo.confirm")}
        </AdminButton>
      </form>
    </AdminActionDialog>
  );
}

/** The accountant's answer: exactly the fiscal inputs whose stored value is null. */
function FiscalForm({
  country,
  errors,
}: {
  readonly country: CountryDetailView;
  readonly errors: ReadonlySet<string>;
}): ReactElement | null {
  const inputs = fiscalInputsFor(country);
  if (inputs.length === 0) return null;
  const vatError = errors.has("vatRateBp")
    ? adminT("admin.countries.fiscal.errorVat")
    : undefined;
  const supplyError = errors.has("supplyModel")
    ? adminT("admin.countries.fiscal.errorSupply")
    : undefined;
  const reasonError = errors.has("reason")
    ? adminT("admin.countries.fiscal.errorReason")
    : undefined;
  const vatHint = adminT("admin.countries.fiscal.vatHint");
  const reasonHint = adminT("admin.countries.fiscal.reasonHint");
  return (
    <form
      action={saveFiscalFieldsAction}
      className="border-rule grid gap-[12px] border-t pt-[14px]"
    >
      <AdminLabel>{adminT("admin.countries.fiscal.title")}</AdminLabel>
      <AdminQuiet>{adminT("admin.countries.fiscal.note")}</AdminQuiet>
      <input type="hidden" name="iso2" value={country.iso2} />
      {inputs.includes("vatRateBp") ? (
        <AdminField
          id="fiscal-vat"
          label={adminT("admin.countries.fiscal.vat")}
          hint={vatHint}
          error={vatError}
        >
          <input
            id="fiscal-vat"
            name="vatRateBp"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={adminControlClass(vatError !== undefined)}
            {...adminFieldAria("fiscal-vat", vatHint, vatError)}
          />
        </AdminField>
      ) : null}
      {inputs.includes("supplyModel") ? (
        <fieldset
          className="grid gap-[6px]"
          {...adminFieldAria("fiscal-supply", undefined, supplyError)}
        >
          <legend className="text-ink-3 mb-[4px] text-[12px] font-bold tracking-[0.08em] uppercase">
            {adminT("admin.countries.fiscal.supply")}
          </legend>
          {supplyModels.map((model) => (
            <label
              key={model}
              className="flex min-h-[32px] items-center gap-[8px] text-[14px]"
            >
              <input type="radio" name="supplyModel" value={model} />
              {adminT(`admin.countries.supply.${model}`)}
            </label>
          ))}
          {supplyError === undefined ? null : (
            <p
              id="fiscal-supply-error"
              className="text-danger text-[13px] font-bold"
            >
              {supplyError}
            </p>
          )}
        </fieldset>
      ) : null}
      <AdminField
        id="fiscal-reason"
        label={adminT("admin.countries.fiscal.reason")}
        hint={reasonHint}
        error={reasonError}
      >
        <textarea
          id="fiscal-reason"
          name="reason"
          rows={3}
          required
          className={`${adminControlClass(reasonError !== undefined)} py-[8px]`}
          {...adminFieldAria("fiscal-reason", reasonHint, reasonError)}
        />
      </AdminField>
      <div>
        <AdminButton>{adminT("admin.countries.fiscal.save")}</AdminButton>
      </div>
    </form>
  );
}

function Outcome({
  query,
  name,
  iso2,
}: {
  readonly query: z.infer<typeof QuerySchema>;
  readonly name: string;
  readonly iso2: string;
}): ReactNode {
  const parts: ReactNode[] = [];
  if (query.result === "live") {
    parts.push(
      <AdminToast key="live">
        {query.publish === "requested"
          ? adminT("admin.countries.result.live", { country: name })
          : adminT("admin.countries.result.liveNoPublish", { country: name })}
      </AdminToast>,
    );
  } else if (query.result === "demo" || query.result === "disabled") {
    parts.push(
      <AdminToast key="demo">
        {adminT("admin.countries.result.demo", { country: name })}
      </AdminToast>,
    );
  } else if (query.result === "conflict" || query.result === "preflight") {
    parts.push(
      <AdminRefusal key="refused">
        {adminT(`admin.countries.result.${query.result}`)}
      </AdminRefusal>,
    );
  } else if (query.result !== undefined && query.result !== "mismatch") {
    parts.push(
      <AdminRefusal key="refused">
        {adminT("admin.countries.result.refused")}
      </AdminRefusal>,
    );
  }
  if (query.publish === "notStarted" && query.code !== undefined) {
    parts.push(
      <AdminRefusal key="publish">
        {adminT("admin.countries.result.publishNotStarted", {
          code: query.code,
        })}
      </AdminRefusal>,
    );
  }
  if (query.fiscal === "saved") {
    parts.push(
      <AdminToast key="fiscal">
        {adminT("admin.countries.fiscal.saved")}
      </AdminToast>,
    );
  } else if (query.fiscal === "FISCAL_FIELD_ALREADY_SET") {
    parts.push(
      <AdminRefusal key="fiscal">
        {adminT("admin.countries.fiscal.alreadySet")}
      </AdminRefusal>,
    );
  }
  return parts.length === 0 ? null : (
    <div className="grid gap-[8px]" data-country={iso2}>
      {parts}
    </div>
  );
}

export default async function CountryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ iso2: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const { iso2: raw } = await params;
  const query = QuerySchema.parse(await searchParams);
  const country = await countryDetail(
    { userId: session.userId, requestId: await adminRequestId() },
    raw.toUpperCase(),
  );
  if (country === undefined) notFound();

  const name = formatRegionName(country.iso2, "en");
  const n = (value: number): string => formatNumber(value, "en");
  const mayFlip = can(session.roles, "country.status");
  const ready = country.preflight.reasons.length === 0;
  const fieldErrors = new Set(query.fiscal === "invalid" ? query.field : []);
  const published = (value: boolean): string =>
    value
      ? adminT("admin.countries.published")
      : adminT("admin.countries.notPublished");
  const notSet = adminT("admin.countries.facts.notSet");

  const facts = (
    <AdminSection title={adminT("admin.countries.facts.title")}>
      <AdminCard>
        <AdminKeyValues
          items={[
            {
              key: "vat",
              label: adminT("admin.countries.facts.vatRate"),
              value:
                country.vatRateBp === null ? (
                  notSet
                ) : (
                  <>
                    {formatPercentBp(country.vatRateBp, "en")}{" "}
                    <AdminSecondLine>
                      <AdminCode>
                        {adminT("admin.countries.facts.vatRateCode", {
                          value: String(country.vatRateBp),
                        })}
                      </AdminCode>
                    </AdminSecondLine>
                  </>
                ),
            },
            {
              key: "zone",
              label: adminT("admin.countries.facts.zone"),
              value: country.ianaZone,
            },
            {
              key: "cutoff",
              label: adminT("admin.countries.facts.cutoff"),
              value:
                country.sameDayCutoffLocal === null
                  ? notSet
                  : adminT("admin.countries.facts.cutoffValue", {
                      time: country.sameDayCutoffLocal,
                      city: zoneCity(country.ianaZone),
                    }),
            },
            {
              key: "days",
              label: adminT("admin.countries.facts.deliveryDays"),
              value:
                country.deliveryDays.length === 0
                  ? notSet
                  : daysText(country.deliveryDays),
            },
            {
              key: "sundays",
              label: adminT("admin.countries.facts.sundays"),
              value: adminT(`admin.countries.sunday.${country.sundayDelivery}`),
            },
            {
              key: "supply",
              label: adminT("admin.countries.facts.supplyModel"),
              value: (
                <>
                  {country.supplyModel === "principal" ||
                  country.supplyModel === "agent"
                    ? adminT(`admin.countries.supply.${country.supplyModel}`)
                    : notSet}
                  <AdminSecondLine>
                    {adminT("admin.countries.facts.supplyNote")}
                  </AdminSecondLine>
                </>
              ),
            },
            {
              key: "guide",
              label: adminT("admin.countries.facts.guide"),
              value: published(country.guidePublished),
            },
            {
              key: "countryPage",
              label: adminT("admin.countries.facts.countryPage"),
              value: published(countryPagePublished(country.iso2)),
            },
          ]}
        />
        <AdminBanner small>
          <AdminChip>{adminT("admin.countries.later.title")}</AdminChip>
          {adminT("admin.countries.later.body")}
        </AdminBanner>
      </AdminCard>
    </AdminSection>
  );

  const florists = (
    <AdminSection
      title={adminT("admin.countries.florists.title", { country: name })}
    >
      {country.florists.length === 0 ? (
        <AdminEmpty
          title={adminT("admin.countries.florists.empty", { country: name })}
        />
      ) : (
        <AdminTable
          columns={[
            {
              key: "florist",
              label: adminT("admin.countries.florists.colFlorist"),
            },
            {
              key: "status",
              label: adminT("admin.countries.florists.colStatus"),
            },
            {
              key: "products",
              label: adminT("admin.countries.florists.colProducts"),
              align: "end",
            },
          ]}
        >
          {country.florists.map((florist) => (
            <AdminRow key={florist.code} muted={florist.status === "demo"}>
              <AdminCell>
                {florist.legalName}
                <AdminSecondLine>{florist.cityLabel}</AdminSecondLine>
              </AdminCell>
              <AdminCell>
                <AdminChip
                  tone={
                    florist.status === "active"
                      ? "ok"
                      : florist.status === "demo"
                        ? "demo"
                        : "plain"
                  }
                >
                  {adminT(`admin.partners.status.${florist.status}`)}
                </AdminChip>
              </AdminCell>
              <AdminCell align="end">
                {florist.status === "demo"
                  ? adminT("admin.countries.florists.neverCounts")
                  : n(florist.products)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );

  const products = (
    <AdminSection
      title={adminT("admin.countries.products.title", { country: name })}
    >
      <AdminCard>
        <AdminKeyValues
          items={[
            {
              key: "priced",
              label: adminT("admin.countries.products.priced"),
              value: n(country.pricedProducts),
              numeric: true,
            },
            {
              key: "saleable",
              label: adminT("admin.countries.products.saleable"),
              value: n(country.saleableProducts),
              numeric: true,
            },
          ]}
        />
      </AdminCard>
    </AdminSection>
  );

  const live = country.status === "live";
  const card = (
    <AdminCard
      title={
        live
          ? adminT("admin.countries.check.liveTitle")
          : adminT("admin.countries.check.title")
      }
    >
      <AdminQuiet>
        {live
          ? adminT("admin.countries.check.liveChecked", { country: name })
          : adminT("admin.countries.check.checked")}
      </AdminQuiet>
      <AdminChecklist
        checks={checks(country, name)}
        metLabel={adminT("admin.countries.check.met")}
        missingLabel={adminT("admin.countries.check.missing")}
      />
      {live && country.preflight.reasons.includes("noRealFlorist") ? (
        <AdminNote>
          {adminT("admin.countries.liveNoFlorist", { country: name })}
        </AdminNote>
      ) : null}
      {country.status === "demo" ? (
        <AdminNote>
          {adminT("admin.countries.demoNote", { country: name })}
        </AdminNote>
      ) : null}
      {country.status === "disabled" ? (
        <AdminNote>
          {adminT("admin.countries.disabledNote", { country: name })}
        </AdminNote>
      ) : null}
      {!mayFlip ? (
        <AdminQuiet>{adminT("admin.countries.noPermission")}</AdminQuiet>
      ) : country.status === "demo" && ready ? (
        <>
          <GoLiveDialog
            country={country}
            name={name}
            mismatch={query.result === "mismatch"}
          />
          <AdminQuiet>
            {adminT("admin.countries.alsoNeeded", { country: name })}
          </AdminQuiet>
        </>
      ) : live ? (
        <>
          <BackToDemoDialog country={country} name={name} />
          <AdminQuiet>{adminT("admin.countries.noDisabled")}</AdminQuiet>
        </>
      ) : country.status === "disabled" ? (
        <BackToDemoDialog country={country} name={name} />
      ) : null}
      {mayFlip ? <FiscalForm country={country} errors={fieldErrors} /> : null}
    </AdminCard>
  );

  return (
    <AdminFrame
      session={session}
      current="countries"
      backupWarning={await catalogueBackupWarning()}
    >
      <div className="grid gap-[20px]">
        <AdminBackLink href="/admin/countries">
          {adminT("admin.countries.back")}
        </AdminBackLink>
        <AdminRecordHead
          title={name}
          sub={
            <>
              <CountryStatusChip status={country.status} />
              <AdminCode>{country.iso2}</AdminCode>
              <span>
                {country.firstLiveAt === null
                  ? adminT("admin.countries.firstLiveNotYet")
                  : adminT("admin.countries.firstLiveAt", {
                      date: formatDate(
                        country.firstLiveAt,
                        "en",
                        "dayMonthYearTime",
                        session.timeZone,
                      ),
                      timeZone: zoneCity(session.timeZone),
                    })}
              </span>
            </>
          }
        />
        <Outcome query={query} name={name} iso2={country.iso2} />
        <AdminRecordColumns
          main={
            <>
              {facts}
              {florists}
              {products}
            </>
          }
          aside={card}
        />
      </div>
    </AdminFrame>
  );
}
