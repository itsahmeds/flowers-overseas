/**
 * The florist instance of the sign-in core against migrated tables (spec 011 §2 "Florist
 * sign-in", AC-18, AC-19, AC-20, AC-32; spec 012 AC-9, florist-route half; TASK-212).
 *
 *  - T-18: five environments × five partner statuses × member and non-member: the response is
 *    byte-identical for every address, and an email is captured only where `signInPolicy` allows
 *    (a `demo` partner's member outside production). Production captures none.
 *  - T-19 at the handler level (the e2e half needs a database the CI preview does not have, the
 *    precedent of spec 012's T-11): the link carries no address and only `t`; the confirm `POST`
 *    signs in and lands on the inbox with `__Secure-fo-florist.session-token`, `Path=` the base,
 *    `Secure`, `HttpOnly`, `SameSite=Lax`, no `__Host-` cookie; a second `POST` and a token past
 *    its hour land on the expired page; no `Location` carries the address; a florist session
 *    authenticates nothing on admin, and an admin session nothing on the florist surface, even for
 *    a person who is both.
 *  - T-20: memberships are read on every request: deleting the membership, or the partner leaving
 *    the policy's statuses, ends access on the next request; no session is no context.
 *  - T-32: the email in the member's `locale_code`; the language form stores it and the next
 *    request reads it; `?hl=` rides along to the next page.
 *  - Rolling sessions: a used session is pushed back to 30 days; admin's is never extended.
 *
 * The core runs as in production except for its runner (one `app_web` transaction with the system
 * role's variables, on a scratch database) and the capturing mailer.
 */
import { randomUUID } from "node:crypto";

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
import {
  confirmFloristSignIn,
  createFloristAuth,
  requestFloristSignIn,
  resolveFloristContext,
  setFloristLanguage,
  toDbContext,
} from "../../src/lib/auth/florist.ts";
import { capturingMailer } from "../../src/modules/notifications/mailer.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const ORIGIN = "https://staging.example.test";
const SECRET = "placeholder-florist-auth-secret-0123456789abcdef";
const BASE = "/demo/vendor-inbox";
const STATUSES = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;
const ENVIRONMENTS = [
  "development",
  "test",
  "preview",
  "staging",
  "production",
] as const;
const MEMBER = (status: string) => `member-${status}@example.test`;
const STRANGER = "stranger@example.test";
const DUAL = "founder-and-florist@example.test";

