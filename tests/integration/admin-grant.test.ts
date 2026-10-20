/**
 * `pnpm admin:grant` (spec 012 §2.2 "Bootstrap and users"; TASK-217): arguments validated, the
 * user, profile and role created or updated on a scratch database, idempotently, and a
 * deactivated person re-activated; the real script run end to end prints no address.
 */
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminGrant, parseAdminGrantArgs } from "../../scripts/admin-grant.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const run = promisify(execFile);
const server = await probeLocalServer();

describe("admin:grant arguments", () => {
  it("normalises and validates", () => {
    expect(
      parseAdminGrantArgs([
        "--email",
        " Founder@Example.test ",
        "--name",
        "Founder Test",
        "--role",
        "admin",
      ]),
    ).toEqual({
      email: "founder@example.test",
      name: "Founder Test",
      role: "admin",
    });
    for (const argv of [
      ["--email", "nope", "--name", "Founder Test", "--role", "admin"],
      ["--email", "a@example.test", "--name", "F", "--role", "admin"],
      [
        "--email",
        "a@example.test",
        "--name",
        "Founder Test",
        "--role",
        "owner",
      ],
      ["--email", "a@example.test", "--name", "Founder Test"],
      [
        "--email",
        "a@example.test",
        "--name",
        "Founder Test",
        "--role",
        "admin",
        "--extra",
        "x",
      ],
    ]) {
      expect(() => parseAdminGrantArgs(argv), argv.join(" ")).toThrow();
    }
  });
});

describe.skipIf(server.url === undefined)(
  `admin:grant on a database${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admingrant");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("creates, is idempotent, and re-activates", async () => {
      const args = {
        email: "founder@example.test",
        name: "Founder Test",
        role: "admin",
      } as const;
      const id = await adminGrant(scratch.sql, args);
      expect(await adminGrant(scratch.sql, args)).toBe(id);
      await scratch.sql`UPDATE admin_profile SET deactivated_at = now() WHERE user_id = ${id}`;
      await adminGrant(scratch.sql, { ...args, role: "ops" });
      const rows = await scratch.sql<
        { roles: string[]; deactivated: boolean; name: string }[]
      >`
        SELECT array_agg(r.role ORDER BY r.role) AS roles,
               (p.deactivated_at IS NOT NULL) AS deactivated, p.display_name AS name
        FROM admin_profile p JOIN user_role r ON r.user_id = p.user_id
        WHERE p.user_id = ${id} GROUP BY p.user_id, p.deactivated_at, p.display_name`;
      expect(rows).toEqual([
        { roles: ["admin", "ops"], deactivated: false, name: "Founder Test" },
      ]);
    });

    it("runs as a script and prints no address", async () => {
      const { stdout } = await run(
        process.execPath,
        [
          resolve(import.meta.dirname, "../../scripts/admin-grant.ts"),
          "--email",
          "second@example.test",
          "--name",
          "Second Test",
          "--role",
          "content",
        ],
        {
          env: { ...process.env, DATABASE_URL_UNPOOLED: scratch.url },
          timeout: 60_000,
        },
      );
      expect(stdout).toMatch(
        /^admin:grant: role content granted to user [0-9a-f-]{36}\n$/u,
      );
      expect(stdout).not.toContain("@");
    });

    it("is audited on the cli channel (spec 012 §2.2, §2.3; TASK-218)", async () => {
      const id = await adminGrant(scratch.sql, {
        email: "third@example.test",
        name: "Third Test",
        role: "finance",
      });
      const rows = await scratch.sql<
        {
          entity_table: string;
          entity_id: string;
          action: string;
          channel: string;
          actor_user_id: string | null;
          actor_label: string;
          request_id: string;
        }[]
      >`
        SELECT entity_table, entity_id, action, channel, actor_user_id, actor_label, request_id
        FROM audit_log WHERE entity_id IN (${id}, ${`${id}:finance`}) ORDER BY at, id`;
      expect(rows).toEqual([
        {
          entity_table: "admin_profile",
          entity_id: id,
          action: "users.grant",
          channel: "cli",
          actor_user_id: null,
          actor_label: "cli:admin-grant",
          request_id: "cli:admin-grant",
        },
        {
          entity_table: "user_role",
          entity_id: `${id}:finance`,
          action: "users.grant",
          channel: "cli",
          actor_user_id: null,
          actor_label: "cli:admin-grant",
          request_id: "cli:admin-grant",
        },
      ]);
    });
  },
);
