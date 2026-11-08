/**
 * @purpose GET /admin/partners: the florists, by status and country
 * @spec 012
 *
 * `partner.edit` or `partner.payout` (admin, ops, finance; finance opens it to reach payouts).
 * Every florist with its city, status, terms, zone count and fulfillable product count; status
 * tabs with their counts; a country filter. "Add a florist" is absent for a role without
 * `partner.edit` (spec 004 §14 A20). Names and contacts render here and on no public page
 * (AC-16). Artboards `admin-partners-desktop.dc.html` (table) and `admin-partners-mobile.dc.html`
 * (cards).
 *
 * Spec 030b §2.7, §5.3 (TASK-441; the 030b blocks of the same artboards): the columns Last
 * accepted (newest accepted assignment of a live order) and Rating ("4.50 out of 5" or "Fewer than
 * 3 ratings"); Follow-ups (open entries due today or earlier in the viewer's zone) and the
 * "Follow-ups due" list for `partner.crm.view` (admin, ops); Owed now (draft plus sent payouts per
 * currency) for `finance.view` only, so ops see no money (AC-2). A demo florist takes no money.
 *
 * Spec 030b §14.2 A (TASK-442; AC-36, AC-39, AC-42): the Agreement column (the current agreement's
 * template version, or "None on file", plus any other contract flag) and the "Contracts due" list
 * (review dates inside their notice window or passed) for `partner.contract.view` (admin) only.
 */
import Link from "next/link";
import { forbidden } from "next/navigation";
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  can,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  type CurrencyAmount,
  partnersOwedNow,
  readFinance,
} from "@/modules/admin/finance";
import {
  formatDate,
  formatNumber,
  formatRatingBp,
  instantToWallClock,
} from "@/modules/i18n";
import {
  type PartnerListItem,
  type PartnerStatus,
  PartnerListFilterSchema,
  listPartners,
} from "@/modules/partners";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminChip,
  AdminCode,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
  AdminTabs,
} from "@/modules/ui/admin/AdminData";

import {
  type FollowUpDue,
  type PartnerCrmColumns,
  followUpsDue,
  partnerListCrm,
} from "@/modules/partners/crm";
import {
  type ContractDue,
  contractsDue,
  type PartnerAgreementColumn,
  partnersContractFlags,
} from "@/modules/partners/contracts";

import { native } from "../finance/view";
import { AdminFrame } from "../frame";
import { PartnerMessage, PartnerResultSchema, PartnerStatusChip } from "./view";

const STATUSES: readonly PartnerStatus[] = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
];

function listHref(country: string | undefined, status?: PartnerStatus): string {
  const params = new URLSearchParams({
    ...(country === undefined ? {} : { country }),
    ...(status === undefined ? {} : { status }),
  });
  const query = params.toString();
  return query === "" ? "/admin/partners" : `/admin/partners?${query}`;
}

function terms(item: PartnerListItem): string {
  return item.termsSignedAt === null || item.termsVersion === null
    ? adminT("admin.partners.termsNone")
    : adminT("admin.partners.termsLine", {
        version: item.termsVersion,
        date: formatDate(
          new Date(`${item.termsSignedAt}T12:00:00Z`),
          "en",
          "dayMonth",
          "UTC",
        ),
      });
}

function lastAccepted(
  crm: PartnerCrmColumns | undefined,
  zone: string,
): string {
  return crm?.lastAcceptedAt == null
    ? adminT("admin.partners.crm.standing.noOrders")
    : formatDate(crm.lastAcceptedAt, "en", "dayMonth", zone);
}

function rating(crm: PartnerCrmColumns | undefined): string {
  return crm?.rating90dBp == null
    ? adminT("admin.partners.crm.standing.fewRatings")
    : adminT("admin.partners.crm.standing.ratingShort", {
        rating: formatRatingBp(crm.rating90dBp, "en"),
      });
}

function owed(
  item: PartnerListItem,
  amounts: readonly CurrencyAmount[] | undefined,
): string {
  if (item.status === "demo") return adminT("admin.partners.list.noMoney");
  const nonZero = (amounts ?? []).filter((a) => a.minor !== 0n);
  return nonZero.length === 0
    ? native(0n, item.payoutCurrency)
    : nonZero.map((a) => native(a.minor, a.currency)).join(" · ");
}

