/**
 * @purpose GET /admin/media: every photo, newest first, with filters and the upload form by source
 * @spec 012b
 *
 * Spec 012b §2.7, §5.3 (TASK-299), after `docs/design/wireframes/admin-media-desktop.dc.html`
 * and `-mobile`. Every signed-in role reads the grid; Upload needs `media.upload` and is absent
 * otherwise, with the reason as text (spec 004 §14 A20). `?upload=1` opens the upload form; a
 * refusal comes back as `?result=refused&reason=…` and is shown above it, with "nothing is
 * stored". The form posts to `POST /admin/api/media`; `MediaUploadForm` adds the progress.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import {
  MEDIA_SOURCES,
  MEDIA_STATES,
  MediaListFilterSchema,
  type MediaListRow,
  UPLOAD_DEPICTS,
  adminRequestId,
  adminT,
  can,
  catalogueBackupWarning,
  catalogueSuppliers,
  mediaList,
  requireAdminPage,
} from "@/modules/admin";
import { formatNumber, formatPercentFromBasisPoints } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminRefusal,
  adminButtonClass,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminChip,
  AdminCode,
  AdminEmpty,
  AdminField,
  AdminFilterBar,
  AdminFilterClear,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminNote,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import { AdminCard } from "@/modules/ui/admin/AdminRecord";
import { MediaUploadForm } from "@/modules/ui/admin/MediaUploadForm";
import { AdminFrame } from "../frame";

export const dynamic = "force-dynamic";

const BASE = "/admin/media";
const UPLOAD_REFUSALS = [
  "empty",
  "too_large",
  "type",
  "too_many_pixels",
  "undecodable",
  "delivery",
  "supplier_required",
  "provenance",
  "supplier_unknown",
  "product_unknown",
  "duplicate",
  "storage_unconfigured",
  "failed",
] as const;
const CHECKS = ["people", "address", "brand", "matches"] as const;

const QuerySchema = z
  .object({
    upload: z.literal("1").optional().catch(undefined),
    result: z.literal("refused").optional().catch(undefined),
    reason: z.enum(UPLOAD_REFUSALS).optional().catch(undefined),
  })
  .catch({});

function stateTone(state: string): "ok" | "warn" | "bad" {
  return state === "approved" ? "ok" : state === "rejected" ? "bad" : "warn";
}

function PhotoCard({ row }: { readonly row: MediaListRow }): ReactElement {
  const known = z.enum(MEDIA_STATES).safeParse(row.state);
  const source = z.enum(MEDIA_SOURCES).safeParse(row.source);
  return (
    <li>
      <a
        href={`${BASE}/${row.id}`}
        className="border-line bg-paper focus-visible:outline-ink grid gap-[8px] rounded-[10px] border p-[10px] focus-visible:outline-2"
      >
        <span className="bg-paper-3 text-ink-3 grid aspect-[4/5] place-items-center rounded-[6px] text-[12px]">
          <AdminCode>{row.shortId}</AdminCode>
        </span>
        <span className="flex flex-wrap gap-[6px]">
          <AdminChip tone={stateTone(row.state)}>
            {known.success
              ? adminT(`admin.media.state.${known.data}`)
              : row.state}
          </AdminChip>
          {row.imported ? (
            <AdminChip tone="demo">{adminT("admin.media.imported")}</AdminChip>
          ) : null}
        </span>
        <span className="text-ink-3 text-[13px]">
          {source.success
            ? adminT(`admin.media.source.${source.data}`)
            : row.source}
          {" · "}
          {row.skus.length === 0
            ? adminT("admin.media.notAttached")
            : row.skus.join(", ")}
        </span>
      </a>
    </li>
  );
}

function UploadForm({
  florists,
  reason,
}: {
  readonly florists: readonly { readonly id: string; readonly code: string }[];
  readonly reason: (typeof UPLOAD_REFUSALS)[number] | undefined;
}): ReactElement {
  const input = (
    id: string,
    name: string,
    label: string,
    hint?: string,
    extra: Record<string, string | number | boolean> = {},
  ): ReactElement => (
    <AdminField id={id} label={label} hint={hint}>
      <input
        id={id}
        name={name}
        className={adminControlClass(false)}
        {...adminFieldAria(id, hint, undefined)}
        {...extra}
      />
    </AdminField>
  );
  return (
    <AdminCard title={adminT("admin.media.upload.title")}>
      {reason === undefined ? null : (
        <AdminRefusal>
          {adminT(`admin.media.refused.${reason}`)}{" "}
          {adminT("admin.media.refusedNote")}
        </AdminRefusal>
      )}
      <MediaUploadForm
        action="/admin/api/media"
        progressLabels={Array.from({ length: 11 }, (_, step) =>
          adminT("admin.media.upload.progress", {
            percent: formatPercentFromBasisPoints(step * 1000, "en"),
          }),
        )}
        failedHref={`${BASE}?upload=1&result=refused&reason=failed`}
      >
        {input(
          "media-file",
          "file",
          adminT("admin.media.upload.file"),
          adminT("admin.media.upload.fileHint"),
          {
            type: "file",
            required: true,
            accept: "image/jpeg,image/png,image/webp",
          },
        )}
        <fieldset className="grid gap-[8px]">
          <legend className="text-ink-2 text-[13px] font-bold">
            {adminT("admin.media.upload.source")}
          </legend>
          {MEDIA_SOURCES.map((source, index) => (
            <label
              key={source}
              className="flex min-h-[24px] items-center gap-[8px] text-[14px]"
            >
              <input
                type="radio"
                name="source"
                value={source}
                defaultChecked={index === 0}
                required
              />
              {adminT(`admin.media.upload.sourceOption.${source}`)}
            </label>
          ))}
        </fieldset>
        <fieldset data-source-group="partner" className="grid gap-[12px]">
          <AdminField
            id="media-florist"
            label={adminT("admin.media.upload.florist")}
            hint={adminT("admin.media.upload.floristHint")}
          >
            <select
              id="media-florist"
              name="supplierPartnerId"
              defaultValue=""
              className={adminControlClass(false)}
              {...adminFieldAria(
                "media-florist",
                adminT("admin.media.upload.floristHint"),
                undefined,
              )}
            >
              <option value="">
                {adminT("admin.media.upload.chooseFlorist")}
              </option>
              {florists.map((florist) => (
                <option key={florist.id} value={florist.id}>
                  {florist.code}
                </option>
              ))}
            </select>
          </AdminField>
        </fieldset>
        <fieldset
          data-source-group="ai"
          className="grid gap-[12px] md:grid-cols-2"
        >
          {input(
            "media-generator",
            "generator",
            adminT("admin.media.upload.generator"),
          )}
          {input(
            "media-model",
            "generatorModel",
            adminT("admin.media.upload.generatorModel"),
          )}
          {input(
            "media-prompt",
            "promptHash",
            adminT("admin.media.upload.promptHash"),
          )}
          {input(
            "media-seed",
            "generatorSeed",
            adminT("admin.media.upload.generatorSeed"),
            undefined,
            {
              inputMode: "numeric",
            },
          )}
        </fieldset>
        <fieldset
          data-source-group="photo"
          className="grid gap-[12px] md:grid-cols-2"
        >
          {input(
            "media-credit",
            "credit",
            adminT("admin.media.upload.credit"),
            adminT("admin.media.upload.creditHint"),
          )}
          {input(
            "media-licence",
            "licence",
            adminT("admin.media.upload.licence"),
          )}
        </fieldset>
        <fieldset className="grid gap-[8px]">
          <legend className="text-ink-2 text-[13px] font-bold">
            {adminT("admin.media.upload.depicts")}
          </legend>
          {UPLOAD_DEPICTS.map((depicts, index) => (
            <label
              key={depicts}
              className="flex min-h-[24px] items-center gap-[8px] text-[14px]"
            >
              <input
                type="radio"
                name="depicts"
                value={depicts}
                defaultChecked={index === 0}
                required
              />
              {adminT(`admin.media.upload.depictsOption.${depicts}`)}
            </label>
          ))}
          <AdminNote>{adminT("admin.media.upload.deliveryNote")}</AdminNote>
        </fieldset>
        {input(
          "media-sku",
          "productSku",
          adminT("admin.media.upload.product"),
          adminT("admin.media.upload.productHint"),
          { pattern: "FO-[A-Z]{2}-[0-9]{3}" },
        )}
        <div className="bg-paper-2 grid gap-[6px] rounded-[8px] p-[12px]">
          <p className="text-[14px] font-bold">
            {adminT("admin.media.upload.checksTitle")}
          </p>
          <ul className="text-ink-2 list-disc ps-[20px] text-[14px]">
            {CHECKS.map((check) => (
              <li key={check}>{adminT(`admin.media.checks.${check}`)}</li>
            ))}
          </ul>
          <AdminNote>{adminT("admin.media.upload.checksNote")}</AdminNote>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <button type="submit" className={adminButtonClass("primary")}>
            {adminT("admin.media.upload.submit")}
          </button>
          <a href={BASE} className={adminButtonClass("ghost")}>
            {adminT("admin.media.upload.cancel")}
          </a>
        </div>
      </MediaUploadForm>
    </AdminCard>
  );
}

export default async function MediaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const params = await searchParams;
  const filter = MediaListFilterSchema.parse(params);
  const query = QuerySchema.parse(params);
  const actor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const mayUpload = can(session.roles, "media.upload");
  const [view, florists] = await Promise.all([
    mediaList(actor, filter),
    mayUpload && query.upload === "1"
      ? catalogueSuppliers(actor)
      : Promise.resolve([]),
  ]);
  const filtered =
    filter.state !== undefined ||
    filter.source !== undefined ||
    filter.sku !== undefined;

  return (
    <AdminFrame
      session={session}
      current="media"
      backupWarning={await catalogueBackupWarning()}
    >
      <div className="grid gap-[20px]">
        <header className="flex flex-wrap items-end justify-between gap-[12px]">
          <div>
            <AdminPageTitle>{adminT("admin.media.title")}</AdminPageTitle>
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.media.summary", {
                total: view.photoCount,
                waiting: formatNumber(view.waitingCount, "en"),
              })}
            </p>
          </div>
          {mayUpload ? (
            <a
              href={`${BASE}?upload=1`}
              className={adminButtonClass("primary")}
            >
              {adminT("admin.media.upload.open")}
            </a>
          ) : (
            <p className="text-ink-3 text-[13px]">
              {adminT("admin.media.readOnly")}
            </p>
          )}
        </header>
        {mayUpload && query.upload === "1" ? (
          <UploadForm
            florists={florists}
            reason={query.result === "refused" ? query.reason : undefined}
          />
        ) : null}
        <AdminFilterBar label={adminT("admin.media.filters.label")}>
          <AdminFilterSelect
            id="media-state"
            name="state"
            label={adminT("admin.media.filters.state")}
            anyLabel={adminT("admin.media.filters.anyState")}
            options={MEDIA_STATES.map((state) => ({
              value: state,
              label: adminT(`admin.media.state.${state}`),
            }))}
            value={filter.state}
          />
          <AdminFilterSelect
            id="media-source"
            name="source"
            label={adminT("admin.media.filters.source")}
            anyLabel={adminT("admin.media.filters.anySource")}
            options={MEDIA_SOURCES.map((source) => ({
              value: source,
              label: adminT(`admin.media.source.${source}`),
            }))}
            value={filter.source}
          />
          <AdminFilterSubmit>
            {adminT("admin.media.filters.apply")}
          </AdminFilterSubmit>
          <AdminFilterClear href={BASE}>
            {adminT("admin.media.filters.clear")}
          </AdminFilterClear>
        </AdminFilterBar>
        {view.rows.length === 0 ? (
          <AdminEmpty
            title={adminT(
              filtered
                ? "admin.media.filteredEmpty.title"
                : "admin.media.empty.title",
            )}
          >
            {filtered ? (
              <a href={BASE} className={adminButtonClass("ghost")}>
                {adminT("admin.media.filters.clear")}
              </a>
            ) : null}
          </AdminEmpty>
        ) : (
          <ul className="grid grid-cols-2 gap-[12px] md:grid-cols-3 xl:grid-cols-5">
            {view.rows.map((row) => (
              <PhotoCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </AdminFrame>
  );
}
