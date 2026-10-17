/**
 * @purpose Server actions of /admin/users: grant, revoke, deactivate, each guarded first (spec 012 §2.2, AC-3, AC-4)
 *
 * Thin (`plan/01` §5): `requirePermission("users.manage")` is the first statement of each (T-02
 * scans for it), then the `src/modules/admin` command, then a redirect that names the outcome and
 * nothing else.
 */
"use server";

import { redirect } from "next/navigation";

import {
  adminRequestId,
  deactivateUser,
  grantRole,
  requirePermission,
  revokeRole,
  type UserCommandResult,
} from "@/modules/admin";

function outcome(result: UserCommandResult): never {
  redirect(`/admin/users?result=${result.ok ? "saved" : result.reason}`);
}

export async function grantRoleAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await grantRole(
      { userId: session.userId, requestId: await adminRequestId() },
      {
        email: formData.get("email"),
        displayName: formData.get("displayName"),
        role: formData.get("role"),
      },
    ),
  );
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await revokeRole(
      { userId: session.userId, requestId: await adminRequestId() },
      {
        userId: formData.get("userId"),
        role: formData.get("role"),
        updatedAt: formData.get("updatedAt"),
      },
    ),
  );
}

export async function deactivateUserAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await deactivateUser(
      { userId: session.userId, requestId: await adminRequestId() },
      {
        userId: formData.get("userId"),
        updatedAt: formData.get("updatedAt"),
      },
    ),
  );
}
