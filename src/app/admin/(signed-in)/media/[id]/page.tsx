/**
 * @purpose GET /admin/media/[id]: one photo at full size, spec 006's four checks, approve or reject
 * @spec 012b
 *
 * Spec 012b §2.7, §2.4, §5.3 (TASK-299), after
 * `docs/design/wireframes/admin-media-review-desktop.dc.html` and `-mobile`. The photo on the
 * main column, the checks, the decision and the provenance on the side. Approve and Reject need
 * `media.review` and are absent without it, with the reason. A florist's photo whose florist has
 * no recorded `terms_version` shows no Approve, and says why (`attest()` refuses it anyway). The
 * decision goes through `attest()` only. The photo is the stripped original, read through
 * `GET /admin/api/media/[id]/original`, never a public URL.
 */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";

import {
  MEDIA_SOURCES,
  MEDIA_STATES,
  type MediaDetailView,
  adminRequestId,
  adminT,
  can,
  mediaDetail,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  AdminButton,
  AdminRefusal,
  AdminToast,
  adminButtonClass,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminChip,
  AdminCode,
  AdminField,
  AdminNote,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminCard,
  AdminKeyValues,
  AdminRecordColumns,
  AdminRecordHead,
} from "@/modules/ui/admin/AdminRecord";
import { AdminFrame } from "../../frame";
import { reviewPhotoAction } from "../actions";

export const dynamic = "force-dynamic";

const CHECKS = ["people", "address", "brand", "matches"] as const;
const REVIEW_REFUSALS = [
  "invalid",
  "not_a_reviewer",
  "no_display_name",
  "permission_denied",
  "unknown_subject",
  "stale_hash",
  "no_supplier_terms",
  "note_required",
] as const;

const QuerySchema = z
  .object({
    result: z
      .enum(["uploaded", "approved", "rejected", "refused"])
      .optional()
      .catch(undefined),
    reason: z.enum(REVIEW_REFUSALS).optional().catch(undefined),
  })
  .catch({});

function Outcome({
  query,
}: {
  readonly query: z.infer<typeof QuerySchema>;
}): ReactElement | null {
  if (query.result === undefined) return null;
  if (query.result === "refused") {
    return (
      <AdminRefusal>
        {adminT(`admin.media.reviewRefused.${query.reason ?? "invalid"}`)}
      </AdminRefusal>
    );
  }
  return (
    <AdminToast>{adminT(`admin.media.result.${query.result}`)}</AdminToast>
  );
}

function Decision({
  photo,
  mayReview,
}: {
  readonly photo: MediaDetailView;
  readonly mayReview: boolean;
}): ReactElement {
  if (!mayReview) {
    return <AdminNote>{adminT("admin.media.review.noPermission")}</AdminNote>;
  }
  const unlicensed =
    photo.source === "partner" &&
    (photo.supplier === undefined || photo.supplier.terms === null);
  const approveLabel =
    photo.state === "approved"
      ? "admin.media.review.approveAgain"
      : "admin.media.review.approve";
  return (
    <div className="grid gap-[16px]">
      <form action={reviewPhotoAction} className="grid gap-[10px]">
        <input type="hidden" name="assetId" value={photo.id} />
        <input type="hidden" name="checksum" value={photo.checksum} />
        <input type="hidden" name="decision" value="approved" />
        <fieldset className="grid gap-[8px]">
          <legend className="sr-only">
            {adminT("admin.media.review.checks")}
          </legend>
          {CHECKS.map((check) => (
            <label
              key={check}
              className="flex min-h-[24px] items-center gap-[8px] text-[14px]"
            >
              <input type="checkbox" name="check" value={check} />
              {adminT(`admin.media.checks.${check}`)}
            </label>
          ))}
        </fieldset>
        {unlicensed ? (
          <AdminNote>
            {adminT("admin.media.review.noTerms", {
              florist: photo.supplier?.code ?? "",
            })}
          </AdminNote>
        ) : (
          <>
            <AdminNote>{adminT("admin.media.review.approveHint")}</AdminNote>
            <div>
              <AdminButton tone="primary">{adminT(approveLabel)}</AdminButton>
            </div>
          </>
        )}
      </form>
      {photo.state === "rejected" ? null : (
        <form action={reviewPhotoAction} className="grid gap-[10px]">
          <input type="hidden" name="assetId" value={photo.id} />
          <input type="hidden" name="checksum" value={photo.checksum} />
          <input type="hidden" name="decision" value="rejected" />
          <AdminField
            id="media-note"
            label={adminT("admin.media.review.note")}
            hint={adminT("admin.media.review.noteHint")}
          >
            <textarea
              id="media-note"
              name="note"
              rows={3}
              required
              maxLength={2000}
              className={adminControlClass(false)}
              {...adminFieldAria(
                "media-note",
                adminT("admin.media.review.noteHint"),
                undefined,
              )}
            />
          </AdminField>
          <div>
            <AdminButton tone="danger">
              {adminT("admin.media.review.reject")}
            </AdminButton>
          </div>
        </form>
      )}
    </div>
  );
}

