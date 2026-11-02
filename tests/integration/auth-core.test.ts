/**
 * The shared sign-in core, admin instance, against migrated tables (spec 012 §2.2; TASK-217):
 *
 *  - T-03 (AC-2): an allowlisted address gets exactly one message through the core's `Mailer`; an
 *    unknown address, one without a role and a deactivated one get a byte-identical response and
 *    no message; six requests in an hour send five.
 *  - T-11, admin half, at the handler level (AC-9): the emailed link carries no address; `POST`
 *    of the confirm form signs in and lands on `/admin` with the admin session cookie; a second
 *    `POST` of the same token and a token past its hour land on the expired page; no `Location`
 *    in the flow carries the address; a session of someone who is not an admin (a florist's)
 *    authenticates nothing on admin.
 *  - AC-3 (database half): deactivation or the loss of the last role makes the next request
 *    unauthenticated; sign-out deletes the session row and expires the cookie.
 *
 * The core runs exactly as in production except for its runner: each unit of work is one
 * transaction as `app_web` with the system role's session variables (what `withSystemContext`
 * sets), on a scratch database. The mailer is the capturing one; nothing reaches a network.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createAdminAuth,
  resolveAdminSession,
} from "../../src/lib/auth/admin.ts";
import type { AuthRunner } from "../../src/lib/auth/adapter.ts";
import { capturingMailer } from "../../src/modules/notifications/mailer.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const ORIGIN = "https://admin.example.test";
const SECRET = "integration-auth-secret-0123456789abcdef";
const FOUNDER = "founder@example.test";
const NO_ROLE = "no-role@example.test";
const DEACTIVATED = "deactivated@example.test";
const FLORIST = "florist@example.test";
const STRANGER = "stranger@example.test";

function form(fields: Record<string, string>, path: string): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "admin.example.test",
      origin: ORIGIN,
      "x-forwarded-proto": "https",
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()].sort(),
    body: await response.text(),
  };
}

describe.skipIf(server.url === undefined)(
  `the sign-in core, admin instance${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AuthRunner;
    const mailer = capturingMailer("Flowers Overseas <sign-in@example.test>");
    let clock = new Date();
    const ids: Record<string, string> = {};

    /** Tasks the core deferred past the response (Next's `after()` in production). */
    let deferred: Promise<void>[] = [];
    let runDeferred = true;
    const auth = () =>
      createAdminAuth({
        run,
        mailer: () => mailer,
        secret: () => SECRET,
        siteOrigin: () => ORIGIN,
        now: () => clock,
        defer: (task) => {
          if (runDeferred) deferred.push(task());
        },
      });
    /** The same instance with its allowlist replaced (the AC-2 timing case). */
    const authAllowing = (allow: (email: string) => Promise<boolean>) =>
      createAdminAuth({
        run,
        mailer: () => mailer,
        secret: () => SECRET,
        siteOrigin: () => ORIGIN,
        now: () => clock,
        allow,
        defer: (task) => {
          if (runDeferred) deferred.push(task());
        },
      });
    async function flush(): Promise<void> {
      const pending = deferred;
      deferred = [];
      await Promise.all(pending);
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "authcore");
      run = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      for (const email of [FOUNDER, NO_ROLE, DEACTIVATED, FLORIST]) {
        const id = randomUUID();
        ids[email] = id;
        await scratch.sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
      }
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES
        (${ids[FOUNDER] ?? ""}, 'Founder Test'),
        (${ids[NO_ROLE] ?? ""}, 'No Role Test'),
        (${ids[DEACTIVATED] ?? ""}, 'Deactivated Test')`;
      await scratch.sql`UPDATE admin_profile SET deactivated_at = now() WHERE user_id = ${ids[DEACTIVATED] ?? ""}`;
      await scratch.sql`INSERT INTO user_role (user_id, role) VALUES
        (${ids[FOUNDER] ?? ""}, 'admin'), (${ids[DEACTIVATED] ?? ""}, 'admin')`;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    beforeEach(async () => {
      mailer.clear();
      clock = new Date(); // the send log is emptied below, so every case starts a fresh window
      await scratch.sql`DELETE FROM auth_email_send`;
    });

    async function requestLink(email: string): Promise<Response> {
      const response = await auth().requestSignIn(
        form({ email }, "/admin/api/auth/request"),
      );
      await flush();
      return response;
    }

    function tokenOf(link: string): string {
      return new URL(link).searchParams.get("t") ?? "";
    }

    function linkIn(text: string): string {
      const match = /https:\/\/\S+/u.exec(text);
      return match?.[0] ?? "";
    }

    it("T-03: an allowlisted address gets one message; every other address the same bytes and none", async () => {
      const allowed = await snapshot(await requestLink(FOUNDER));
      expect(mailer.messages()).toHaveLength(1);
      expect(mailer.messages(FOUNDER)).toHaveLength(1);
      expect(allowed.status).toBe(303);
      expect(allowed.headers).toContainEqual([
        "location",
        "/admin/sign-in?state=sent",
      ]);
      for (const other of [STRANGER, NO_ROLE, DEACTIVATED, FLORIST]) {
        expect(await snapshot(await requestLink(other)), other).toEqual(
          allowed,
        );
      }
      expect(mailer.messages()).toHaveLength(1);
      const [mail] = mailer.messages();
      expect(mail?.tag).toBe("admin_sign_in");
      expect(mail?.subject).toBe(
        "Your link to sign in to Flowers Overseas admin",
      );
    });

    it("T-03: the address is normalised, so case and spaces do not mint a second allowance", async () => {
      await requestLink(`  ${FOUNDER.toUpperCase()} `);
      expect(mailer.messages(FOUNDER)).toHaveLength(1);
    });

    it("T-03: six requests in an hour send five, and the sixth answers the same bytes", async () => {
      const responses = [];
      for (let i = 0; i < 6; i += 1) {
        responses.push(await snapshot(await requestLink(FOUNDER)));
        clock = new Date(clock.getTime() + 60 * 1000);
      }
      expect(mailer.messages(FOUNDER)).toHaveLength(5);
      expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);
      const [row] = await scratch.sql<{ n: number; plain: number }[]>`
        SELECT count(*)::int AS n,
               count(*) FILTER (WHERE identifier_hash LIKE '%@%')::int AS plain
        FROM auth_email_send`;
      expect(row).toEqual({ n: 5, plain: 0 });
    });

    it("T-03: the window is an hour: a request an hour after the first five sends again", async () => {
      for (let i = 0; i < 6; i += 1) await requestLink(FOUNDER);
      expect(mailer.messages(FOUNDER)).toHaveLength(5);
      clock = new Date(clock.getTime() + 60 * 60 * 1000 + 1000);
      await requestLink(FOUNDER);
      expect(mailer.messages(FOUNDER)).toHaveLength(6);
    });

    it("T-11: the link carries no address; GET-free confirm signs in and lands on /admin with the admin cookie", async () => {
      await requestLink(FOUNDER);
      const [mail] = mailer.messages(FOUNDER);
      const link = linkIn(mail?.text ?? "");
      expect(link).not.toContain("@");
      expect(link).not.toContain("founder");
      expect(new URL(link).pathname).toBe("/admin/sign-in/confirm");
      expect(tokenOf(link)).toMatch(/^[A-Za-z0-9_-]{32,128}$/u);
      expect([...new URL(link).searchParams.keys()]).toEqual(["t"]);

      const response = await auth().confirm(
        form({ t: tokenOf(link) }, "/admin/api/auth/confirm"),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/admin");
      const cookies = response.headers.getSetCookie();
      const session = cookies.find((c) =>
        c.startsWith("__Secure-fo-admin.session-token="),
      );
      expect(session).toBeDefined();
      expect(session).toMatch(/; Path=\/admin(;|$)/u);
      expect(session).toMatch(/; Secure(;|$)/u);
      expect(session).toMatch(/; HttpOnly(;|$)/u);
      expect(session).toMatch(/; SameSite=Lax(;|$)/iu);
      for (const cookie of cookies) {
        expect(cookie).not.toMatch(/^__Host-/u);
        expect(cookie).not.toMatch(/^authjs\./u);
        expect(cookie).not.toContain("@");
        expect(cookie).toMatch(/; Path=\/admin(;|$)/u);
      }
      const token = /^[^=]+=([^;]+)/u.exec(session ?? "")?.[1];
      const resolved = await resolveAdminSession(token, { auth: auth(), run });
      expect(resolved).toEqual({
        userId: ids[FOUNDER],
        displayName: "Founder Test",
        roles: ["admin"],
        timeZone: "Europe/Tallinn",
      });
      // 12-hour session, never extended.
      const [row] = await scratch.sql<{ hours: number }[]>`
        SELECT round(extract(epoch FROM expires - now()) / 3600)::int AS hours
        FROM sessions WHERE session_token = ${token ?? ""}`;
      expect(row?.hours).toBe(12);
    });

    it("§8: no log line of the whole flow carries the token, the link or the address", async () => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          lines.push(String(chunk));
          return true;
        });
      try {
        await requestLink(FOUNDER);
        await requestLink(STRANGER);
        const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
        await auth().confirm(form({ t }, "/admin/api/auth/confirm"));
        await auth().confirm(form({ t }, "/admin/api/auth/confirm"));
        const out = lines.join("");
        expect(lines.length).toBeGreaterThan(0);
        expect(out).not.toContain(t);
        expect(out).not.toContain(FOUNDER);
        expect(out).not.toContain(STRANGER);
        expect(out).not.toMatch(/[?&](?:t|token)=(?!\[REDACTED)/u);
      } finally {
        spy.mockRestore();
      }
    });

    it("T-11: a second POST of the same token lands on the expired page and sets no session", async () => {
      await requestLink(FOUNDER);
      const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
      const first = await auth().confirm(
        form({ t }, "/admin/api/auth/confirm"),
      );
      expect(first.headers.get("location")).toBe("/admin");
      const second = await auth().confirm(
        form({ t }, "/admin/api/auth/confirm"),
      );
      expect(second.status).toBe(303);
      expect(second.headers.get("location")).toBe(
        "/admin/sign-in?state=expired",
      );
      expect(
        second.headers
          .getSetCookie()
          .some((c) => c.startsWith("__Secure-fo-admin.session-token=")),
      ).toBe(false);
    });

    it("T-11: a token older than one hour lands on the expired page", async () => {
      const issuedAt = clock;
      await requestLink(FOUNDER);
      const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
      // The token's expiry was written as `issuedAt + 1 h`; move it into the past instead of
      // waiting, by issuing relative to a clock two hours behind real time.
      await scratch.sql`UPDATE verification_tokens
                        SET expires = now() - interval '1 minute'`;
      expect(issuedAt).toBeInstanceOf(Date);
      const response = await auth().confirm(
        form({ t }, "/admin/api/auth/confirm"),
      );
      expect(response.headers.get("location")).toBe(
        "/admin/sign-in?state=expired",
      );
    });

    it("T-11: a malformed or unknown token lands on the expired page", async () => {
      for (const t of [
        "short",
        "A".repeat(43),
        "has spaces in it and is long enough!!",
      ]) {
        const response = await auth().confirm(
          form({ t }, "/admin/api/auth/confirm"),
        );
        expect(response.headers.get("location"), t).toBe(
          "/admin/sign-in?state=expired",
        );
      }
    });

    it("T-11: an address that lost access between send and click is not signed in", async () => {
      await requestLink(FOUNDER);
      const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
      await scratch.sql`UPDATE admin_profile SET deactivated_at = now() WHERE user_id = ${ids[FOUNDER] ?? ""}`;
      try {
        const response = await auth().confirm(
          form({ t }, "/admin/api/auth/confirm"),
        );
        expect(response.headers.get("location")).toBe(
          "/admin/sign-in?state=expired",
        );
      } finally {
        await scratch.sql`UPDATE admin_profile SET deactivated_at = NULL WHERE user_id = ${ids[FOUNDER] ?? ""}`;
      }
    });

    it("T-11: a cross-origin POST signs nobody in and sends nothing", async () => {
      const hostile = new Request(`${ORIGIN}/admin/api/auth/request`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "admin.example.test",
          origin: "https://evil.example",
        },
        body: new URLSearchParams({ email: FOUNDER }).toString(),
      });
      const response = await auth().requestSignIn(hostile);
      // The deferred send (Next's `after()` in production) runs before the assertion: without
      // `flush()` the case would pass whatever the origin check did.
      await flush();
      expect(response.headers.get("location")).toBe("/admin/sign-in");
      expect(mailer.messages()).toHaveLength(0);
      const [row] = await scratch.sql<{ sends: number }[]>`
        SELECT count(*)::int AS sends FROM auth_email_send`;
      expect(row?.sends).toBe(0);
    });

    it("T-11: a cross-origin POST of the confirm form signs nobody in and leaves the token usable", async () => {
      await requestLink(FOUNDER);
      const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
      expect(t).not.toBe("");
      const sessionsOf = async (): Promise<number> => {
        const [row] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM sessions
          WHERE user_id = ${ids[FOUNDER] ?? ""}`;
        return row?.n ?? -1;
      };
      const before = await sessionsOf();
      const hostile = new Request(`${ORIGIN}/admin/api/auth/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "admin.example.test",
          origin: "https://evil.example",
          "x-forwarded-proto": "https",
        },
        body: new URLSearchParams({ t }).toString(),
      });
      const refused = await auth().confirm(hostile);
      expect(refused.status).toBe(303);
      expect(refused.headers.get("location")).toBe(
        "/admin/sign-in?state=expired",
      );
      expect(refused.headers.getSetCookie()).toEqual([]);
      expect(await sessionsOf()).toBe(before);
      // The token was not spent by the refused request: the person's own click still works.
      const own = await auth().confirm(form({ t }, "/admin/api/auth/confirm"));
      expect(own.headers.get("location")).toBe("/admin");
      expect(await sessionsOf()).toBe(before + 1);
    });

    it("AC-9: a session of someone who is not an admin (a florist's) authenticates nothing on admin", async () => {
      const token = `florist.${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${ids[FLORIST] ?? ""}, now() + interval '30 days')`;
      expect(
        await resolveAdminSession(token, { auth: auth(), run }),
      ).toBeNull();
      expect(
        await resolveAdminSession(undefined, { auth: auth(), run }),
      ).toBeNull();
    });

    it("AC-3: deactivation and the loss of the last role make the next request unauthenticated", async () => {
      const token = `admin.${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${ids[FOUNDER] ?? ""}, now() + interval '1 hour')`;
      expect(
        await resolveAdminSession(token, { auth: auth(), run }),
      ).not.toBeNull();
      await scratch.sql`DELETE FROM user_role WHERE user_id = ${ids[FOUNDER] ?? ""}`;
      try {
        expect(
          await resolveAdminSession(token, { auth: auth(), run }),
        ).toBeNull();
      } finally {
        await scratch.sql`INSERT INTO user_role (user_id, role) VALUES (${ids[FOUNDER] ?? ""}, 'admin')`;
      }
      expect(
        await resolveAdminSession(token, { auth: auth(), run }),
      ).not.toBeNull();
      await scratch.sql`UPDATE admin_profile SET deactivated_at = now() WHERE user_id = ${ids[FOUNDER] ?? ""}`;
      try {
        expect(
          await resolveAdminSession(token, { auth: auth(), run }),
        ).toBeNull();
      } finally {
        await scratch.sql`UPDATE admin_profile SET deactivated_at = NULL WHERE user_id = ${ids[FOUNDER] ?? ""}`;
      }
    });

    it("AC-3: an expired session authenticates nothing", async () => {
      const token = `admin.old-${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${ids[FOUNDER] ?? ""}, now() - interval '1 minute')`;
      expect(
        await resolveAdminSession(token, {
          auth: createAdminAuth({ run, now: () => new Date() }),
          run,
        }),
      ).toBeNull();
    });

    it("sign-out deletes the session row and expires the cookie on /admin", async () => {
      const token = `admin.signout-${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${ids[FOUNDER] ?? ""}, now() + interval '1 hour')`;
      const request = new Request(`${ORIGIN}/admin/api/auth/sign-out`, {
        method: "POST",
        headers: {
          host: "admin.example.test",
          origin: ORIGIN,
          cookie: `__Secure-fo-admin.session-token=${token}`,
        },
      });
      const response = await auth().signOut(request);
      expect(response.headers.get("location")).toBe(
        "/admin/sign-in?state=signed-out",
      );
      expect(response.headers.getSetCookie()).toEqual([
        "__Secure-fo-admin.session-token=; Path=/admin; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
      ]);
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sessions WHERE session_token = ${token}`;
      expect(row?.n).toBe(0);
    });

    it("T-03: the window is a full hour: five sends, then a request at +59 minutes sends nothing", async () => {
      const start = clock;
      for (let i = 0; i < 5; i += 1) await requestLink(FOUNDER);
      expect(mailer.messages(FOUNDER)).toHaveLength(5);
      clock = new Date(start.getTime() + 59 * 60 * 1000);
      await requestLink(FOUNDER);
      expect(mailer.messages(FOUNDER)).toHaveLength(5);
    });

    it("AC-9: the emailed link lives exactly one hour", async () => {
      await requestLink(FOUNDER);
      const [row] = await scratch.sql<{ ms: number }[]>`
        SELECT (extract(epoch FROM expires) * 1000)::bigint::float8 AS ms
        FROM verification_tokens ORDER BY expires DESC LIMIT 1`;
      expect((row?.ms ?? 0) - clock.getTime()).toBe(60 * 60 * 1000);
    });

    it("AC-2: the response does nothing that depends on the address; the work runs after it", async () => {
      runDeferred = false;
      try {
        const allowed = await snapshot(await requestLink(FOUNDER));
        const stranger = await snapshot(await requestLink(STRANGER));
        expect(allowed).toEqual(stranger);
      } finally {
        runDeferred = true;
      }
      expect(mailer.messages()).toHaveLength(0);
      const [row] = await scratch.sql<{ sends: number; tokens: number }[]>`
        SELECT (SELECT count(*)::int FROM auth_email_send) AS sends,
               (SELECT count(*)::int FROM verification_tokens
                WHERE identifier = ${FOUNDER} AND expires > now()) AS tokens`;
      expect(row?.sends).toBe(0);
    });

    it("AC-2: the allowlist is not consulted before the response, so its time is not in the answer", async () => {
      // An allowlist that takes a second and says yes: had the core awaited it before answering,
      // the answer would take at least that long and the call would be counted by then.
      const ALLOW_MS = 1000;
      let calls = 0;
      const slowAllow = async (): Promise<boolean> => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, ALLOW_MS));
        return true;
      };
      runDeferred = false;
      try {
        const started = performance.now();
        const response = await authAllowing(slowAllow).requestSignIn(
          form({ email: FOUNDER }, "/admin/api/auth/request"),
        );
        const elapsed = performance.now() - started;
        expect(calls).toBe(0);
        expect(elapsed).toBeLessThan(ALLOW_MS);
        expect(await snapshot(response)).toEqual(
          await snapshot(await requestLink(STRANGER)),
        );
      } finally {
        runDeferred = true;
      }
      expect(calls).toBe(0);
    });

    it("AC-2: twenty concurrent requests for one address send exactly five links", async () => {
      // A pool as wide as the burst, so the twenty deferred sends really run side by side (the
      // suite's own pool has four connections), each in its own transaction as in production.
      const wide = postgres(scratch.url, {
        max: 20,
        onnotice: () => undefined,
      });
      const wideRun: AuthRunner = (fn) =>
        wide.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, wide));
        }) as never;
      const burst = createAdminAuth({
        run: wideRun,
        mailer: () => mailer,
        secret: () => SECRET,
        siteOrigin: () => ORIGIN,
        now: () => clock,
        defer: (task) => {
          deferred.push(task());
        },
      });
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          burst.requestSignIn(
            form({ email: FOUNDER }, "/admin/api/auth/request"),
          ),
        ),
      );
      // Every deferred send runs at once, as twenty `after()` tasks would.
      try {
        await flush();
      } finally {
        await wide.end({ timeout: 5 });
      }
      expect(responses.every((r) => r.status === 303)).toBe(true);
      expect(mailer.messages(FOUNDER)).toHaveLength(5);
      const [row] = await scratch.sql<{ sends: number }[]>`
        SELECT count(*)::int AS sends FROM auth_email_send`;
      expect(row?.sends).toBe(5);
    });

    it("every Auth.js endpoint under /admin/api/auth answers the same empty 404, whoever asks", async () => {
      const route =
        await import("../../src/app/admin/api/auth/[...nextauth]/route.ts");
      await requestLink(FOUNDER);
      const t = tokenOf(linkIn(mailer.messages(FOUNDER)[0]?.text ?? ""));
      const actions = [
        "signin",
        "signin/email",
        "signout",
        "session",
        "csrf",
        "providers",
        "callback/email",
        "verify-request",
        "error",
        "webauthn-options/email",
      ];
      const answers: unknown[] = [];
      for (const action of actions) {
        for (const [method, handler] of Object.entries(route)) {
          if (typeof handler !== "function") continue;
          for (const email of [FOUNDER, STRANGER]) {
            const query = action === "callback/email" ? `?token=${t}` : "";
            const init: RequestInit = {
              method,
              headers: {
                host: "admin.example.test",
                origin: ORIGIN,
                "content-type": "application/x-www-form-urlencoded",
              },
              ...(method === "GET"
                ? {}
                : {
                    body: new URLSearchParams({
                      email,
                      csrfToken: "x",
                    }).toString(),
                  }),
            };
            const response = await (
              handler as (r: Request) => Response | Promise<Response>
            )(new Request(`${ORIGIN}/admin/api/auth/${action}${query}`, init));
            answers.push(await snapshot(response));
          }
        }
      }
      expect(answers.length).toBeGreaterThanOrEqual(actions.length * 2 * 2);
      const [first] = answers;
      expect(first).toEqual({
        status: 404,
        headers: [
          ["cache-control", "no-store, private"],
          ["x-robots-tag", "noindex, nofollow"],
        ],
        body: "",
      });
      for (const answer of answers) expect(answer).toEqual(first);
      expect(mailer.messages(FOUNDER)).toHaveLength(1);
      expect(mailer.messages(STRANGER)).toHaveLength(0);
      // The GET of the callback used nothing up: the token still signs in through the core.
      const confirmed = await auth().confirm(
        form({ t }, "/admin/api/auth/confirm"),
      );
      expect(confirmed.headers.get("location")).toBe("/admin");
    });

    it("B4: a malformed session cookie is no session, never an exception", async () => {
      const request = new Request(`${ORIGIN}/admin/api/auth/sign-out`, {
        method: "POST",
        headers: {
          host: "admin.example.test",
          origin: ORIGIN,
          cookie: "__Secure-fo-admin.session-token=%E0%A4%A",
        },
      });
      const response = await auth().signOut(request);
      expect(response.headers.get("location")).toBe(
        "/admin/sign-in?state=signed-out",
      );
    });
  },
);
