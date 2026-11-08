/**
 * @purpose The florist page's tab bar and the head every florist tab shares
 * @spec 030b
 *
 * Spec 030b §2.6, §5.3 and §5.3.1 items 5 and 12 (artboards `admin-partner-detail-*`, the 030b
 * block): Profile, Payout terms, Money, Relationship, each a link (spec 012's tab style, the ink
 * underline on the current one). Payout terms is a link to its block on the Profile route
 * (`#terms`, orchestrator ruling 2026-10-23); it has no route of its own. A tab the role cannot
 * open is **absent**, not disabled (AC-1, AC-2): Money needs `finance.view`, Relationship
 * `partner.crm.view`. `PARTNER_TABS` is the one list, so a later tab (Contracts, Products and
 * prices) is one entry. The URL carries the code, never a name.
 */
import type { ReactElement, ReactNode } from "react";

import { type AdminPermission, adminT, can } from "@/modules/admin";
import type { PartnerHead } from "@/modules/partners";
import { AdminTabs } from "@/modules/ui/admin/AdminData";
import { AdminBackLink, AdminRecordHead } from "@/modules/ui/admin/AdminRecord";

import { PartnerStatusChip } from "../view";

export type PartnerTabKey =
  "profile" | "payoutTerms" | "money" | "relationship" | "contracts";

interface PartnerTabDefinition {
  readonly key: PartnerTabKey;
  /** The path after `/admin/partners/{code}` (`#terms` for the block on the Profile route). */
  readonly path: string;
  /** Any one of these opens the tab; empty means whoever opens the florist page. */
  readonly anyOf: readonly AdminPermission[];
}

/** The florist tabs in bar order. */
export const PARTNER_TABS: readonly PartnerTabDefinition[] = [
  { key: "profile", path: "", anyOf: [] },
  { key: "payoutTerms", path: "#terms", anyOf: [] },
  { key: "money", path: "/money", anyOf: ["finance.view"] },
  { key: "relationship", path: "/relationship", anyOf: ["partner.crm.view"] },
  { key: "contracts", path: "/contracts", anyOf: ["partner.contract.view"] },
];

/** The tabs `roles` may open, each with its href; `current` carries `aria-current`. */
export function partnerTabsFor(
  roles: readonly string[],
  code: string,
  current: PartnerTabKey,
): readonly {
  readonly key: PartnerTabKey;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}[] {
  const base = `/admin/partners/${encodeURIComponent(code)}`;
  return PARTNER_TABS.filter(
    (tab) =>
      tab.anyOf.length === 0 ||
      tab.anyOf.some((permission) => can(roles, permission)),
  ).map((tab) => ({
    key: tab.key,
    label: adminT(`admin.partners.tab.${tab.key}`),
    href: `${base}${tab.path}`,
    current: tab.key === current,
  }));
}

export function PartnerTabBar({
  roles,
  code,
  current,
}: {
  readonly roles: readonly string[];
  readonly code: string;
  readonly current: PartnerTabKey;
}): ReactElement {
  return (
    <AdminTabs
      label={adminT("admin.partners.tab.label")}
      tabs={partnerTabsFor(roles, code, current)}
    />
  );
}

/** The head of a florist tab other than Profile: back link, name, code, place, status, tabs. */
export function PartnerTabHead({
  head,
  roles,
  current,
  children,
}: {
  readonly head: PartnerHead;
  readonly roles: readonly string[];
  readonly current: PartnerTabKey;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <>
      <AdminBackLink href="/admin/partners">
        {adminT("admin.partners.back")}
      </AdminBackLink>
      <AdminRecordHead
        title={head.legalName}
        sub={
          <>
            <code>{head.code}</code>
            <span>
              {adminT("admin.partners.where", {
                city: head.cityLabel,
                country: head.countryName,
              })}
            </span>
            <PartnerStatusChip status={head.status} />
          </>
        }
      />
      <PartnerTabBar roles={roles} code={head.code} current={current} />
      {children}
    </>
  );
}