export default async function MediaReviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const { id } = await params;
  const query = QuerySchema.parse(await searchParams);
  const actor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const photo = await mediaDetail(actor, id);
  if (photo === undefined) notFound();
  const mayReview = can(session.roles, "media.review");
  const state = z.enum(MEDIA_STATES).safeParse(photo.state);
  const source = z.enum(MEDIA_SOURCES).safeParse(photo.source);
  const when = (instant: string): string =>
    adminT("admin.media.when", {
      date: formatDate(
        new Date(instant),
        "en",
        "dayMonthYearTime",
        session.timeZone,
      ),
      timeZone: zoneCity(session.timeZone),
    });

  const facts = [
    {
      key: "source",
      label: adminT("admin.media.facts.source"),
      value: source.success
        ? adminT(`admin.media.source.${source.data}`)
        : photo.source,
    },
    ...(photo.supplier === undefined
      ? []
      : [
          {
            key: "florist",
            label: adminT("admin.media.facts.florist"),
            value: <AdminCode>{photo.supplier.code}</AdminCode>,
          },
        ]),
    ...(photo.source === "partner"
      ? [
          {
            key: "licence",
            label: adminT("admin.media.facts.licence"),
            value:
              photo.supplier?.terms == null
                ? adminT("admin.media.facts.noTerms")
                : adminT("admin.media.facts.termsVersion", {
                    version: photo.supplier.terms,
                  }),
          },
        ]
      : [
          {
            key: "credit",
            label: adminT("admin.media.facts.credit"),
            value: photo.credit ?? "",
          },
          {
            key: "licence",
            label: adminT("admin.media.facts.licence"),
            value: photo.licence ?? photo.generatorModel ?? "",
          },
        ]),
    {
      key: "uploaded",
      label: adminT("admin.media.facts.uploaded"),
      value: when(photo.createdAt),
    },
    {
      key: "file",
      label: adminT("admin.media.facts.file"),
      value: adminT("admin.media.facts.fileValue", {
        width: formatNumber(photo.width ?? 0, "en"),
        height: formatNumber(photo.height ?? 0, "en"),
        mime: photo.mime,
      }),
    },
    {
      key: "fingerprint",
      label: adminT("admin.media.facts.fingerprint"),
      value: (
        <AdminCode>{`${photo.checksum.slice(0, 4)}…${photo.checksum.slice(-4)}`}</AdminCode>
      ),
    },
    {
      key: "used",
      label: adminT("admin.media.facts.usedOn"),
      value:
        photo.skus.length === 0
          ? adminT("admin.media.notAttached")
          : photo.skus.map((sku) => (
              <Link
                key={sku}
                href={`/admin/catalogue/products/${sku}?tab=photos`}
                className="me-[8px] underline"
              >
                {sku}
              </Link>
            )),
    },
  ];

  return (
    <AdminFrame session={session} current="media">
      <div className="grid gap-[16px]">
        <AdminBackLink href="/admin/media">
          {adminT("admin.media.back")}
        </AdminBackLink>
        <AdminRecordHead
          title={adminT("admin.media.review.title", {
            id: photo.id.slice(0, 4),
          })}
          sub={
            <>
              <AdminChip
                tone={
                  photo.state === "approved"
                    ? "ok"
                    : photo.state === "rejected"
                      ? "bad"
                      : "warn"
                }
              >
                {state.success
                  ? adminT(`admin.media.state.${state.data}`)
                  : photo.state}
              </AdminChip>
              {photo.imported ? (
                <AdminChip tone="demo">
                  {adminT("admin.media.imported")}
                </AdminChip>
              ) : null}
            </>
          }
        />
        <Outcome query={query} />
        <AdminRecordColumns
          main={
            <div className="grid gap-[12px]">
              <Image
                src={`/admin/api/media/${photo.id}/original`}
                alt={adminT("admin.media.review.imageAlt")}
                width={photo.width ?? 1200}
                height={photo.height ?? 1500}
                unoptimized
                className="bg-paper-3 h-auto max-h-[80vh] w-full rounded-[10px] object-contain"
              />
              {photo.derived || photo.state !== "approved" ? null : (
                <AdminNote>{adminT("admin.media.review.deriving")}</AdminNote>
              )}
            </div>
          }
          aside={
            <div className="grid gap-[16px]">
              <AdminCard title={adminT("admin.media.review.decision")}>
                {photo.state === "pending" ? null : (
                  <p className="mb-[12px] text-[14px]">
                    {adminT(
                      photo.state === "approved"
                        ? "admin.media.review.approvedBy"
                        : "admin.media.review.rejectedBy",
                      {
                        name: photo.reviewedBy ?? "",
                        when:
                          photo.reviewedAt === null
                            ? ""
                            : when(photo.reviewedAt),
                      },
                    )}
                    {photo.state === "rejected" && photo.note !== null
                      ? ` ${adminT("admin.media.review.noteShown", { note: photo.note })}`
                      : ""}
                  </p>
                )}
                {photo.imported ? (
                  <AdminNote>
                    {adminT("admin.media.review.importedBody")}
                  </AdminNote>
                ) : null}
                <Decision photo={photo} mayReview={mayReview} />
              </AdminCard>
              <AdminCard title={adminT("admin.media.review.provenance")}>
                <AdminKeyValues items={facts} variant="tight" />
                {photo.supplier === undefined ? null : (
                  <AdminNote>
                    {adminT("admin.media.review.privateNote")}
                  </AdminNote>
                )}
              </AdminCard>
              {photo.source === "partner" &&
              photo.supplier !== undefined &&
              photo.supplier.terms === null ? (
                <a
                  href={`/admin/partners/${photo.supplier.code}`}
                  className={adminButtonClass("ghost")}
                >
                  {adminT("admin.media.review.recordTerms")}
                </a>
              ) : null}
            </div>
          }
        />
      </div>
    </AdminFrame>
  );
}
