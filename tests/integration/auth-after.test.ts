/**
 * The production wiring of the sign-in core's deferred send (spec 012 §2.2, AC-2; TASK-217).
 *
 * Every other case injects `defer`; this one does not, so the core falls back to Next's
 * `after()`. `next/server`'s `after` is replaced by a recorder (the rest of the module is the
 * real one): the request must hand exactly one task to `after()`, nothing may be sent before
 * that task runs, and running it must send the link. If the default stopped calling `after()`,
 * no admin would ever receive a link, and this is the case that goes red.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthRunner } from "../../src/lib/auth/adapter.ts";

import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);

vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      afterTasks.push(task);
    },
  };
});

const { createAdminAuth } = await import("../../src/lib/auth/admin.ts");
const { capturingMailer } =
  await import("../../src/modules/notifications/mailer.ts");

const server = await probeLocalServer();

const ORIGIN = "https://admin.example.test";
const FOUNDER = "after-founder@example.test";

describe.skipIf(server.url === undefined)(
  `the sign-in core's default defer is Next's after()${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AuthRunner;
    const mailer = capturingMailer("Flowers Overseas <sign-in@example.test>");

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "authafter");
      run = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      const id = randomUUID();
      await scratch.sql`INSERT INTO users (id, email) VALUES (${id}, ${FOUNDER})`;
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${id}, 'After Test')`;
      await scratch.sql`INSERT INTO user_role (user_id, role) VALUES (${id}, 'admin')`;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("hands the send to after(), sends nothing before it runs, and the task sends the link", async () => {
      mailer.clear();
      // No `defer` override: the instance uses its production default.
      const auth = createAdminAuth({
        run,
        mailer: () => mailer,
        secret: () => "integration-auth-secret-0123456789abcdef",
        siteOrigin: () => ORIGIN,
      });
      const response = await auth.requestSignIn(
        new Request(`${ORIGIN}/admin/api/auth/request`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            host: "admin.example.test",
            origin: ORIGIN,
          },
          body: new URLSearchParams({ email: FOUNDER }).toString(),
        }),
      );
      expect(response.headers.get("location")).toBe(
        "/admin/sign-in?state=sent",
      );
      expect(afterTasks).toHaveLength(1);
      expect(mailer.messages(FOUNDER)).toHaveLength(0);

      const [task] = afterTasks.splice(0);
      await task?.();
      expect(mailer.messages(FOUNDER)).toHaveLength(1);
      expect(mailer.messages(FOUNDER)[0]?.text).toContain(
        `${ORIGIN}/admin/sign-in/confirm?t=`,
      );
    });
  },
);
