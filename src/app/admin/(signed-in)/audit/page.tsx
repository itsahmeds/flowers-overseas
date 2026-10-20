/**
 * @purpose GET /admin/audit: the audit log, filtered
 * @spec 012
 *
 * Admin only (`audit.read`). Reads `audit_log` through `listAuditEntries` with the filters of the
 * query string (entity, actor, action, date in the viewer's zone); `open` expands one row to its
 * before/after diff, where a masked personal value renders as "changed" on both sides and never as
 * a value (AC-11). A GET form and links only, so the page ships no client JavaScript. Artboards
 * `admin-audit-desktop.dc.html` (table) and `admin-audit-mobile.dc.html` (cards, filters in a
 * disclosure).
 */
import type { ReactElement, ReactNode } from "react";

import {
  AUDIT_ENTITIES,
  AUDIT_PAGE_SIZE,
  type AuditEntry,
  AuditFilterSchema,
  type AuditFilter,
  adminRequestId,
  adminT,
  auditDiff,
  auditFilterOptions,
  listAuditEntries,
  parseAuditFilter,
  requireAdminPage,
  shortEntityId,
  zoneCity,
} from "@/modules/admin";
import { formatDate } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminChip,
  AdminCode,
  AdminDiff,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterDateRange,
  AdminFilterDisclosure,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";

import { AdminFrame } from "../frame";

/** `/admin/audit` with `filter`'s values, and `open` set to `openId` (or cleared). */
function auditHref(filter: AuditFilter, openId: string | undefined): string {
  const params = new URLSearchParams();
  for (const key of ["entity", "actor", "action", "from", "to"] as const) {
    const value = filter[key];
    if (value !== undefined) params.set(key, value);
  }
  if (openId !== undefined) params.set("open", openId);
  const query = params.toString();
  return query === "" ? "/admin/audit" : `/admin/audit?${query}`;
}

function Filters({
  filter,
  actors,
  actions,
  idPrefix,
  stacked,
}: {
  readonly filter: AuditFilter;
  readonly actors: readonly { userId: string; name: string }[];
  readonly actions: readonly string[];
  readonly idPrefix: string;
  readonly stacked: boolean;
}): ReactElement {
  return (
    <AdminFilterBar stacked={stacked}>
      <AdminFilterSelect
        id={`${idPrefix}-entity`}
        name="entity"
        label={adminT("admin.audit.entity")}
        anyLabel={adminT("admin.audit.entityAny")}
        options={AUDIT_ENTITIES.map((entity) => ({
          value: entity,
          label: entity,
        }))}
        value={filter.entity}
        stacked={stacked}
      />
      <AdminFilterSelect
        id={`${idPrefix}-actor`}
        name="actor"
        label={adminT("admin.audit.actor")}
        anyLabel={adminT("admin.audit.actorAny")}
        options={actors.map((actor) => ({
          value: actor.userId,
          label: actor.name,
        }))}
        value={filter.actor}
        stacked={stacked}
      />
      <AdminFilterSelect
        id={`${idPrefix}-action`}
        name="action"
        label={adminT("admin.audit.action")}
        anyLabel={adminT("admin.audit.actionAny")}
        options={actions.map((action) => ({ value: action, label: action }))}
        value={filter.action}
        stacked={stacked}
      />
      <AdminFilterDateRange
        idPrefix={`${idPrefix}-date`}
        label={adminT("admin.audit.date")}
        fromLabel={adminT("admin.audit.from")}
        toLabel={adminT("admin.audit.to")}
        from={filter.from}
        to={filter.to}
        stacked={stacked}
      />
      <AdminFilterSubmit>{adminT("admin.audit.apply")}</AdminFilterSubmit>
    </AdminFilterBar>
  );
}

function Diff({ entry }: { readonly entry: AuditEntry }): ReactElement {
  return (
    <AdminDiff
      rows={auditDiff(entry.before, entry.after)}
      columnLabel={adminT("admin.audit.diffColumn")}
      beforeLabel={adminT("admin.audit.diffBefore")}
      afterLabel={adminT("admin.audit.diffAfter")}
      maskedLabel={adminT("admin.audit.masked")}
    />
  );
}

function Channel({ entry }: { readonly entry: AuditEntry }): ReactElement {
  return (
    <AdminChip tone={entry.channel === "cli" ? "ink" : "plain"}>
      {adminT(`admin.audit.channel.${entry.channel}`)}
    </AdminChip>
  );
}

