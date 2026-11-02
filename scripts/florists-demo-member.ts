/**
 * @purpose Link or unlink an email to a seeded demo florist (§2 "The demo")
 * @spec 011
 *
 * `pnpm florists:demo-member add|remove --email <e> --partner <code> [--language en|pl|de]`
 * (spec 011 §2 "The demo", AC-33; TASK-214).
 *
 *  - `add` links the address to a seeded **`demo`** partner: the `users` row is created if it is
 *    missing, then one `partner_member` row (`owner`, the language given or `en`). The person can
 *    then ask for a sign-in link on staging and sees that florist's inbox. A partner of any other
 *    status is refused: a demo member never reaches a real florist's orders.
 *  - `remove` deletes the membership, the person's florist sessions (`florist.…` tokens; an
 *    admin session is not touched), and the `users` row when nothing else holds it (no other
 *    membership, no admin profile or role, no customer account).
 *  - Refuses in `production` before connecting (§2: "Refuses in `production`").
 *
 * One transaction over `DATABASE_URL_UNPOOLED`, `app.role = 'system'` on the `cli` channel. Prints
 * the outcome with ids only, never the address (no PII in output that may be pasted into a log).
 * No personal data is seeded: the founder types the address of the person on the call. Relative
 * imports only: a script runs on Node's type stripping and cannot resolve the `@/` alias.
 */
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

import { appEnvironment } from "../src/lib/env.schema.ts";

export const DemoMemberArgsSchema = z
  .object({
    action: z.enum(["add", "remove"]),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    partner: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/u),
    language: z.enum(["en", "pl", "de"]).default("en"),
  })
  .strict();
export type DemoMemberArgs = z.infer<typeof DemoMemberArgsSchema>;

export function parseDemoMemberArgs(argv: readonly string[]): DemoMemberArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      email: { type: "string" },
      partner: { type: "string" },
      language: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (positionals.length !== 1) {
    throw new Error("one action: add or remove");
  }
  return DemoMemberArgsSchema.parse({ action: positionals[0], ...values });
}

export type DemoMemberOutcome =
  | {
      readonly kind: "added";
      readonly userId: string;
      readonly partnerId: string;
    }
  | {
      readonly kind: "removed";
      readonly userId: string;
      readonly partnerId: string;
      readonly sessions: number;
      readonly userDeleted: boolean;
    }
  | {
      readonly kind: "refused";
      readonly reason: "production" | "not_demo" | "no_partner" | "no_member";
    };

/** Whether the script may run in `environment` at all. */
export function demoMemberAllowedIn(environment: string): boolean {
  return environment !== "production";
}

/** Runs `args` on `sql` in one transaction. */
export async function demoMember(
  sql: postgres.Sql,
  args: DemoMemberArgs,
  environment: string,
): Promise<DemoMemberOutcome> {
  if (!demoMemberAllowedIn(environment)) {
    return { kind: "refused", reason: "production" };
  }
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.role', 'system', true)`;
    await tx`SELECT set_config('app.request_id', 'cli:florists-demo-member', true)`;
    await tx`SELECT set_config('app.audit_channel', 'cli', true)`;
    const [partner] = await tx<{ id: string; status: string }[]>`
      SELECT id, status FROM fulfillment_partner WHERE code = ${args.partner}`;
    if (partner === undefined) {
      return { kind: "refused", reason: "no_partner" } as const;
    }
    if (args.action === "add") {
      if (partner.status !== "demo") {
        return { kind: "refused", reason: "not_demo" } as const;
      }
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO users (email) VALUES (${args.email})
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
        RETURNING id`;
      if (user === undefined)
        throw new Error("florists:demo-member: no user row");
      await tx`
        INSERT INTO partner_member (user_id, partner_id, role, locale_code)
        VALUES (${user.id}, ${partner.id}, 'owner', ${args.language})
        ON CONFLICT (user_id, partner_id) DO UPDATE SET locale_code = EXCLUDED.locale_code`;
      return { kind: "added", userId: user.id, partnerId: partner.id } as const;
    }
    const [user] = await tx<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${args.email}`;
    if (user === undefined) {
      return { kind: "refused", reason: "no_member" } as const;
    }
    const removed = await tx`
      DELETE FROM partner_member WHERE user_id = ${user.id} AND partner_id = ${partner.id}`;
    if (removed.count === 0) {
      return { kind: "refused", reason: "no_member" } as const;
    }
    const sessions = await tx`
      DELETE FROM sessions WHERE user_id = ${user.id} AND session_token LIKE 'florist.%'`;
    const [held] = await tx<{ held: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM partner_member WHERE user_id = ${user.id})
          OR EXISTS (SELECT 1 FROM admin_profile WHERE user_id = ${user.id})
          OR EXISTS (SELECT 1 FROM user_role WHERE user_id = ${user.id})
          OR EXISTS (SELECT 1 FROM customer WHERE user_id = ${user.id}) AS held`;
    const userDeleted = held?.held === false;
    if (userDeleted) {
      await tx`DELETE FROM users WHERE id = ${user.id}`;
    }
    return {
      kind: "removed",
      userId: user.id,
      partnerId: partner.id,
      sessions: sessions.count,
      userDeleted,
    } as const;
  }) as Promise<DemoMemberOutcome>;
}

async function main(): Promise<number> {
  let args: DemoMemberArgs;
  try {
    args = parseDemoMemberArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "usage: pnpm florists:demo-member add|remove --email <address> --partner <demo partner code> [--language en|pl|de]\n",
    );
    return 2;
  }
  const environment = appEnvironment(process.env);
  if (!demoMemberAllowedIn(environment)) {
    process.stderr.write("florists:demo-member: refused in production\n");
    return 1;
  }
  const url = process.env["DATABASE_URL_UNPOOLED"];
  if (url === undefined || url === "") {
    process.stderr.write(
      "florists:demo-member: DATABASE_URL_UNPOOLED is not set\n",
    );
    return 1;
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const outcome = await demoMember(sql, args, environment);
    switch (outcome.kind) {
      case "added":
        process.stdout.write(
          `florists:demo-member: user ${outcome.userId} is a member of partner ${outcome.partnerId}\n`,
        );
        return 0;
      case "removed":
        process.stdout.write(
          `florists:demo-member: user ${outcome.userId} removed from partner ${outcome.partnerId}; ${String(outcome.sessions)} florist session(s) ended; user row ${outcome.userDeleted ? "deleted" : "kept"}\n`,
        );
        return 0;
      case "refused":
        process.stderr.write(
          `florists:demo-member: refused (${outcome.reason})\n`,
        );
        return 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
