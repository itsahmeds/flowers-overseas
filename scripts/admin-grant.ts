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
 *
 * `--locale <l>` grants a review locale and `--revoke-locale <l>` removes one (spec 012b §2.4,
 * §5.2, AC-11; TASK-293): a `reviewer_locale` row says which locale's copy the person may
 * approve through `attest()` (the founder holds `en` and `en-gb`, a native reviewer `pl` or `de`,
 * §13 Q7). Either may be repeated, combined with a grant, or used alone with `--email` on an
 * existing admin (`pnpm admin:grant --email <e> --locale pl`). Neither touches a session: the
 * grant is read on the next `attest()`, so nobody is signed out.
 */
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

import { adminRoles } from "../db/schema/auth.ts";

const LocaleCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}(?:-[a-z]{2})?$/u, "a locale code such as pl or en-gb");

export const AdminGrantArgsSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(adminRoles).optional(),
    locales: z.array(LocaleCodeSchema).min(1).optional(),
    revokeLocales: z.array(LocaleCodeSchema).min(1).optional(),
  })
  .strict()
  .refine((args) => (args.name === undefined) === (args.role === undefined), {
    message: "--name and --role go together",
  })
  .refine(
    (args) =>
      args.role !== undefined ||
      args.locales !== undefined ||
      args.revokeLocales !== undefined,
    {
      message:
        "nothing to do: give --name and --role, --locale or --revoke-locale",
    },
  );
export type AdminGrantArgs = z.infer<typeof AdminGrantArgsSchema>;

export function parseAdminGrantArgs(argv: readonly string[]): AdminGrantArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      locale: { type: "string", multiple: true },
      "revoke-locale": { type: "string", multiple: true },
    },
    strict: true,
  });
  const { locale, "revoke-locale": revoke, ...rest } = values;
  return AdminGrantArgsSchema.parse({
    ...rest,
    ...(locale === undefined ? {} : { locales: locale }),
    ...(revoke === undefined ? {} : { revokeLocales: revoke }),
  });
}

/**
 * Runs the grant on `sql`; returns the user id. With `name` and `role`, upserts the user, the
 * profile and the role; then adds each `locales` entry and removes each `revokeLocales` entry.
 * Locale changes alone need an existing user. No session row is read or written.
 */
export async function adminGrant(
  sql: postgres.Sql,
  args: AdminGrantArgs,
): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.role', 'admin', true)`;
    await tx`SELECT set_config('app.request_id', 'cli:admin-grant', true)`;
    await tx`SELECT set_config('app.audit_channel', 'cli', true)`;
    await tx`SELECT set_config('app.audit_action', 'users.grant', true)`;
    let userId: string;
    if (args.name !== undefined && args.role !== undefined) {
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
      userId = user.id;
    } else {
      const [user] = await tx<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${args.email}`;
      if (user === undefined) {
        throw new Error(
          "admin:grant: no such user; grant a role with --name and --role first",
        );
      }
      userId = user.id;
    }
    for (const locale of args.locales ?? []) {
      await tx`SELECT set_config('app.audit_action', 'users.locale.grant', true)`;
      await tx`
        INSERT INTO reviewer_locale (user_id, locale_code) VALUES (${userId}, ${locale})
        ON CONFLICT (user_id, locale_code) DO NOTHING`;
    }
    for (const locale of args.revokeLocales ?? []) {
      await tx`SELECT set_config('app.audit_action', 'users.locale.revoke', true)`;
      await tx`
        DELETE FROM reviewer_locale WHERE user_id = ${userId} AND locale_code = ${locale}`;
    }
    return userId;
  }) as Promise<string>;
}

async function main(): Promise<number> {
  let args: AdminGrantArgs;
  try {
    args = parseAdminGrantArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "usage: pnpm admin:grant --email <address> [--name <2 to 80 characters> --role <admin|ops|finance|content>] [--locale <code>]… [--revoke-locale <code>]…\n",
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
    if (args.role !== undefined) {
      process.stdout.write(
        `admin:grant: role ${args.role} granted to user ${id}\n`,
      );
    }
    for (const locale of args.locales ?? []) {
      process.stdout.write(
        `admin:grant: review locale ${locale} granted to user ${id}\n`,
      );
    }
    for (const locale of args.revokeLocales ?? []) {
      process.stdout.write(
        `admin:grant: review locale ${locale} revoked from user ${id}\n`,
      );
    }
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
