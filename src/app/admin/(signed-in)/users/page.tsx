/**
 * @purpose GET /admin/users: roles, grant, revoke, deactivate; own last admin role not removable (spec 012 §2.2)
 *
 * Controls that cannot act are absent with the reason as text (spec 004 §14 A20): no remove
 * control on your own admin role, no controls on a deactivated row. The deactivate confirmation
 * is a disclosure, so the page ships no client JavaScript.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import { adminRoles } from "../../../../../db/schema/auth";
import {
  adminRequestId,
  adminT,
  listAdminUsers,
  requireAdminPage,
} from "@/modules/admin";
import {
  AdminPageTitle,
  AdminRemoveGlyph,
  AdminTextField,
  Button,
} from "@/modules/ui";

import { AdminFrame } from "../frame";
import {
  deactivateUserAction,
  grantRoleAction,
  revokeRoleAction,
} from "./actions";

const ResultSchema = z.object({
  result: z
    .enum(["saved", "conflict", "invalid", "own_admin", "not_found"])
    .optional()
    .catch(undefined),
});

const RESULT_KEY = {
  saved: "admin.users.saved",
  conflict: "admin.users.conflict",
  invalid: "admin.users.invalid",
  own_admin: "admin.users.ownLastAdmin",
  not_found: "admin.errors.notFoundBody",
} as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("users.manage");
  const { result } = ResultSchema.parse(await searchParams);
  const rows = await listAdminUsers({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  return (
    <AdminFrame session={session} current="users">
      <div className="grid gap-[24px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.users.title")}</AdminPageTitle>
          <p className="text-ui text-ink-2">{adminT("admin.users.lead")}</p>
        </header>
        {result === undefined ? null : (
          <p role="status" className="text-ui text-ink font-bold">
            {adminT(RESULT_KEY[result])}
          </p>
        )}
        <form
          action={grantRoleAction}
          className="rounded-photo bg-card grid items-end gap-[12px] p-[16px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px_auto]"
        >
          <AdminTextField
            id="grant-email"
            name="email"
            type="email"
            required
            maxLength={254}
            label={adminT("admin.users.grantEmail")}
          />
          <AdminTextField
            id="grant-name"
            name="displayName"
            required
            minLength={2}
            maxLength={80}
            label={adminT("admin.users.grantName")}
          />
          <div className="grid gap-[6px]">
            <label htmlFor="grant-role" className="text-ui text-ink font-bold">
              {adminT("admin.users.grantRole")}
            </label>
            <select
              id="grant-role"
              name="role"
              defaultValue="ops"
              className="rounded-field border-field-edge bg-card text-ui text-ink min-h-[50px] border-[1.5px] px-[14px]"
            >
              {adminRoles.map((role) => (
                <option key={role} value={role}>
                  {adminT(`admin.roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{adminT("admin.users.grantSubmit")}</Button>
        </form>
        <div className="overflow-x-auto">
          <table className="text-ui w-full border-collapse">
            <thead>
              <tr className="border-rule text-ink-3 border-b text-start text-sm">
                <th
                  scope="col"
                  className="py-[10px] pe-[16px] text-start font-bold"
                >
                  {adminT("admin.users.columnName")}
                </th>
                <th
                  scope="col"
                  className="py-[10px] pe-[16px] text-start font-bold"
                >
                  {adminT("admin.users.columnEmail")}
                </th>
                <th
                  scope="col"
                  className="py-[10px] pe-[16px] text-start font-bold"
                >
                  {adminT("admin.users.columnRoles")}
                </th>
                <th
                  scope="col"
                  className="py-[10px] pe-[16px] text-start font-bold"
                >
                  {adminT("admin.users.columnStatus")}
                </th>
                <th scope="col" className="py-[10px] text-start font-bold">
                  <span className="sr-only">
                    {adminT("admin.users.deactivate")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const self = row.userId === session.userId;
                return (
                  <tr
                    key={row.userId}
                    className={`border-rule border-b align-top ${row.deactivated ? "bg-paper-3 text-ink-3" : ""}`}
                  >
                    <td className="py-[12px] pe-[16px]">
                      <span className="font-bold">{row.displayName}</span>
                      {self ? (
                        <span className="text-ink-3 ms-[6px]">
                          {adminT("admin.shell.you")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-[12px] pe-[16px] break-all">
                      {row.email}
                    </td>
                    <td className="py-[12px] pe-[16px]">
                      {row.roles.length === 0 ? (
                        <span>{adminT("admin.users.noRoles")}</span>
                      ) : (
                        <ul className="flex flex-wrap gap-[6px]">
                          {row.roles.map((role) => (
                            <li
                              key={role}
                              className={`inline-flex min-h-[32px] items-center gap-[4px] rounded-full px-[12px] text-sm font-bold ${self && role === "admin" ? "bg-ink text-paper" : "bg-leaf-wash text-ink"}`}
                            >
                              {adminT(`admin.roles.${role}`)}
                              {self && role === "admin" ? null : (
                                <form action={revokeRoleAction}>
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={row.userId}
                                  />
                                  <input
                                    type="hidden"
                                    name="role"
                                    value={role}
                                  />
                                  <input
                                    type="hidden"
                                    name="updatedAt"
                                    value={row.updatedAt}
                                  />
                                  <button
                                    type="submit"
                                    aria-label={adminT(
                                      "admin.users.removeRole",
                                      {
                                        role: adminT(`admin.roles.${role}`),
                                        name: row.displayName,
                                      },
                                    )}
                                    className="text-ink-2 hover:bg-card grid size-[24px] place-items-center rounded-full"
                                  >
                                    <AdminRemoveGlyph />
                                  </button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {self && row.roles.includes("admin") ? (
                        <p className="text-ink-3 mt-[6px] text-sm">
                          {adminT("admin.users.ownLastAdmin")}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-[12px] pe-[16px]">
                      {row.deactivated
                        ? adminT("admin.users.statusDeactivated")
                        : adminT("admin.users.statusActive")}
                    </td>
                    <td className="py-[12px]">
                      {row.deactivated || self ? (
                        <span className="text-ink-3">
                          {adminT("admin.users.none")}
                        </span>
                      ) : (
                        <details>
                          <summary className="text-danger min-h-[40px] cursor-pointer underline decoration-[1.5px] underline-offset-[5px]">
                            {adminT("admin.users.deactivate")}
                          </summary>
                          <form
                            action={deactivateUserAction}
                            className="rounded-photo bg-card mt-[8px] grid max-w-[320px] gap-[10px] p-[16px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)]"
                          >
                            <p className="text-ink-2 text-sm">
                              {adminT("admin.users.deactivateConfirm", {
                                name: row.displayName,
                              })}
                            </p>
                            <input
                              type="hidden"
                              name="userId"
                              value={row.userId}
                            />
                            <input
                              type="hidden"
                              name="updatedAt"
                              value={row.updatedAt}
                            />
                            <Button type="submit" variant="danger" size="sm">
                              {adminT("admin.users.deactivate")}
                            </Button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminFrame>
  );
}
