/**
 * @purpose GET /admin/publish: what a publish would add and remove, the live version, the run, the history
 * @spec 012b
 *
 * Spec 012b §2.3, §5.3 "`/admin/publish`" (AC-6, AC-7, AC-8; TASK-295), after
 * `docs/design/wireframes/admin-publish-desktop.dc.html` and `-mobile`. Admin layout, English,
 * SSR `no-store`. Publish is a form post to `publishAction`; it is absent, with the reason as
 * text, without the permission, without a target, while a run is open, at the daily limit, and
 * when nothing waits (spec 004 §14 A20).
 */
import type { ReactElement } from "react";
import { z } from "zod";

import { isLocaleCode, localeConfig } from "@/config/locales";

import { type PublishRun, publishErrorCodes } from "@/lib/publish";
import {
  adminRequestId,
  adminT,
  can,
  publishPageView,
  requireAdminPage,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import { Button } from "@/modules/ui";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminCode,
  AdminEmpty,
  AdminNote,
  AdminRow,
  AdminTable,
} from "@/modules/ui/admin/AdminData";
import { AdminFrame } from "../frame";
import { publishAction } from "./actions";

export const dynamic = "force-dynamic";

const ResultSchema = z
  .object({
    result: z.enum(["asked", "refused"]).optional(),
    code: z.enum(publishErrorCodes).optional(),
    url: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => (value === undefined ? [] : [value].flat())),
  })
  .catch({ url: [] });