function dueDay(iso: string): string {
  return formatDate(new Date(`${iso}T12:00:00Z`), "en", "dayMonth", "UTC");
}

function agreementText(column: PartnerAgreementColumn | undefined): string {
  if (column === undefined) return adminT("admin.partners.list.agreementNone");
  const head =
    column.templateVersion === null
      ? adminT("admin.partners.list.agreementNone")
      : adminT("admin.partners.list.agreementOk", {
          template: column.templateVersion,
        });
  const rest = column.flags
    .filter((flag) => flag !== "no_agreement")
    .map((flag) => adminT(`admin.partners.contracts.flag.${flag}`));
  return [head, ...rest].join(" · ");
}

function ContractsDueList({
  due,
}: {
  readonly due: readonly ContractDue[];
}): ReactElement | null {
  if (due.length === 0) return null;
  return (
    <section
      aria-labelledby="contracts-due"
      className="bg-card grid gap-[8px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px]"
    >
      <h2 id="contracts-due" className="text-[18px] leading-[1.2]">
        {adminT("admin.partners.list.contractsDue")}{" "}
        <span className="text-ink-3 text-[14px] font-normal tabular-nums">
          {formatNumber(due.length, "en")}
        </span>
      </h2>
      <ul className="m-0 grid list-none gap-[8px] p-0">
        {due.map((entry) => (
          <li
            key={entry.contractId}
            className="flex flex-wrap items-center gap-[8px] text-[14px]"
          >
            <Link
              href={`/admin/partners/${encodeURIComponent(entry.partnerCode)}/contracts`}
              className="text-link underline underline-offset-[3px]"
            >
              {adminT("admin.partners.list.contractsDueLine", {
                florist: entry.partnerName,
                kind: adminT(`admin.partners.contracts.kind.${entry.docKind}`),
                version: entry.versionNo,
                date: dueDay(entry.reviewOn),
              })}
            </Link>
            <AdminChip tone={entry.state === "due" ? "warn" : "bad"}>
              {adminT(`admin.partners.list.contractsDueState.${entry.state}`)}
            </AdminChip>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FollowUpsDueList({
  due,
  today,
  zone,
}: {
  readonly due: readonly FollowUpDue[];
  readonly today: string;
  readonly zone: string;
}): ReactElement {
  return (
    <section
      aria-labelledby="follow-ups-due"
      className="bg-card grid gap-[8px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px]"
    >
      <h2 id="follow-ups-due" className="text-[18px] leading-[1.2]">
        {adminT("admin.partners.list.followUpsDue")}{" "}
        <span className="text-ink-3 text-[14px] font-normal tabular-nums">
          {formatNumber(due.length, "en")}
        </span>
      </h2>
      {due.length === 0 ? (
        <p className="m-0 text-[14px]">
          {adminT("admin.partners.list.noneDue")}
        </p>
      ) : (
        <>
          <p className="text-ink-3 m-0 text-[13px]">
            {adminT("admin.partners.list.dueWhen", { zone: zoneCity(zone) })}
          </p>
          <ul className="m-0 grid list-none gap-[8px] p-0">
            {due.map((entry) => (
              <li key={entry.entryId} className="grid gap-[2px] text-[14px]">
                <span className="flex flex-wrap items-center gap-[8px]">
                  <a
                    href={`/admin/partners/${encodeURIComponent(entry.partnerCode)}/relationship`}
                    className="text-link font-bold underline underline-offset-[3px]"
                  >
                    {entry.partnerName}
                  </a>
                  <AdminChip tone={entry.followUpOn === today ? "warn" : "bad"}>
                    {entry.followUpOn === today
                      ? adminT("admin.partners.crm.followUp.today")
                      : adminT("admin.partners.crm.followUp.overdue", {
                          date: dueDay(entry.followUpOn),
                        })}
                  </AdminChip>
                </span>
                <span className="text-ink-2 [overflow-wrap:anywhere]">
                  <AdminCode>{entry.partnerCode}</AdminCode>
                  {" · "}
                  {adminT(`admin.partners.crm.topic.${entry.topic}`)}{" "}
                  {entry.summary}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  if (
    !can(session.roles, "partner.edit") &&
    !can(session.roles, "partner.payout")
  ) {
    forbidden();
  }
  const query = await searchParams;
  const filter = PartnerListFilterSchema.parse(query);
  const result = PartnerResultSchema.parse(query);
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const list = await listPartners(actor, filter);
  const now = new Date();
  const zone = session.timeZone;
  const today = instantToWallClock(now, zone).slice(0, 10);
  const canCrm = can(session.roles, "partner.crm.view");
  const canMoney = can(session.roles, "finance.view");
  const crm = await partnerListCrm(actor, zone, now);
  const due = canCrm ? await followUpsDue(actor, zone, now) : [];
  const canContracts = can(session.roles, "partner.contract.view");
  const agreements = canContracts
    ? await partnersContractFlags(actor, now)
    : undefined;
  const contractsDueRows = canContracts ? await contractsDue(actor, now) : [];
  const owedNow = canMoney
    ? await readFinance(actor, (executor) => partnersOwedNow(executor))
    : undefined;
  const all = STATUSES.reduce((sum, status) => sum + list.counts[status], 0);
  const tabs = [
    {
      key: "all",
      label: adminT("admin.partners.tabs.all"),
      count: formatNumber(all, "en"),
      href: listHref(filter.country),
      current: filter.status === undefined,
    },
    ...STATUSES.map((status) => ({
      key: status,
      label: adminT(`admin.partners.status.${status}`),
      count: formatNumber(list.counts[status], "en"),
      href: listHref(filter.country, status),
      current: filter.status === status,
    })),
  ];
  const columns = [
    { key: "florist", label: adminT("admin.partners.column.florist") },
    { key: "city", label: adminT("admin.partners.column.city") },
    { key: "status", label: adminT("admin.partners.column.status") },
    {
      key: "zones",
      label: adminT("admin.partners.column.zones"),
      align: "end" as const,
    },
    {
      key: "products",
      label: adminT("admin.partners.column.products"),
      align: "end" as const,
    },
    {
      key: "lastAccepted",
      label: adminT("admin.partners.column.lastAccepted"),
    },
    { key: "rating", label: adminT("admin.partners.column.rating") },
    ...(canCrm
      ? [
          {
            key: "followUps",
            label: adminT("admin.partners.column.followUps"),
            align: "end" as const,
          },
        ]
      : []),
    ...(canContracts
      ? [{ key: "agreement", label: adminT("admin.partners.list.agreement") }]
      : []),
    ...(canMoney
      ? [
          {
            key: "owed",
            label: adminT("admin.partners.column.owedNow"),
            align: "end" as const,
          },
        ]
      : []),
  ];
  const href = (item: PartnerListItem): string =>
    `/admin/partners/${encodeURIComponent(item.code)}`;
  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header className="flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px]">
          <div>
            <AdminPageTitle>{adminT("admin.partners.title")}</AdminPageTitle>
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.partners.lead")}
            </p>
          </div>
          {can(session.roles, "partner.edit") ? (
            <Link
              href="/admin/partners/new"
              className={adminButtonClass("primary")}
            >
              {adminT("admin.partners.add")}
            </Link>
          ) : null}
        </header>
        <PartnerMessage result={result} form="page" />
        {canCrm ? (
          <FollowUpsDueList due={due} today={today} zone={zone} />
        ) : null}
        {canContracts ? <ContractsDueList due={contractsDueRows} /> : null}
        <AdminFilterBar
          label={adminT("admin.partners.filter.label")}
          action="/admin/partners"
        >
          {filter.status === undefined ? null : (
            <input type="hidden" name="status" value={filter.status} />
          )}
          <AdminFilterSelect
            id="partners-country"
            name="country"
            label={adminT("admin.partners.filter.country")}
            anyLabel={adminT("admin.partners.filter.countryAny")}
            options={list.countries.map((country) => ({
              value: country.iso2,
              label: country.name,
            }))}
            value={filter.country}
          />
          <AdminFilterSubmit>
            {adminT("admin.partners.filter.apply")}
          </AdminFilterSubmit>
        </AdminFilterBar>
        <AdminTabs label={adminT("admin.partners.tabs.label")} tabs={tabs} />
        {list.items.length === 0 ? (
          <AdminEmpty
            title={adminT("admin.partners.empty.title", {
              status: filter.status ?? "other",
            })}
          >
            <p className="max-w-[60ch]">
              {adminT("admin.partners.empty.body")}
            </p>
          </AdminEmpty>
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable columns={columns}>
                {list.items.map((item) => (
                  <AdminRow key={item.id} muted={item.status === "offboarded"}>
                    <AdminCell>
                      <AdminTableLink href={href(item)}>
                        {item.legalName}
                      </AdminTableLink>
                      <AdminSecondLine>
                        <AdminCode>{item.code}</AdminCode>
                      </AdminSecondLine>
                    </AdminCell>
                    <AdminCell>
                      {item.cityLabel}
                      <AdminSecondLine>{item.countryName}</AdminSecondLine>
                    </AdminCell>
                    <AdminCell>
                      <PartnerStatusChip status={item.status} />
                      <AdminSecondLine>{terms(item)}</AdminSecondLine>
                    </AdminCell>
                    <AdminCell align="end">
                      {formatNumber(item.zones, "en")}
                    </AdminCell>
                    <AdminCell align="end">
                      {formatNumber(item.products, "en")}
                    </AdminCell>
                    <AdminCell>
                      {lastAccepted(crm.get(item.id), zone)}
                    </AdminCell>
                    <AdminCell>{rating(crm.get(item.id))}</AdminCell>
                    {canCrm ? (
                      <AdminCell align="end">
                        {formatNumber(crm.get(item.id)?.followUps ?? 0, "en")}
                      </AdminCell>
                    ) : null}
                    {agreements === undefined ? null : (
                      <AdminCell>
                        {agreementText(agreements.get(item.id))}
                      </AdminCell>
                    )}
                    {owedNow === undefined ? null : (
                      <AdminCell align="end">
                        {owed(item, owedNow.get(item.id))}
                      </AdminCell>
                    )}
                  </AdminRow>
                ))}
              </AdminTable>
            </div>
            <div className="md:hidden">
              <AdminCardRows>
                {list.items.map((item) => (
                  <AdminCardRow
                    key={item.id}
                    href={href(item)}
                    line1={<span className="font-bold">{item.legalName}</span>}
                    subline={<AdminCode>{item.code}</AdminCode>}
                    line2={
                      <span className="inline-flex flex-wrap items-center gap-[6px]">
                        <PartnerStatusChip status={item.status} />
                        <span>
                          {adminT("admin.partners.where", {
                            city: item.cityLabel,
                            country: item.countryName,
                          })}
                        </span>
                      </span>
                    }
                    line3={
                      <>
                        {adminT("admin.partners.counts", {
                          zones: item.zones,
                          products: item.products,
                        })}
                        <span className="block">
                          {[
                            crm.get(item.id)?.lastAcceptedAt == null
                              ? adminT("admin.partners.crm.standing.noOrders")
                              : adminT("admin.partners.list.lastAccepted", {
                                  date: lastAccepted(crm.get(item.id), zone),
                                }),
                            ...(item.status === "demo"
                              ? []
                              : [rating(crm.get(item.id))]),
                            ...(canCrm && (crm.get(item.id)?.followUps ?? 0) > 0
                              ? [
                                  adminT("admin.partners.list.followUpCount", {
                                    count: crm.get(item.id)?.followUps ?? 0,
                                  }),
                                ]
                              : []),
                            ...(agreements === undefined
                              ? []
                              : [agreementText(agreements.get(item.id))]),
                            ...(owedNow === undefined || item.status === "demo"
                              ? []
                              : [
                                  adminT("admin.partners.list.owed", {
                                    amount: owed(item, owedNow.get(item.id)),
                                  }),
                                ]),
                          ].join(" · ")}
                        </span>
                      </>
                    }
                  />
                ))}
              </AdminCardRows>
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
