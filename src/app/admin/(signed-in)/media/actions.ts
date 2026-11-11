/**
 * @purpose POST action of the photo review page: approve or reject through attest() (012b AC-23)
 * @spec 012b
 *
 * Thin (`plan/01` §5): `requirePermission("media.review")` first, then the form into
 * `reviewPhoto`, which records the decision through `attest()` only (spec 012b §2.4, §2.7;
 * TASK-299). A redirect names the outcome as a code; the note never travels in the URL.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adminRequestId,
  requirePermission,
  reviewPhoto,
} from "@/modules/admin";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Approve (the four checks ticked) or reject (a note written). */
export async function reviewPhotoAction(form: FormData): Promise<void> {
  const session = await requirePermission("media.review");
  const assetId = z.uuid().catch("").parse(text(form, "assetId"));
  const note = text(form, "note");
  const result = await reviewPhoto(
    {
      userId: session.userId,
      requestId: await adminRequestId(),
      roles: session.roles,
    },
    {
      assetId,
      checksum: text(form, "checksum"),
      decision: text(form, "decision"),
      ...(note === "" ? {} : { note }),
      checks: form
        .getAll("check")
        .filter((value): value is string => typeof value === "string"),
    },
  );
  const query = new URLSearchParams(
    result.ok
      ? { result: text(form, "decision") }
      : { result: "refused", reason: result.reason },
  );
  redirect(`/admin/media/${assetId}?${query.toString()}`);
}
