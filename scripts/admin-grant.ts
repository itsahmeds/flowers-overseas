/**
 * @purpose Create or update an admin (§2.2)
 * @spec 012
 *
 * `pnpm admin:grant --email <e> --name <n> --role <r>` — create or update an admin over the direct
 * URL (spec 012 §2.2 "Bootstrap and users", §12 founder action 4; TASK-217).
 *
 * How the founder creates their own account, before anyone can sign in to grant one. One
 * transaction over `DATABASE_URL_UNPOOLED` with `app.role = 'admin'` and `app.audit_channel =
 * 'cli'` set, so spec 012's audit trigger (TASK-218) records it on the `cli` channel: upsert the
 * `users` row by its lower-cased address, upsert `admin_profile` (clearing a deactivation), add the
 * role. Prints the outcome without the address (no PII in output that may be pasted into a log).
 * The same rules as `AdminGrantSchema` in `src/modules/admin/users.ts`, restated here because a
 * script runs on Node's type stripping and cannot resolve the `@/` alias.
 */
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

import { adminRoles } from "../db/schema/auth.ts";

export const AdminGrantArgsSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    name: z.string().trim().min(2).max(80),
    role: z.enum(adminRoles),
  })
  .strict();
export type AdminGrantArgs = z.infer<typeof AdminGrantArgsSchema>;

export function parseAdminGrantArgs(argv: readonly string[]): AdminGrantArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
    },
    strict: true,
  });
  return AdminGrantArgsSchema.parse(values);
}

/** Runs the grant on `sql`; returns the user id. */
export async function adminGrant(
  sql: postgres.Sql,
  args: AdminGrantArgs,
): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.role', 'admin', true)`;
    await tx`SELECT set_config('app.request_id', 'cli:admin-grant', true)`;
    await tx`SELECT set_config('app.audit_channel', 'cli', true)`;
    await tx`SELECT set_config('app.audit_action', 'users.grant', true)`;
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (email) VALUES (${args.email})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id`;
    if (user === undefined) throw new Error("admin:grant: no user row");
    await tx`
      INSERT INTO admin_profile (user_id, display_name) VALUES (${user.id}, ${args.name})
      ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, deactivated_at = NULL`;
    await tx`
      INSERT INTO user_role (user_id, role) VALUES (${user.id}, ${args.role})
      ON CONFLICT DO NOTHING`;
    return user.id;
  }) as Promise<string>;
}

async function main(): Promise<number> {
  let args: AdminGrantArgs;
  try {
    args = parseAdminGrantArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "usage: pnpm admin:grant --email <address> --name <2 to 80 characters> --role <admin|ops|finance|content>\n",
    );
    return 2;
  }
  const url = process.env["DATABASE_URL_UNPOOLED"];
  if (url === undefined || url === "") {
    process.stderr.write("admin:grant: DATABASE_URL_UNPOOLED is not set\n");
    return 1;
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const id = await adminGrant(sql, args);
    process.stdout.write(
      `admin:grant: role ${args.role} granted to user ${id}\n`,
    );
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