function form(
  fields: Record<string, string>,
  path: string,
  cookie?: string,
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "staging.example.test",
      origin: ORIGIN,
      "x-forwarded-proto": "https",
      ...(cookie === undefined ? {} : { cookie }),
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

function linkIn(text: string): string {
  return /https:\/\/\S+?(?=\.?\s|$)/u.exec(text)?.[0] ?? "";
}

describe.skipIf(server.url === undefined)(
  `the sign-in core, florist instance${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AuthRunner;
    const mailer = capturingMailer("Flowers Overseas <sign-in@example.test>");
    let clock = new Date();
    const ids: Record<string, string> = {};
    const partners: Record<string, string> = {};
    let deferred: Promise<void>[] = [];

    const florist = (environment = "staging") =>
      createFloristAuth({
        run,
        environment,
        mailer: () => mailer,
        secret: () => SECRET,
        siteOrigin: () => ORIGIN,
        now: () => clock,
        defer: (task) => {
          deferred.push(task());
        },
      });
    const admin = () =>
      createAdminAuth({
        run,
        mailer: () => mailer,
        secret: () => SECRET,
        siteOrigin: () => ORIGIN,
        now: () => clock,
        defer: (task) => {
          deferred.push(task());
        },
      });
    async function flush(): Promise<void> {
      const pending = deferred;
      deferred = [];
      await Promise.all(pending);
    }
    async function request(
      email: string,
      environment = "staging",
      hl?: string,
    ): Promise<Response> {
      const response = await requestFloristSignIn(
        form(
          { email, ...(hl === undefined ? {} : { hl }) },
          `${BASE}/api/auth/request`,
        ),
        florist(environment),
      );
      await flush();
      return response;
    }
    const tokenOf = (link: string): string =>
      new URL(link).searchParams.get("t") ?? "";
    async function signIn(email: string): Promise<string> {
      await request(email);
      const link = linkIn(mailer.messages(email).at(-1)?.text ?? "");
      const response = await confirmFloristSignIn(
        form({ t: tokenOf(link) }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      expect(response.headers.get("location")).toBe(BASE);
      const cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith("__Secure-fo-florist.session-token="));
      return /^[^=]+=([^;]+)/u.exec(cookie ?? "")?.[1] ?? "";
    }
    const context = (token: string | undefined, environment = "staging") =>
      resolveFloristContext(token, {
        auth: florist(environment),
        run,
        environment,
      });

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "floristauth");
      run = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      await scratch.sql.begin(async (tx) => {
        await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
                 ON CONFLICT DO NOTHING`;
        const countryId = await make.country(tx);
        for (const status of STATUSES) {
          partners[status] = await make.partner(tx, countryId, status);
        }
        for (const email of [...STATUSES.map(MEMBER), STRANGER, DUAL]) {
          const id = randomUUID();
          ids[email] = id;
          await tx`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
        }
        for (const status of STATUSES) {
          await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
                   VALUES (${ids[MEMBER(status)] ?? ""}, ${partners[status] ?? ""}, 'owner',
                           ${status === "demo" ? "pl" : "en"})`;
        }
        await tx`INSERT INTO partner_member (user_id, partner_id, role)
                 VALUES (${ids[DUAL] ?? ""}, ${partners["demo"] ?? ""}, 'staff')`;
        await tx`INSERT INTO admin_profile (user_id, display_name)
                 VALUES (${ids[DUAL] ?? ""}, 'Founder Florist')`;
        await tx`INSERT INTO user_role (user_id, role) VALUES (${ids[DUAL] ?? ""}, 'admin')`;
      });
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    beforeEach(async () => {
      mailer.clear();
      clock = new Date();
      await scratch.sql`DELETE FROM auth_email_send`;
    });

    it("T-18: 5 environments × 5 statuses × member or not: one response for all, a link only to a demo member outside production", async () => {
      for (const environment of ENVIRONMENTS) {
        mailer.clear();
        await scratch.sql`DELETE FROM auth_email_send`;
        const responses = [];
        for (const email of [...STATUSES.map(MEMBER), STRANGER]) {
          responses.push(await snapshot(await request(email, environment)));
        }
        expect(
          new Set(responses.map((r) => JSON.stringify(r))).size,
          environment,
        ).toBe(1);
        expect(responses[0]?.status).toBe(303);
        expect(responses[0]?.headers).toContainEqual([
          "location",
          `${BASE}/sign-in?state=sent`,
        ]);
        const sentTo = mailer.messages().map((message) => message.to);
        expect(sentTo, environment).toEqual(
          environment === "production" ? [] : [MEMBER("demo")],
        );
      }
    });

    it("T-19: the link has no address and only t; confirm signs in to the inbox with the florist cookie", async () => {
      await request(MEMBER("demo"));
      const [mail] = mailer.messages(MEMBER("demo"));
      expect(mail?.tag).toBe("florist_sign_in");
      const link = linkIn(mail?.text ?? "");
      expect(link).not.toContain("@");
      expect(link).not.toContain("member");
      expect(new URL(link).pathname).toBe(`${BASE}/sign-in/confirm`);
      expect([...new URL(link).searchParams.keys()]).toEqual(["t"]);
      expect(tokenOf(link)).toMatch(/^[A-Za-z0-9_-]{32,128}$/u);

      const response = await confirmFloristSignIn(
        form({ t: tokenOf(link), hl: "pl" }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(BASE);
      const cookies = response.headers.getSetCookie();
      const session = cookies.find((c) =>
        c.startsWith("__Secure-fo-florist.session-token="),
      );
      expect(session).toMatch(/^__Secure-fo-florist\.session-token=florist\./u);
      expect(session).toMatch(/; Path=\/demo\/vendor-inbox(;|$)/u);
      expect(session).toMatch(/; Secure(;|$)/u);
      expect(session).toMatch(/; HttpOnly(;|$)/u);
      expect(session).toMatch(/; SameSite=Lax(;|$)/iu);
      for (const cookie of cookies) {
        expect(cookie).not.toMatch(/^__Host-/u);
        expect(cookie).not.toMatch(/^authjs\./u);
        expect(cookie).not.toContain("@");
        expect(cookie).toMatch(/; Path=\/demo\/vendor-inbox(;|$)/u);
      }
      const token = /^[^=]+=([^;]+)/u.exec(session ?? "")?.[1];
      expect(await context(token)).toEqual({
        userId: ids[MEMBER("demo")],
        locale: "pl",
        memberships: [
          {
            partnerId: partners["demo"],
            role: "owner",
            partnerStatus: "demo",
            displayName: expect.stringMatching(/^florist-/u),
          },
        ],
      });
      const [row] = await scratch.sql<{ days: number }[]>`
        SELECT round(extract(epoch FROM expires - now()) / 86400)::int AS days
        FROM sessions WHERE session_token = ${token ?? ""}`;
      expect(row?.days).toBe(30);
    });

    it("T-19: a second POST of the token, and a token past its hour, land on the expired page in the page's language", async () => {
      await request(MEMBER("demo"));
      const t = tokenOf(linkIn(mailer.messages(MEMBER("demo"))[0]?.text ?? ""));
      const first = await confirmFloristSignIn(
        form({ t }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      expect(first.headers.get("location")).toBe(BASE);
      const second = await confirmFloristSignIn(
        form({ t, hl: "de" }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      expect(second.headers.get("location")).toBe(
        `${BASE}/sign-in?state=expired&hl=de`,
      );
      expect(
        second.headers
          .getSetCookie()
          .some((c) => c.startsWith("__Secure-fo-florist.session-token=")),
      ).toBe(false);

      mailer.clear();
      await request(MEMBER("demo"));
      const late = tokenOf(
        linkIn(mailer.messages(MEMBER("demo"))[0]?.text ?? ""),
      );
      await scratch.sql`UPDATE verification_tokens SET expires = now() - interval '1 second'`;
      const aged = await confirmFloristSignIn(
        form({ t: late }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      expect(aged.headers.get("location")).toBe(
        `${BASE}/sign-in?state=expired`,
      );
    });

    it("T-19: no Location in the flow carries the address; a forged extra field is not passed on", async () => {
      const locations: string[] = [];
      const sent = await request(MEMBER("demo"), "staging", "pl");
      locations.push(sent.headers.get("location") ?? "");
      expect(sent.headers.get("location")).toBe(
        `${BASE}/sign-in?state=sent&hl=pl`,
      );
      const forged = await requestFloristSignIn(
        form(
          {
            email: MEMBER("demo"),
            hl: "pl",
            callbackUrl: "https://evil.example",
          },
          `${BASE}/api/auth/request`,
        ),
        florist(),
      );
      await flush();
      locations.push(forged.headers.get("location") ?? "");
      // A form the schema refuses is no address: the core answers the plain sign-in page.
      expect(forged.headers.get("location")).toBe(`${BASE}/sign-in`);
      const t = tokenOf(linkIn(mailer.messages(MEMBER("demo"))[0]?.text ?? ""));
      const confirmed = await confirmFloristSignIn(
        form({ t }, `${BASE}/api/auth/confirm`),
        florist(),
      );
      locations.push(confirmed.headers.get("location") ?? "");
      for (const location of locations) {
        expect(location).not.toContain("@");
        expect(location).not.toContain("member");
      }
      expect(mailer.messages(MEMBER("demo"))).toHaveLength(1);
    });

    it("spec 012 AC-9 (florist half) and the reverse: one surface's session authenticates nothing on the other, even for a person who is both", async () => {
      const floristToken = await signIn(DUAL);
      expect(await context(floristToken)).not.toBeNull();
      expect(
        await resolveAdminSession(floristToken, { auth: admin(), run }),
      ).toBeNull();
      const adminToken = `admin.${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${adminToken}, ${ids[DUAL] ?? ""}, now() + interval '1 hour')`;
      expect(
        await resolveAdminSession(adminToken, { auth: admin(), run }),
      ).not.toBeNull();
      expect(await context(adminToken)).toBeNull();
      // A legacy, unprefixed token (minted before surface binding) is nobody's.
      const legacy = randomUUID();
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${legacy}, ${ids[DUAL] ?? ""}, now() + interval '1 hour')`;
      expect(await context(legacy)).toBeNull();
      expect(
        await resolveAdminSession(legacy, { auth: admin(), run }),
      ).toBeNull();
    });

    it("T-20: memberships are read on every request; deletion, or the partner leaving the policy, ends access", async () => {
      const token = await signIn(MEMBER("demo"));
      expect(await context(token)).not.toBeNull();
      expect(await context(undefined)).toBeNull();
      expect(await context("")).toBeNull();
      expect(await context(token, "production")).toBeNull();

      // A status flip is an admin act (`0016`'s `status_flip_guard`), so it is made as one.
      const flip = (status: string) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.role', 'admin', true)`;
          await tx`SELECT set_config('app.audit_action', 'partner.status_changed', true)`;
          await tx`UPDATE fulfillment_partner SET status = ${status}
                   WHERE id = ${partners["demo"] ?? ""}`;
        });
      await flip("paused");
      try {
        expect(await context(token)).toBeNull();
      } finally {
        await flip("demo");
      }
      expect(await context(token)).not.toBeNull();

      await scratch.sql`DELETE FROM partner_member WHERE user_id = ${ids[MEMBER("demo")] ?? ""}`;
      try {
        expect(await context(token)).toBeNull();
      } finally {
        await scratch.sql`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
                          VALUES (${ids[MEMBER("demo")] ?? ""}, ${partners["demo"] ?? ""}, 'owner', 'pl')`;
      }
    });

    it("T-20: the database context is the partner role with exactly the member's partners", async () => {
      const token = await signIn(MEMBER("demo"));
      const resolved = await context(token);
      expect(resolved).not.toBeNull();
      if (resolved === null) return;
      expect(toDbContext(resolved, "req-1")).toEqual({
        role: "partner",
        userId: ids[MEMBER("demo")],
        partnerIds: [partners["demo"]],
        requestId: "req-1",
      });
    });

    it("T-32: the email is in the member's language; the language form stores a new one and the next request reads it", async () => {
      await request(MEMBER("demo"));
      expect(mailer.messages(MEMBER("demo"))[0]?.subject).toBe(
        "Twój link do logowania w Flowers Overseas",
      );
      const token = await signIn(MEMBER("demo"));
      const cookie = `__Secure-fo-florist.session-token=${token}`;
      const changed = await setFloristLanguage(
        form(
          { locale: "de", back: `${BASE}/orders/x` },
          `${BASE}/api/language`,
          cookie,
        ),
        { auth: florist(), run, environment: "staging" },
      );
      expect(changed.status).toBe(303);
      expect(changed.headers.get("location")).toBe(`${BASE}/orders/x`);
      expect((await context(token))?.locale).toBe("de");
      mailer.clear();
      await scratch.sql`DELETE FROM auth_email_send`;
      await request(MEMBER("demo"));
      expect(mailer.messages(MEMBER("demo"))[0]?.subject).toBe(
        "Ihr Anmeldelink für Flowers Overseas",
      );

      // No session: nothing is stored, and the answer is the sign-in page.
      const anonymous = await setFloristLanguage(
        form({ locale: "en" }, `${BASE}/api/language`),
        { auth: florist(), run, environment: "staging" },
      );
      expect(anonymous.headers.get("location")).toBe(`${BASE}/sign-in`);
      expect((await context(token))?.locale).toBe("de");
      // A cross-origin post changes nothing.
      const hostile = new Request(`${ORIGIN}${BASE}/api/language`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "staging.example.test",
          origin: "https://evil.example",
          cookie,
        },
        body: new URLSearchParams({ locale: "en" }).toString(),
      });
      await setFloristLanguage(hostile, {
        auth: florist(),
        run,
        environment: "staging",
      });
      expect((await context(token))?.locale).toBe("de");
      await scratch.sql`UPDATE partner_member SET locale_code = 'pl' WHERE user_id = ${ids[MEMBER("demo")] ?? ""}`;
    });

    it("rolling: a used florist session is pushed back to 30 days; an admin session is never extended", async () => {
      const token = await signIn(MEMBER("demo"));
      await scratch.sql`UPDATE sessions SET expires = now() + interval '10 days'
                        WHERE session_token = ${token}`;
      expect(await context(token)).not.toBeNull();
      const [rolled] = await scratch.sql<{ days: number }[]>`
        SELECT round(extract(epoch FROM expires - now()) / 86400)::int AS days
        FROM sessions WHERE session_token = ${token}`;
      expect(rolled?.days).toBe(30);

      const adminToken = `admin.${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${adminToken}, ${ids[DUAL] ?? ""}, now() + interval '2 hours')`;
      await resolveAdminSession(adminToken, { auth: admin(), run });
      const [kept] = await scratch.sql<{ hours: number }[]>`
        SELECT round(extract(epoch FROM expires - now()) / 3600)::int AS hours
        FROM sessions WHERE session_token = ${adminToken}`;
      expect(kept?.hours).toBe(2);
    });

    it("§8: no log line of the flow carries the token, the link or the address", async () => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          lines.push(String(chunk));
          return true;
        });
      try {
        await request(MEMBER("demo"));
        await request(STRANGER);
        const t = tokenOf(
          linkIn(mailer.messages(MEMBER("demo"))[0]?.text ?? ""),
        );
        await confirmFloristSignIn(
          form({ t }, `${BASE}/api/auth/confirm`),
          florist(),
        );
        await confirmFloristSignIn(
          form({ t }, `${BASE}/api/auth/confirm`),
          florist(),
        );
        const out = lines.join("");
        expect(lines.length).toBeGreaterThan(0);
        expect(out).not.toContain(t);
        expect(out).not.toContain(MEMBER("demo"));
        expect(out).not.toContain(STRANGER);
      } finally {
        spy.mockRestore();
      }
    });
  },
);