function Entity({ entry }: { readonly entry: AuditEntry }): ReactNode {
  return (
    <>
      <AdminCode>{entry.entityTable}</AdminCode>
      <AdminSecondLine title={entry.entityId}>
        {shortEntityId(entry.entityId)}
      </AdminSecondLine>
    </>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("audit.read");
  const filter = parseAuditFilter(AuditFilterSchema.parse(await searchParams));
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const [entries, options] = await Promise.all([
    listAuditEntries(actor, filter, session.timeZone),
    auditFilterOptions(actor),
  ]);
  const zone = zoneCity(session.timeZone);
  const when = (entry: AuditEntry): string =>
    formatDate(entry.at, "en", "dayMonthTime", session.timeZone);
  const hasValues = (entry: AuditEntry): boolean =>
    entry.before !== null || entry.after !== null;
  const activeFilters = [
    filter.entity,
    filter.actor,
    filter.action,
    filter.from ?? filter.to,
  ].filter((value) => value !== undefined).length;
  const columns = [
    { key: "time", label: adminT("admin.audit.columnTime", { zone }) },
    { key: "who", label: adminT("admin.audit.columnWho") },
    { key: "channel", label: adminT("admin.audit.columnChannel") },
    { key: "action", label: adminT("admin.audit.columnAction") },
    { key: "entity", label: adminT("admin.audit.columnEntity") },
    { key: "reason", label: adminT("admin.audit.columnReason") },
    {
      key: "changes",
      label: adminT("admin.audit.columnChanges"),
      hidden: true,
    },
  ];
  return (
    <AdminFrame session={session} current="audit">
      <div className="grid gap-[20px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.audit.title")}</AdminPageTitle>
          <p className="text-ink-3 text-[14px]">{adminT("admin.audit.lead")}</p>
        </header>
        <div className="hidden md:block">
          <Filters
            filter={filter}
            actors={options.actors}
            actions={options.actions}
            idPrefix="audit-filter"
            stacked={false}
          />
        </div>
        <div className="md:hidden">
          <AdminFilterDisclosure
            summary={
              activeFilters === 0
                ? adminT("admin.audit.filters")
                : adminT("admin.audit.filtersCount", { count: activeFilters })
            }
          >
            <Filters
              filter={filter}
              actors={options.actors}
              actions={options.actions}
              idPrefix="audit-filter-m"
              stacked
            />
          </AdminFilterDisclosure>
        </div>
        {entries.length === 0 ? (
          <AdminEmpty title={adminT("admin.audit.empty")} />
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable columns={columns}>
                {entries.map((entry) => {
                  const open = entry.id === filter.open && hasValues(entry);
                  return [
                    <AdminRow key={entry.id} highlight={open}>
                      <AdminCell nowrap>{when(entry)}</AdminCell>
                      <AdminCell>{entry.actorLabel}</AdminCell>
                      <AdminCell>
                        <Channel entry={entry} />
                      </AdminCell>
                      <AdminCell>
                        <AdminCode>{entry.action}</AdminCode>
                      </AdminCell>
                      <AdminCell>
                        <Entity entry={entry} />
                      </AdminCell>
                      <AdminCell>
                        {entry.reason ?? (
                          <AdminNote>{adminT("admin.audit.none")}</AdminNote>
                        )}
                      </AdminCell>
                      <AdminCell nowrap>
                        {hasValues(entry) ? (
                          <AdminTableLink
                            href={auditHref(
                              filter,
                              open ? undefined : entry.id,
                            )}
                          >
                            {open
                              ? adminT("admin.audit.hideChanges")
                              : adminT("admin.audit.showChanges")}
                          </AdminTableLink>
                        ) : (
                          <AdminNote>
                            {adminT("admin.audit.noValues")}
                          </AdminNote>
                        )}
                      </AdminCell>
                    </AdminRow>,
                    open ? (
                      <AdminRow key={`${entry.id}-diff`}>
                        <AdminCell colSpan={columns.length} plain>
                          <Diff entry={entry} />
                        </AdminCell>
                      </AdminRow>
                    ) : null,
                  ];
                })}
              </AdminTable>
            </div>
            <div className="md:hidden">
              <AdminCardRows>
                {entries.map((entry) => {
                  const open = entry.id === filter.open && hasValues(entry);
                  const time = when(entry);
                  return (
                    <AdminCardRow
                      key={entry.id}
                      highlight={open}
                      {...(open || !hasValues(entry)
                        ? {}
                        : { href: auditHref(filter, entry.id) })}
                      line1={
                        <>
                          <AdminCode>{entry.action}</AdminCode>
                          <Channel entry={entry} />
                        </>
                      }
                      line2={
                        <>
                          {entry.actorLabel} ·{" "}
                          <AdminCode>{entry.entityTable}</AdminCode>{" "}
                          <span title={entry.entityId}>
                            {shortEntityId(entry.entityId)}
                          </span>
                        </>
                      }
                      line3={
                        entry.reason === null
                          ? adminT("admin.audit.when", { time, zone })
                          : adminT("admin.audit.whenWithReason", {
                              time,
                              zone,
                              reason: entry.reason,
                            })
                      }
                    >
                      {open ? <Diff entry={entry} /> : null}
                    </AdminCardRow>
                  );
                })}
              </AdminCardRows>
            </div>
            {entries.length === AUDIT_PAGE_SIZE ? (
              <p className="text-ink-3 text-[13px]">
                {adminT("admin.audit.newest", { count: AUDIT_PAGE_SIZE })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </AdminFrame>
  );
}
