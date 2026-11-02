/**
 * @purpose The application pages' shared pieces: status chips and outcomes
 * @spec 012
 *
 * Chip tones of the artboards (`admin-applications-*`: new sage, contacted butter, converted
 * leaf, rejected paper) and the outcome a server action names in the query string.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import { adminT } from "@/modules/admin";
import type { FloristApplicationStatus } from "@/modules/partners";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import { AdminChip, type AdminChipTone } from "@/modules/ui/admin/AdminData";

export const APPLICATION_TONE: Readonly<
  Record<FloristApplicationStatus, AdminChipTone>
> = {
  new: "sky",
  contacted: "warn",
  converted: "ok",
  rejected: "plain",
};

export function ApplicationStatusChip({
  status,
}: {
  readonly status: FloristApplicationStatus;
}): ReactElement {
  return (
    <AdminChip tone={APPLICATION_TONE[status]}>
      {adminT(`admin.applications.status.${status}`)}
    </AdminChip>
  );
}

const DONE = ["contacted", "converted", "rejected"] as const;
const REFUSED = ["conflict", "illegal_edge", "invalid", "not_found"] as const;

export const ApplicationResultSchema = z.object({
  result: z
    .enum([...DONE, ...REFUSED])
    .optional()
    .catch(undefined),
});

export function ApplicationMessage({
  result,
}: {
  readonly result: z.infer<typeof ApplicationResultSchema>["result"];
}): ReactElement | null {
  if (result === undefined) return null;
  if (
    result === "contacted" ||
    result === "converted" ||
    result === "rejected"
  ) {
    return (
      <AdminToast>{adminT(`admin.applications.result.${result}`)}</AdminToast>
    );
  }
  return (
    <AdminRefusal>{adminT(`admin.applications.result.${result}`)}</AdminRefusal>
  );
}