/** A hash or a commit, shortened the way the artboard draws it. */
function short(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

function languageOf(code: string): string {
  return isLocaleCode(code) ? localeConfig(code).nativeName : code;
}

function RunSteps({
  run,
  timeZone,
}: {
  readonly run: PublishRun;
  readonly timeZone: string;
}): ReactElement {
  const steps = ["requested", "building", "deployed", "verified"] as const;
  const reached = steps.indexOf(
    run.status === "failed" || run.status === "timed_out"
      ? "requested"
      : run.status,
  );
  return (
    <ol className="grid gap-[8px] sm:grid-cols-4" aria-live="polite">
      {steps.map((step, index) => (
        <li
          key={step}
          className={`border-t-[3px] pt-[8px] text-[14px] ${
            index <= reached ? "border-stem text-ink" : "border-rule text-ink-3"
          }`}
        >
          <span className="font-bold">
            {adminT(`admin.publish.status.${step}`)}
          </span>
          {index === 0 ? (
            <span className="text-ink-3 block">
              {formatDate(run.requestedAt, "en", "time", timeZone)}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default async function PublishPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const query = ResultSchema.parse(await searchParams);
  const view = await publishPageView({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  const n = (value: number): string => formatNumber(value, "en");
  const mayPublish = can(session.roles, "catalogue.publish");
  const changes = view.diff.addedCount + view.diff.removedCount;
  const run = view.openRun ?? view.lastRun;

  return (
    <AdminFrame session={session} current="publish">
      <div className="grid gap-[24px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.publish.title")}</AdminPageTitle>
          <p className="text-ink-2 max-w-[72ch] text-[15px]">
            {adminT("admin.publish.intro")}
          </p>
        </header>

        {query.result === "asked" ? (
          <AdminToast>{adminT("admin.publish.asked")}</AdminToast>
        ) : null}
        {query.result === "refused" && query.code !== undefined ? (
          <div className="grid gap-[6px]">
            <AdminRefusal>
              {query.code === "PUBLISH_REMOVES_INDEXABLE"
                ? adminT("admin.publish.refused")
                : adminT("admin.publish.couldNotStart", { code: query.code })}
            </AdminRefusal>
            {query.url.length > 0 ? (
              <ul className="grid gap-[2px]">
                {query.url.map((url) => (
                  <li key={url}>
                    <AdminCode>{url}</AdminCode>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <section className="grid gap-[12px]" aria-labelledby="publish-live">
          <h2 id="publish-live" className="text-ink text-[20px] leading-[1.2]">
            {adminT("admin.publish.liveTitle")}
          </h2>
          <dl className="text-ui grid grid-cols-[max-content_minmax(0,1fr)] gap-x-[24px] gap-y-[6px]">
            <dt className="text-ink-3">{adminT("admin.publish.version")}</dt>
            <dd>
              <AdminCode>
                {[view.ref ?? view.environment, short(view.commit)]
                  .filter(Boolean)
                  .join(" · ")}
              </AdminCode>
            </dd>
            <dt className="text-ink-3">{adminT("admin.publish.pageList")}</dt>
            <dd>
              <AdminCode>
                {short(view.existenceHash) ?? adminT("admin.publish.none")}
              </AdminCode>{" "}
              <AdminNote>{adminT("admin.publish.pageListNote")}</AdminNote>
            </dd>
            <dt className="text-ink-3">{adminT("admin.publish.built")}</dt>
            <dd>
              {view.dataAsOf === null
                ? adminT("admin.publish.none")
                : formatDate(
                    new Date(view.dataAsOf),
                    "en",
                    "dayMonthTime",
                    session.timeZone,
                  )}
            </dd>
          </dl>
        </section>

        {view.openRun !== null ? (
          <section className="grid gap-[12px]" aria-labelledby="publish-run">
            <h2 id="publish-run" className="text-ink text-[20px] leading-[1.2]">
              {adminT("admin.publish.runTitle", {
                status: adminT(`admin.publish.status.${view.openRun.status}`),
              })}
            </h2>
            <RunSteps run={view.openRun} timeZone={session.timeZone} />
            <p className="text-ink-2 text-[14px]">
              {view.openRun.status === "deployed"
                ? adminT("admin.publish.checking")
                : adminT("admin.publish.runOpen")}
            </p>
          </section>
        ) : run !== null &&
          (run.status === "failed" || run.status === "timed_out") ? (
          <section className="grid gap-[8px]" aria-labelledby="publish-failed">
            <h2
              id="publish-failed"
              className="text-danger text-[20px] leading-[1.2]"
            >
              {adminT("admin.publish.failedTitle")}
            </h2>
            <p className="text-ink-2 text-[14px]">
              {run.status === "timed_out"
                ? adminT("admin.publish.timedOutBody")
                : adminT("admin.publish.failedBody")}
            </p>
            {run.errorCode === null ? null : (
              <AdminCode>{run.errorCode}</AdminCode>
            )}
          </section>
        ) : run !== null && run.status === "verified" ? (
          <AdminToast>{adminT("admin.publish.verifiedBody")}</AdminToast>
        ) : null}

        <section className="grid gap-[12px]" aria-labelledby="publish-waiting">
          <h2
            id="publish-waiting"
            className="text-ink text-[20px] leading-[1.2]"
          >
            {adminT("admin.publish.waitingTitle")}
          </h2>
          {changes === 0 ? (
            <AdminEmpty title={adminT("admin.publish.nothingTitle")}>
              <p>{adminT("admin.publish.nothingBody")}</p>
            </AdminEmpty>
          ) : (
            <>
              <p className="text-ink-2 text-[14px]">
                {adminT("admin.publish.waitingIntro")}
              </p>
              <AdminTable
                columns={[
                  {
                    key: "language",
                    label: adminT("admin.publish.colLanguage"),
                  },
                  {
                    key: "added",
                    label: adminT("admin.publish.colAdded"),
                    align: "end",
                  },
                  {
                    key: "removed",
                    label: adminT("admin.publish.colRemoved"),
                    align: "end",
                  },
                ]}
                foot={
                  <span className="font-bold">
                    {adminT("admin.publish.total")}: +{n(view.diff.addedCount)}{" "}
                    · −{n(view.diff.removedCount)}
                  </span>
                }
              >
                {view.diff.byLocale.map((row) => (
                  <AdminRow key={row.locale}>
                    <AdminCell>
                      {languageOf(row.locale)}{" "}
                      <AdminCode>{row.locale}</AdminCode>
                    </AdminCell>
                    <AdminCell align="end">{n(row.added.length)}</AdminCell>
                    <AdminCell align="end">{n(row.removed.length)}</AdminCell>
                  </AdminRow>
                ))}
              </AdminTable>
              {view.diff.byLocale.map((row) => (
                <div key={row.locale} className="grid gap-[4px]">
                  {row.added.length > 0 ? (
                    <details>
                      <summary className="text-ink cursor-pointer text-[14px] font-bold">
                        {adminT("admin.publish.listAdded", {
                          language: languageOf(row.locale),
                          count: row.added.length,
                        })}
                      </summary>
                      <ul className="grid gap-[2px] ps-[16px]">
                        {row.added.map((url) => (
                          <li key={url} className="text-stem">
                            + <AdminCode>{url}</AdminCode>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {row.removed.length > 0 ? (
                    <details>
                      <summary className="text-ink cursor-pointer text-[14px] font-bold">
                        {adminT("admin.publish.listRemoved", {
                          language: languageOf(row.locale),
                          count: row.removed.length,
                        })}
                      </summary>
                      <ul className="grid gap-[2px] ps-[16px]">
                        {row.removed.map((url) => (
                          <li key={url} className="text-danger">
                            − <AdminCode>{url}</AdminCode>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ))}
            </>
          )}

          {!mayPublish ? (
            <AdminNote>{adminT("admin.publish.noPermission")}</AdminNote>
          ) : view.absence === "noTarget" ? (
            <AdminNote>{adminT("admin.publish.noTarget")}</AdminNote>
          ) : view.absence === "noManifest" ? (
            <AdminNote>{adminT("admin.publish.noManifest")}</AdminNote>
          ) : view.absence === "dailyLimit" ? (
            <div className="grid gap-[4px]">
              <p className="text-ink font-bold">
                {adminT("admin.publish.limitTitle", { limit: view.dailyLimit })}
              </p>
              <AdminNote>{adminT("admin.publish.limitBody")}</AdminNote>
            </div>
          ) : view.absence === undefined ? (
            <form
              action={publishAction}
              className="grid justify-items-start gap-[8px]"
            >
              <Button type="submit">
                {adminT("admin.publish.button", { count: changes })}
              </Button>
              <AdminNote>
                {adminT("admin.publish.today", {
                  count: view.today,
                  limit: view.dailyLimit,
                })}
              </AdminNote>
            </form>
          ) : null}
        </section>

        <section className="grid gap-[12px]" aria-labelledby="publish-history">
          <h2
            id="publish-history"
            className="text-ink text-[20px] leading-[1.2]"
          >
            {adminT("admin.publish.historyTitle")}
          </h2>
          <AdminNote>
            {adminT("admin.publish.historyZone", {
              timeZone: session.timeZone,
            })}
          </AdminNote>
          {view.history.length === 0 ? (
            <AdminNote>{adminT("admin.publish.none")}</AdminNote>
          ) : (
            <AdminTable
              columns={[
                { key: "asked", label: adminT("admin.publish.colAsked") },
                { key: "result", label: adminT("admin.publish.colResult") },
                { key: "by", label: adminT("admin.publish.colBy") },
                {
                  key: "pages",
                  label: adminT("admin.publish.colPages"),
                  align: "end",
                },
                { key: "version", label: adminT("admin.publish.colVersion") },
              ]}
            >
              {view.history.map((entry) => (
                <AdminRow key={entry.id}>
                  <AdminCell nowrap>
                    {formatDate(
                      entry.requestedAt,
                      "en",
                      "dayMonthTime",
                      session.timeZone,
                    )}
                  </AdminCell>
                  <AdminCell>
                    {adminT(`admin.publish.status.${entry.status}`)}
                    {entry.errorCode === null ? null : (
                      <>
                        {" "}
                        <AdminCode>{entry.errorCode}</AdminCode>
                      </>
                    )}
                  </AdminCell>
                  <AdminCell>
                    {entry.requestedBy === null
                      ? adminT("admin.publish.byRelease")
                      : adminT("admin.publish.byAdmin")}
                  </AdminCell>
                  <AdminCell align="end">
                    +{n(entry.addedCount)} · −{n(entry.removedCount)}
                  </AdminCell>
                  <AdminCell>
                    <AdminCode>
                      {short(entry.headSha) ?? adminT("admin.publish.none")}
                    </AdminCode>
                  </AdminCell>
                </AdminRow>
              ))}
            </AdminTable>
          )}
        </section>
      </div>
    </AdminFrame>
  );
}
