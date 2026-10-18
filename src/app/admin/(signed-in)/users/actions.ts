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
  AdminDeactivateSchema,
  AdminGrantSchema,
  AdminRevokeSchema,
  adminRequestId,
  deactivateUser,
  grantRole,
  requirePermission,
  revokeRole,
  type UserCommandResult,
} from "@/modules/admin";

/*
 * The form's own fields, parsed; anything else Next adds to a server action's form data (its
 * `$ACTION_…` keys) is stripped. A form that does not parse reaches the command as `undefined`,
 * which the command refuses as `invalid`.
 */
function grantForm(input: unknown): unknown {
  const parsed = AdminGrantSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function revokeForm(input: unknown): unknown {
  const parsed = AdminRevokeSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function deactivateForm(input: unknown): unknown {
  const parsed = AdminDeactivateSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function outcome(result: UserCommandResult): never {
  redirect(`/admin/users?result=${result.ok ? "saved" : result.reason}`);
}

export async function grantRoleAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await grantRole(
      { userId: session.userId, requestId: await adminRequestId() },
      grantForm(Object.fromEntries(formData)),
    ),
  );
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await revokeRole(
      { userId: session.userId, requestId: await adminRequestId() },
      revokeForm(Object.fromEntries(formData)),
    ),
  );
}

export async function deactivateUserAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.manage");
  outcome(
    await deactivateUser(
      { userId: session.userId, requestId: await adminRequestId() },
      deactivateForm(Object.fromEntries(formData)),
    ),
  );
}
