/**
 * The sign-in core's additive extension, against migrated tables (spec 018 §14 A-founder-2026-10-22
 * C.3, C.4, C.10, AC-47 core half, T-47 core half; TASK-351). A buyer-shaped surface (C.3's
 * configuration; `src/lib/auth/buyer.ts` itself is TASK-344's) runs on the real core beside the
 * real admin and florist instances:
 *
 *  - the link is in the page's locale (`pagesFor`, `renderEmail(link, email, { locale })`) and
 *    carries only `t`; confirm lands on that locale's home with `Path=/` cookies, 30 days rolling;
 *  - the return path stored at request time is where confirm lands; a hostile cookie lands home;
 *  - `afterSignIn(userId, email)` runs once per successful confirm, and when it throws the confirm
 *    commits nothing (no session, no cookie, the link still usable);
 *  - `signOutEverywhere(userId)` deletes every `sessions` row of the user and nobody else's;
 *  - buyer, admin and florist sessions authenticate nothing on each other's surface.
 *
 * Each unit of work is one transaction as `app_web` with the system role's session variables
 * (what `withSystemContext` sets), on a scratch database; the mailer is the capturing one.
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
  createFloristAuth,
  resolveFloristContext,
} from "../../src/lib/auth/florist.ts";
import type { AuthSurfaceConfig } from "../../src/lib/auth/schema.ts";
import { createAuthSurface } from "../../src/lib/auth/surface.ts";
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

const ORIGIN = "https://www.example.test";
const SECRET = "integration-auth-secret-0123456789abcdef";
const BUYER_EMAIL = "anna+gifts@example.test";
const OTHER = "other-buyer@example.test";
/** An admin, a florist member and a buyer at once. */
const DUAL = "founder-florist-buyer@example.test";
const DAY_MS = 24 * 60 * 60 * 1000;

const LOCALES = ["en", "en-gb", "de", "pl"];
const buyerReturnTo = (path: string): boolean => {
  const [, locale, ...rest] = path.split("/");
  if (!LOCALES.includes(locale ?? "")) return false;
  return rest[0] === "account" || (rest[0] === "checkout" && rest.length === 1);
};

