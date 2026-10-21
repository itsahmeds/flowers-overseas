/**
 * @purpose /admin/flags toggle action, guarded first (AC-14)
 * @spec 012
 *
 * Thin (`plan/01` §5): `requirePermission("flags.toggle")` is the first statement (T-02 scans for
 * it), then `toggleFlag` (the registry, the high-risk rule, the audited write, the invalidation),
 * then a redirect that names the outcome, the key and the scope reference — never a person.
 */
"use server";

import { redirect } from "next/navigation";

import {
  FlagToggleFormSchema,
  adminRequestId,
  requirePermission,
  toggleFlag,
  type FlagToggleResult,
} from "@/modules/admin";

/*
 * The form's own fields; anything else Next adds to a server action's form data (its `$ACTION_…`
 * keys) is stripped. A form that does not parse reaches the command as `undefined`, which the
 * command refuses as `invalid`.
 */
function toggleForm(input: unknown): unknown {
  const parsed = FlagToggleFormSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function outcome(result: FlagToggleResult): never {
  if (!result.ok) redirect(`/admin/flags?result=${result.reason}`);
  const params = new URLSearchParams({
    result: result.changed ? (result.enabled ? "on" : "off") : "unchanged",
    key: result.key,
    ref: result.scope.ref,
  });
  redirect(`/admin/flags?${params.toString()}`);
}

export async function toggleFlagAction(formData: FormData): Promise<void> {
  const session = await requirePermission("flags.toggle");
  outcome(
    await toggleFlag(
      {
        userId: session.userId,
        requestId: await adminRequestId(),
        roles: session.roles,
      },
      toggleForm(Object.fromEntries(formData)),
    ),
  );
}
