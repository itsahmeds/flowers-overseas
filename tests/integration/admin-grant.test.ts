/**
 * `pnpm admin:grant` (spec 012 §2.2 "Bootstrap and users"; TASK-217): arguments validated, the
 * user, profile and role created or updated on a scratch database, idempotently, and a
 * deactivated person re-activated; the real script run end to end prints no address.
 *
 * T-11's grant half (spec 012b AC-11; TASK-293): `--locale` adds a `reviewer_locale` row and
 * `--revoke-locale` removes it, alone or with a grant, and neither ends a session.
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

  it("takes --locale and --revoke-locale, repeated, with a grant or alone (spec 012b AC-11)", () => {
    expect(
      parseAdminGrantArgs([
        "--email",
        "native@example.test",
        "--locale",
        "PL",
        "--locale",
        "en-gb",
        "--revoke-locale",
        "de",
      ]),
    ).toEqual({
      email: "native@example.test",
      locales: ["pl", "en-gb"],
      revokeLocales: ["de"],
    });
    expect(
      parseAdminGrantArgs([
        "--email",
        "native@example.test",
        "--name",
        "Native Test",
        "--role",
        "content",
        "--locale",
        "pl",
      ]),
    ).toEqual({
      email: "native@example.test",
      name: "Native Test",
      role: "content",
      locales: ["pl"],
    });
    for (const argv of [
      ["--email", "a@example.test"],
      ["--email", "a@example.test", "--locale", "polish"],
      ["--email", "a@example.test", "--role", "content", "--locale", "pl"],
      ["--email", "a@example.test", "--revoke-locale", ""],
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

    it("--locale grants and --revoke-locale removes a review locale, and no session ends (spec 012b AC-11)", async () => {
      await scratch.sql`INSERT INTO locale (code, bcp47, name) VALUES
                          ('pl', 'pl-PL', 'Polski'), ('de', 'de-DE', 'Deutsch')
                        ON CONFLICT DO NOTHING`;
      const id = await adminGrant(scratch.sql, {
        email: "native@example.test",
        name: "Native Test",
        role: "content",
        locales: ["pl"],
      });
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${`s-${id}`}, ${id}, now() + interval '1 day')`;
      const locales = async () =>
        (
          await scratch.sql<{ locale_code: string }[]>`
            SELECT locale_code FROM reviewer_locale WHERE user_id = ${id} ORDER BY locale_code`
        ).map((row) => row.locale_code);
      const sessions = async () =>
        (
          await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM sessions WHERE user_id = ${id}`
        )[0]?.n;
      expect(await locales()).toEqual(["pl"]);

      expect(
        await adminGrant(scratch.sql, {
          email: "native@example.test",
          locales: ["de", "pl"],
        }),
      ).toBe(id);
      expect(await locales()).toEqual(["de", "pl"]);
      expect(await sessions()).toBe(1);

      await adminGrant(scratch.sql, {
        email: "native@example.test",
        revokeLocales: ["pl"],
      });
      expect(await locales()).toEqual(["de"]);
      expect(await sessions()).toBe(1);

      await expect(
        adminGrant(scratch.sql, {
          email: "nobody@example.test",
          locales: ["pl"],
        }),
      ).rejects.toThrow(/no such user/u);
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