function form(
  fields: Record<string, string>,
  path: string,
  cookie?: string,
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "www.example.test",
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

const tokenOf = (link: string): string =>
  new URL(link).searchParams.get("t") ?? "";

function cookieValue(response: Response, name: string): string | undefined {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`));
  return cookie === undefined ? undefined : /^[^=]+=([^;]*)/u.exec(cookie)?.[1];
}

describe.skipIf(server.url === undefined)(
  `the sign-in core's buyer extension${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AuthRunner;
    const mailer = capturingMailer("Flowers Overseas <sign-in@example.test>");
    let clock = new Date();
    const ids: Record<string, string> = {};
    let deferred: Promise<void>[] = [];
    const rendered: { link: string; locale: string | undefined }[] = [];
    let hook: (userId: string, email: string) => Promise<void> = () =>
      Promise.resolve();

    const deps = () => ({
      run,
      mailer: () => mailer,
      secret: () => SECRET,
      siteOrigin: () => ORIGIN,
      now: () => clock,
      defer: (task: () => Promise<void>) => {
        deferred.push(task());
      },
    });

    const BUYER: AuthSurfaceConfig = {
      name: "buyer",
      basePath: "/api/auth/buyer",
      cookiePath: "/",
      cookiePrefix: "__Secure-fo-buyer",
      sessionMaxAgeSeconds: 30 * 24 * 60 * 60,
      rolling: true,
      pages: {
        signIn: "/en/account",
        confirm: "/en/account/sign-in/confirm",
        home: "/en/account",
      },
      pagesFor: (locale) => ({
        signIn: `/${locale}/account`,
        confirm: `/${locale}/account/sign-in/confirm`,
        home: `/${locale}/account`,
      }),
      mailTag: "buyer_sign_in",
      allow: (email) => Promise.resolve(!/[@.]invalid$/u.test(email)),
      returnTo: buyerReturnTo,
      afterSignIn: (userId, email) => hook(userId, email),
    };

    const buyer = () =>
      createAuthSurface(BUYER, {
        ...deps(),
        renderEmail: (link, _email, context) => {
          rendered.push({ link, locale: context?.locale });
          return { subject: "Sign in", text: `Open ${link}`, html: link };
        },
      });
    const admin = () => createAdminAuth(deps());
    const florist = () =>
      createFloristAuth({ ...deps(), environment: "staging" });

    async function flush(): Promise<void> {
      const pending = deferred;
      deferred = [];
      await Promise.all(pending);
    }

    /** Requests a buyer link in `locale`; answers the response and the emailed token. */
    async function requestBuyer(
      email: string,
      locale = "de",
      returnTo?: string,
    ): Promise<{ response: Response; token: string }> {
      const response = await buyer().requestSignIn(
        form({ email }, "/api/auth/buyer/request"),
        { locale, ...(returnTo === undefined ? {} : { returnTo }) },
      );
      await flush();
      const text = mailer.messages(email.trim().toLowerCase()).at(-1)?.text;
      return { response, token: tokenOf(linkIn(text ?? "")) };
    }

    async function confirmBuyer(
      token: string,
      locale = "de",
      cookie?: string,
    ): Promise<Response> {
      return buyer().confirm(
        form({ t: token }, "/api/auth/buyer/confirm", cookie),
        { locale },
      );
    }

    async function buyerSession(email: string, locale = "de"): Promise<string> {
      const { token } = await requestBuyer(email, locale);
      const response = await confirmBuyer(token, locale);
      expect(response.headers.get("location")).toBe(`/${locale}/account`);
      return cookieValue(response, "__Secure-fo-buyer.session-token") ?? "";
    }

    async function adminSession(email: string): Promise<string> {
      await admin().requestSignIn(form({ email }, "/admin/api/auth/request"));
      await flush();
      const t = tokenOf(linkIn(mailer.messages(email).at(-1)?.text ?? ""));
      const response = await admin().confirm(
        form({ t }, "/admin/api/auth/confirm"),
      );
      expect(response.headers.get("location")).toBe("/admin");
      return cookieValue(response, "__Secure-fo-admin.session-token") ?? "";
    }

    async function floristSession(email: string): Promise<string> {
      const surface = florist();
      await surface.requestSignIn(form({ email }, "/vendor/api/auth/request"));
      await flush();
      const t = tokenOf(linkIn(mailer.messages(email).at(-1)?.text ?? ""));
      const response = await surface.confirm(
        form({ t }, "/vendor/api/auth/confirm"),
      );
      expect(response.headers.get("location")).toBe("/vendor");
      return cookieValue(response, "__Secure-fo-florist.session-token") ?? "";
    }

    const sessionCount = async (userId: string): Promise<number> => {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sessions WHERE user_id = ${userId}`;
      return row?.n ?? -1;
    };
    const userIdOf = async (email: string): Promise<string> => {
      const [row] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${email}`;
      return row?.id ?? "";
    };

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "authext");
      run = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      await scratch.sql.begin(async (tx) => {
        const countryId = await make.country(tx);
        const partnerId = await make.partner(tx, countryId, "demo");
        const id = randomUUID();
        ids[DUAL] = id;
        await tx`INSERT INTO users (id, email) VALUES (${id}, ${DUAL})`;
        await tx`INSERT INTO partner_member (user_id, partner_id, role)
                 VALUES (${id}, ${partnerId}, 'owner')`;
        await tx`INSERT INTO admin_profile (user_id, display_name)
                 VALUES (${id}, 'Founder Florist')`;
        await tx`INSERT INTO user_role (user_id, role) VALUES (${id}, 'admin')`;
      });
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    beforeEach(async () => {
      mailer.clear();
      rendered.length = 0;
      clock = new Date();
      hook = () => Promise.resolve();
      await scratch.sql`DELETE FROM auth_email_send`;
    });

    it("T-47: the link is in the page's locale and carries only t; confirm lands on the locale's home with Path=/ cookies", async () => {
      const { response, token } = await requestBuyer(BUYER_EMAIL, "pl");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/pl/account?state=sent");
      const [mail] = mailer.messages(BUYER_EMAIL);
      expect(mail?.tag).toBe("buyer_sign_in");
      expect(rendered).toHaveLength(1);
      expect(rendered[0]?.locale).toBe("pl");
      const link = linkIn(mail?.text ?? "");
      expect(new URL(link).pathname).toBe("/pl/account/sign-in/confirm");
      expect([...new URL(link).searchParams.keys()]).toEqual(["t"]);
      expect(link).not.toContain("@");
      expect(link).not.toContain("anna");

      const confirmed = await confirmBuyer(token, "pl");
      expect(confirmed.status).toBe(303);
      expect(confirmed.headers.get("location")).toBe("/pl/account");
      const cookies = confirmed.headers.getSetCookie();
      const session = cookies.find((c) =>
        c.startsWith("__Secure-fo-buyer.session-token="),
      );
      expect(session).toMatch(/; Path=\/(;|$)/u);
      expect(session).toMatch(/; Secure(;|$)/u);
      expect(session).toMatch(/; HttpOnly(;|$)/u);
      expect(session).toMatch(/; SameSite=Lax(;|$)/iu);
      for (const cookie of cookies) {
        expect(cookie).toMatch(/^__Secure-fo-buyer\./u);
        expect(cookie).toMatch(/; Path=\/(;|$)/u);
        expect(cookie).not.toMatch(/; Domain=/iu);
        expect(cookie).not.toContain("@");
      }
      const sessionToken = cookieValue(
        confirmed,
        "__Secure-fo-buyer.session-token",
      );
      expect(sessionToken).toMatch(/^buyer\./u);
      const [row] = await scratch.sql<{ days: number }[]>`
        SELECT round(extract(epoch FROM expires - now()) / 86400)::int AS days
        FROM sessions WHERE session_token = ${sessionToken ?? ""}`;
      expect(row?.days).toBe(30);
    });

    it("T-47: a used buyer session is pushed back to 30 days after its last refresh", async () => {
      const token = await buyerSession(OTHER);
      clock = new Date(clock.getTime() + 2 * DAY_MS);
      expect(await buyer().sessionUserId(token)).toBe(await userIdOf(OTHER));
      const [row] = await scratch.sql<{ ms: string }[]>`
        SELECT (extract(epoch FROM expires) * 1000)::bigint::text AS ms
        FROM sessions WHERE session_token = ${token}`;
      expect(Number(row?.ms)).toBe(clock.getTime() + 30 * DAY_MS);
    });

    it("C.4: confirm lands on the stored return path and clears it; the request stored it with Path=/", async () => {
      const { response, token } = await requestBuyer(
        BUYER_EMAIL,
        "de",
        "/de/checkout",
      );
      expect(cookieValue(response, "__Secure-fo-buyer.callback-url")).toBe(
        "/de/checkout",
      );
      const confirmed = await confirmBuyer(
        token,
        "de",
        "__Secure-fo-buyer.callback-url=/de/checkout",
      );
      expect(confirmed.headers.get("location")).toBe("/de/checkout");
      const callbackCookies = confirmed.headers
        .getSetCookie()
        .filter((c) => c.startsWith("__Secure-fo-buyer.callback-url="));
      expect(callbackCookies).toEqual([
        "__Secure-fo-buyer.callback-url=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
      ]);
    });

    it.each([
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "%2F%2Fevil.example",
      "/en/admin",
    ])(
      "C.4: a callback cookie of %s lands on the locale's home",
      async (hostile) => {
        const { token } = await requestBuyer(BUYER_EMAIL, "de");
        const confirmed = await confirmBuyer(
          token,
          "de",
          `__Secure-fo-buyer.callback-url=${encodeURIComponent(hostile)}`,
        );
        expect(confirmed.headers.get("location")).toBe("/de/account");
        expect(
          cookieValue(confirmed, "__Secure-fo-buyer.session-token"),
        ).toMatch(/^buyer\./u);
      },
    );

    it("C.4: a link confirmed in a browser without the cookie lands on the locale's home", async () => {
      const { token } = await requestBuyer(
        BUYER_EMAIL,
        "en-gb",
        "/en-gb/checkout",
      );
      const confirmed = await confirmBuyer(token, "en-gb");
      expect(confirmed.headers.get("location")).toBe("/en-gb/account");
    });

    it("afterSignIn runs once per successful confirm with the user and the normalised address; never on a replay or an expired link", async () => {
      const calls: [string, string][] = [];
      hook = (userId, email) => {
        calls.push([userId, email]);
        return Promise.resolve();
      };
      const { token } = await requestBuyer("  Anna+Gifts@Example.TEST ");
      const confirmed = await confirmBuyer(token);
      expect(confirmed.headers.get("location")).toBe("/de/account");
      expect(calls).toEqual([[await userIdOf(BUYER_EMAIL), BUYER_EMAIL]]);

      const replay = await confirmBuyer(token);
      expect(replay.headers.get("location")).toBe("/de/account?state=expired");
      expect(replay.headers.getSetCookie()).toEqual([]);

      const late = await requestBuyer(BUYER_EMAIL);
      // Past its hour: the row's expiry moved into the past (the admin suite's way, T-11).
      await scratch.sql`UPDATE verification_tokens
                        SET expires = now() - interval '1 minute'`;
      const expired = await confirmBuyer(late.token);
      expect(expired.headers.get("location")).toBe("/de/account?state=expired");
      expect(calls).toHaveLength(1);
    });

    it("afterSignIn throwing commits nothing: no session row, no cookie, and the same link then works", async () => {
      const address = "first-time+hook@example.test";
      let failures = 1;
      const calls: string[] = [];
      hook = (id) => {
        calls.push(id);
        if (failures-- > 0)
          return Promise.reject(new Error("customer insert failed"));
        return Promise.resolve();
      };
      const { token } = await requestBuyer(address);
      const failed = await confirmBuyer(token);
      expect(failed.headers.get("location")).toBe("/de/account?state=expired");
      expect(failed.headers.getSetCookie()).toEqual([]);
      // Auth.js made the identity row; the hook (the customer, C.4) is what failed.
      const userId = await userIdOf(address);
      expect(userId).not.toBe("");
      expect(await sessionCount(userId)).toBe(0);

      const retried = await confirmBuyer(token);
      expect(retried.headers.get("location")).toBe("/de/account");
      expect(await sessionCount(userId)).toBe(1);
      expect(calls).toEqual([userId, userId]);
    });

    it("signOutEverywhere deletes every sessions row of the user, on every surface, and nobody else's", async () => {
      const dual = ids[DUAL] ?? "";
      const browserOne = await buyerSession(DUAL);
      const browserTwo = await buyerSession(DUAL, "en");
      const adminToken = await adminSession(DUAL);
      const floristToken = await floristSession(DUAL);
      const otherToken = await buyerSession(OTHER);
      expect(await buyer().sessionUserId(browserOne)).toBe(dual);
      expect(await buyer().sessionUserId(browserTwo)).toBe(dual);
      expect(
        await resolveAdminSession(adminToken, { auth: admin(), run }),
      ).not.toBeNull();
      expect(await sessionCount(dual)).toBe(4);

      expect(await buyer().signOutEverywhere(dual)).toBe(4);
      expect(await sessionCount(dual)).toBe(0);
      expect(await buyer().sessionUserId(browserOne)).toBeNull();
      expect(await buyer().sessionUserId(browserTwo)).toBeNull();
      expect(
        await resolveAdminSession(adminToken, { auth: admin(), run }),
      ).toBeNull();
      expect(
        await resolveFloristContext(floristToken, {
          auth: florist(),
          run,
          environment: "staging",
        }),
      ).toBeNull();
      expect(await buyer().sessionUserId(otherToken)).toBe(
        await userIdOf(OTHER),
      );
      await expect(buyer().signOutEverywhere("not-a-uuid")).rejects.toThrow();
    });

    it("AC-47: buyer, admin and florist sessions authenticate nothing on each other's surface, for one person who is all three", async () => {
      const dual = ids[DUAL] ?? "";
      const buyerToken = await buyerSession(DUAL);
      const adminToken = await adminSession(DUAL);
      const floristToken = await floristSession(DUAL);
      // Each on its own surface: valid.
      expect(await buyer().sessionUserId(buyerToken)).toBe(dual);
      expect(
        await resolveAdminSession(adminToken, { auth: admin(), run }),
      ).not.toBeNull();
      expect(
        await resolveFloristContext(floristToken, {
          auth: florist(),
          run,
          environment: "staging",
        }),
      ).not.toBeNull();
      // A buyer cookie (Path=/, so the browser sends it under /admin and /vendor too) on admin
      // and florist: nothing.
      expect(
        await resolveAdminSession(buyerToken, { auth: admin(), run }),
      ).toBeNull();
      expect(
        await resolveFloristContext(buyerToken, {
          auth: florist(),
          run,
          environment: "staging",
        }),
      ).toBeNull();
      // Admin and florist cookies presented on the buyer surface: nothing.
      expect(await buyer().sessionUserId(adminToken)).toBeNull();
      expect(await buyer().sessionUserId(floristToken)).toBeNull();
    });

    it("sign-out lands on the locale's signed-out page, deletes the row and expires the cookie at Path=/", async () => {
      const token = await buyerSession(OTHER, "pl");
      const response = await buyer().signOut(
        form(
          {},
          "/api/auth/buyer/sign-out",
          `__Secure-fo-buyer.session-token=${token}`,
        ),
        { locale: "pl" },
      );
      expect(response.headers.get("location")).toBe(
        "/pl/account?state=signed-out",
      );
      expect(response.headers.getSetCookie()).toEqual([
        "__Secure-fo-buyer.session-token=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
      ]);
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sessions WHERE session_token = ${token}`;
      expect(row?.n).toBe(0);
    });

    it("plus addressing and case reach one identity; a refused address gets the same bytes and no mail; a malformed one the form again", async () => {
      const options = { locale: "de", returnTo: "/de/checkout" };
      const send = async (email: string) => {
        const response = await buyer().requestSignIn(
          form({ email }, "/api/auth/buyer/request"),
          options,
        );
        await flush();
        return snapshot(response);
      };
      const plus = await send("ANNA+Gifts@example.test");
      const refused = await send("someone@example.invalid");
      expect(refused).toEqual(plus);
      expect(mailer.messages(BUYER_EMAIL)).toHaveLength(1);
      expect(mailer.messages()).toHaveLength(1);
      // The core's form schema (spec 012's, unchanged) refuses a unicode local part and a
      // single-label domain such as `redacted+x@invalid`: the form page again, no state, no
      // stored return path, no mail, as on admin and florist (carried to TASK-344 for AC-48).
      for (const malformed of ["zoë@example.test", "redacted+x@invalid"]) {
        const answer = await send(malformed);
        expect(answer.status).toBe(303);
        expect(answer.headers).toContainEqual(["location", "/de/account"]);
        expect(answer.headers.some(([name]) => name === "set-cookie")).toBe(
          false,
        );
      }
      expect(mailer.messages()).toHaveLength(1);
    });

    it("§8: no log line of the buyer flow carries the token, the link, the return path or the address", async () => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          lines.push(String(chunk));
          return true;
        });
      try {
        hook = () => Promise.reject(new Error(`boom for ${BUYER_EMAIL}`));
        const { token } = await requestBuyer(BUYER_EMAIL, "de", "/de/checkout");
        await confirmBuyer(
          token,
          "de",
          "__Secure-fo-buyer.callback-url=/de/checkout",
        );
        hook = () => Promise.resolve();
        await confirmBuyer(
          token,
          "de",
          "__Secure-fo-buyer.callback-url=/de/checkout",
        );
        await buyer().signOutEverywhere(await userIdOf(BUYER_EMAIL));
        const out = lines.join("");
        expect(lines.length).toBeGreaterThan(0);
        expect(out).not.toContain(token);
        expect(out).not.toContain(BUYER_EMAIL);
        expect(out).not.toContain("/de/checkout");
        expect(out).not.toContain("boom");
        expect(out).not.toMatch(/[?&](?:t|token)=(?!\[REDACTED)/u);
      } finally {
        spy.mockRestore();
      }
    });
  },
);
