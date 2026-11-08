/**
 * Spec 011's florist surface, the parts a unit can prove (TASK-212), moved to `/vendor` and opened
 * on the live site by spec 026a (TASK-354):
 *
 *  - AC-18 (policy half; spec 026a AC-3, T-03 unit half): `signInPolicy` over the five
 *    environments, and `"bogus"` and other unknown strings, which read as production.
 *  - Spec 026a AC-1 (T-01): the base is `/vendor`, the route tree under `src/app` equals it, the
 *    cookies are `Path=/vendor`. AC-2 (T-02, source scan half): the Phase 0 path is spelled in no
 *    file under `src/`, and under `tests/` only in the e2e 404 test. AC-4 (T-04, proxy half): the
 *    proxy passes every florist path in every environment, with no redirect, rewrite or cookie.
 *  - AC-19 (configuration half): the florist instance's cookie names, path and flags, no `__Host-`
 *    name, 30-day database sessions, rolling, surface-bound session tokens.
 *  - AC-21 (proxy half): a florist cookie changes nothing the proxy does on a public path; no
 *    public source reads the florist cookie.
 *  - AC-22: every florist route under `src/app` and every florist path is built from
 *    `FLORIST_BASE_PATH`; the header rules; `robots.txt` disallows `/demo/` and `/vendor/` (spec
 *    026a AC-12, the robots half); the florist tree loads no analytics
 *    or consent code; the source scan finds no second Auth.js configuration.
 *  - AC-32 (unit half): the sign-in email in en, pl and de, no address in it; no florist file reads
 *    `Accept-Language`; `?hl=` reaches the layout only as one of the three.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLORIST_BASE_PATH,
  FLORIST_ENVIRONMENTS,
  FLORIST_PATHS,
  floristPaths,
  signInPolicy,
} from "../../src/config/florists";
import {
  FLORIST_SESSION_MAX_AGE_SECONDS,
  FLORIST_SURFACE,
  createFloristAuth,
  safeFloristBack,
  withLanguage,
} from "../../src/lib/auth/florist";
import { isSessionTokenOf, newSessionToken } from "../../src/lib/auth/tokens";
import {
  FLORIST_LANGUAGE_HEADER,
  FLORIST_SESSION_COOKIE,
  floristHeaderRules,
  rollingCookie,
} from "../../src/lib/florist-headers";
import { renderFloristSignInEmail } from "../../src/modules/partners/auth/sign-in-email";
import { DISALLOWED_PATHS, robotsTxt } from "../../src/modules/seo/robots";

const ROOT = process.cwd();
const TREE = join(
  ROOT,
  "src/app",
  ...FLORIST_BASE_PATH.split("/").filter(Boolean),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const read = (file: string): string => readFileSync(file, "utf8");

/** A source file without its block and line comments: rules read code, not prose. */
const code = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");

/** The URL path a route file under `src/app` serves (route groups dropped). */
function routePath(file: string): string {
  const segments = relative(join(ROOT, "src/app"), file)
    .split("/")
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/u.test(segment));
  return `/${segments.join("/")}`;
}

describe("AC-18, spec 026a AC-3 — signInPolicy is a total function of the environment", () => {
  it.each([
    ["development", ["demo"]],
    ["test", ["demo"]],
    ["preview", ["demo"]],
    ["staging", ["demo"]],
    ["production", ["active", "paused"]],
    // Anything else is production: fail closed to the live list, never open to `demo`.
    ["bogus", ["active", "paused"]],
    ["prod", ["active", "paused"]],
    ["Production", ["active", "paused"]],
    ["", ["active", "paused"]],
  ])("%s → %j", (environment, statuses) => {
    expect(signInPolicy(environment)).toEqual(statuses);
  });

  it("covers exactly the five deployment environments", () => {
    expect([...FLORIST_ENVIRONMENTS].sort()).toEqual(
      ["development", "preview", "production", "staging", "test"].sort(),
    );
  });
});

describe("AC-19 — the florist instance's cookies and sessions", () => {
  const auth = createFloristAuth({
    secret: () => "unit-secret-0123456789abcdef0123456789",
    siteOrigin: () => "https://staging.example.test",
  });
  const config = auth.authConfig();

  it("names its three cookies __Secure-fo-florist.*, scoped to the base path, Secure, HttpOnly, Lax", () => {
    expect(auth.cookies).toEqual({
      sessionToken: "__Secure-fo-florist.session-token",
      csrfToken: "__Secure-fo-florist.csrf-token",
      callbackUrl: "__Secure-fo-florist.callback-url",
    });
    expect(FLORIST_SESSION_COOKIE).toBe(auth.cookies.sessionToken);
    for (const cookie of Object.values(config.cookies ?? {})) {
      expect(cookie?.name).not.toMatch(/^__Host-/u);
      expect(cookie?.options).toEqual({
        httpOnly: true,
        sameSite: "lax",
        path: "/vendor",
        secure: true,
      });
    }
  });

  it("is the core's florist surface: base path, pages, mail tag, 30 days rolling, database sessions", () => {
    expect(FLORIST_SURFACE).toMatchObject({
      name: "florist",
      basePath: "/vendor/api/auth",
      cookiePath: "/vendor",
      cookiePrefix: "__Secure-fo-florist",
      rolling: true,
      mailTag: "florist_sign_in",
      pages: {
        signIn: "/vendor/sign-in",
        confirm: "/vendor/sign-in/confirm",
        home: "/vendor",
      },
    });
    expect(FLORIST_SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
    expect(config.basePath).toBe("/vendor/api/auth");
    expect(config.session?.strategy).toBe("database");
    expect(config.session?.maxAge).toBe(2_592_000);
    // Rolling: Auth.js may extend once a day; the core's sessionUserId() does the same.
    expect(config.session?.updateAge).toBe(86_400);
  });

  it("mints surface-bound session tokens: a florist token is no admin token, and the reverse", () => {
    const token = config.session?.generateSessionToken?.() ?? "";
    expect(token).toMatch(/^florist\.[A-Za-z0-9_-]{43}$/u);
    expect(isSessionTokenOf("florist", token)).toBe(true);
    expect(isSessionTokenOf("admin", token)).toBe(false);
    expect(isSessionTokenOf("florist", newSessionToken("admin"))).toBe(false);
    expect(isSessionTokenOf("florist", "florist.")).toBe(false);
    expect(isSessionTokenOf("florist", "floristX.abc")).toBe(false);
  });
});

describe("AC-22 — one mount point, built from FLORIST_BASE_PATH", () => {
  it("every route file of the florist tree serves a path under the base", () => {
    const routes = walk(TREE).filter((file) =>
      /\/(?:page|route|layout)\.tsx?$/u.test(file),
    );
    expect(routes.length).toBeGreaterThanOrEqual(8);
    for (const file of routes) {
      const path = routePath(file);
      expect(
        path === FLORIST_BASE_PATH || path.startsWith(`${FLORIST_BASE_PATH}/`),
        path,
      ).toBe(true);
    }
    const served = routes.map(routePath);
    for (const path of [
      FLORIST_PATHS.base,
      FLORIST_PATHS.signIn,
      FLORIST_PATHS.confirm,
      FLORIST_PATHS.request,
      FLORIST_PATHS.confirmPost,
      FLORIST_PATHS.signOut,
      FLORIST_PATHS.language,
      `${FLORIST_PATHS.authBase}/[...nextauth]`,
      // Spec 030b §14.4 (TASK-444): the florist's own bouquets.
      FLORIST_PATHS.bouquets,
    ]) {
      expect(served, path).toContain(path);
    }
  });

  it("every florist path, the auth endpoints included, derives from the base it is given", () => {
    const moved = floristPaths("/vendor");
    for (const [key, value] of Object.entries(moved)) {
      const path = typeof value === "function" ? value("abc") : value;
      expect(path === "/vendor" || path.startsWith("/vendor/"), key).toBe(true);
    }
  });

  it("spec 026a AC-1: the base is /vendor and the tree lives at src/app/vendor", () => {
    expect(FLORIST_BASE_PATH).toBe("/vendor");
    expect(relative(ROOT, TREE)).toBe(join("src", "app", "vendor"));
    expect(statSync(join(TREE, "page.tsx")).isFile()).toBe(true);
  });

  it("no florist route file spells the mount point: it is read from the config", () => {
    for (const file of walk(TREE)) {
      expect(code(file), relative(ROOT, file)).not.toMatch(
        /["'`]\/vendor(?:["'`/?]|$)/mu,
      );
    }
  });

  it("spec 026a AC-2: the Phase 0 path is in no source file, and in tests only in the e2e 404 test", () => {
    // Built, so this file is not itself a match.
    const old = ["", "demo", "vendor-inbox"].join("/");
    const spelling = (dir: string) =>
      walk(join(ROOT, dir))
        .filter((file) => !file.includes(`${join("tests", "fixtures")}/`))
        .filter((file) => read(file).includes(old))
        .map((file) => relative(ROOT, file))
        .sort();
    expect(spelling("src")).toEqual([]);
    expect(spelling("tests")).toEqual([
      join("tests", "e2e", "florist-surface.spec.ts"),
    ]);
    expect(() => statSync(join(ROOT, "src/app/demo"))).toThrow();
  });

  it("sets noindex, nofollow and private, no-store on the base and everything under it", () => {
    const rules = floristHeaderRules();
    expect(rules.map((rule) => rule.source)).toEqual([
      "/vendor",
      "/vendor/:path*",
    ]);
    for (const rule of rules) {
      expect(rule.headers).toEqual([
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "private, no-store" },
      ]);
    }
    const config = read(join(ROOT, "next.config.ts"));
    expect(config.indexOf("...floristHeaderRules()")).toBeGreaterThan(
      config.indexOf("...noindexHeaderRules(environment)"),
    );
    expect(read(join(TREE, "layout.tsx"))).toMatch(
      /robots:\s*"noindex,nofollow"/u,
    );
  });

  it("robots.txt disallows /demo/ and /vendor/, and in the indexing environment prints Disallow: /vendor/", () => {
    expect(DISALLOWED_PATHS).toContain("/demo/");
    expect(DISALLOWED_PATHS).toContain("/vendor/");
    const txt = robotsTxt({
      environment: "production",
      siteUrl: "https://flowersoverseas.com",
    });
    expect(txt.split("\n")).toContain("Disallow: /vendor/");
    // The bare `/vendor` is a `noindex` redirect, left crawlable on purpose (spec 026a §6).
    expect(txt.split("\n")).not.toContain("Disallow: /vendor");
  });

  it("the florist tree loads no analytics, consent or GA4 code", () => {
    const sources = [
      ...walk(TREE),
      ...walk(join(ROOT, "src/modules/ui/florist")),
    ].map(code);
    for (const source of sources) {
      expect(source).not.toMatch(
        /from\s+["'][^"']*(?:analytics|consent|ga4)[^"']*["']|googletagmanager/iu,
      );
    }
  });

  it("configures no second Auth.js instance, adapter or mailer: florist.ts uses the core's factory", () => {
    const florist = read(join(ROOT, "src/lib/auth/florist.ts"));
    expect(florist).toContain("createAuthSurface(");
    expect(florist).not.toMatch(/from\s+["'](?:next-auth|@auth\/)/u);
    expect(florist).not.toMatch(
      /createAuthAdapter|NextAuth\(|\):\s*Mailer\s*\{/u,
    );
  });
});

describe("the proxy on florist paths (AC-21, AC-22, AC-32)", () => {
  const saved = process.env["APP_ENV"];
  afterEach(() => {
    if (saved === undefined) delete process.env["APP_ENV"];
    else process.env["APP_ENV"] = saved;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function proxyIn(environment: string) {
    process.env["APP_ENV"] = environment;
    vi.resetModules();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { proxy } = await import("../../src/proxy");
    return (path: string, init: RequestInit = {}) =>
      proxy(new NextRequest(new Request(`https://example.test${path}`, init)));
  }

  // `"bogus"` is the policy's case above: `appEnvironment()` refuses to boot on it at all.
  it.each([...FLORIST_ENVIRONMENTS])(
    "spec 026a AC-4: in %s the proxy passes every florist path untouched: no 404, redirect, rewrite or cookie",
    async (environment) => {
      const call = await proxyIn(environment);
      for (const path of [
        "/vendor",
        "/vendor/",
        "/vendor/sign-in",
        "/vendor/sign-in?hl=pl",
        "/vendor/api/auth/request",
        "/vendor/orders/6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91",
      ]) {
        const response = call(path);
        expect(response.status, path).toBe(200);
        expect(response.headers.get("location"), path).toBeNull();
        expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
        expect(response.headers.get("set-cookie"), path).toBeNull();
        expect(response.headers.get("x-middleware-next"), path).toBe("1");
      }
    },
  );

  it("spec 026a AC-2: the Phase 0 paths get no redirect from the proxy in any environment", async () => {
    for (const environment of FLORIST_ENVIRONMENTS) {
      const call = await proxyIn(environment);
      for (const suffix of [
        "",
        "/",
        "/sign-in",
        "/orders/6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91",
      ]) {
        const path = `${["", "demo", "vendor-inbox"].join("/")}${suffix}`;
        const response = call(path);
        expect(response.headers.get("location"), path).toBeNull();
        expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
      }
    }
  });

  it("spec 026a AC-4: a locale prefix on /vendor is a public path the proxy does not treat as florist", async () => {
    const call = await proxyIn("production");
    const header = (response: Response) =>
      response.headers.get(`x-middleware-request-${FLORIST_LANGUAGE_HEADER}`);
    const response = call("/en/vendor?hl=pl", {
      headers: { cookie: `${FLORIST_SESSION_COOKIE}=florist.abc` },
    });
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(header(response)).toBeNull();
  });

  it("hands ?hl= to the florist layout only as en, pl or de, and drops a client-sent copy", async () => {
    const call = await proxyIn("staging");
    const header = (response: Response) =>
      response.headers.get(`x-middleware-request-${FLORIST_LANGUAGE_HEADER}`);
    expect(header(call("/vendor/sign-in?hl=pl"))).toBe("pl");
    expect(header(call("/vendor/sign-in?hl=fr"))).toBeNull();
    expect(
      header(
        call("/vendor/sign-in", {
          headers: { [FLORIST_LANGUAGE_HEADER]: "de", "accept-language": "de" },
        }),
      ),
    ).toBeNull();
    // Not on a public path: the public site's language is the URL's.
    expect(header(call("/en?hl=pl"))).toBeNull();
    expect(header(call("/vendor/sign-in?hl=PL"))).toBeNull();
  });

  it("with a florist cookie, a public path gets exactly what it gets without one: no Set-Cookie, no Vary", async () => {
    const call = await proxyIn("staging");
    for (const path of ["/en", "/en-gb/send-flowers-to/poland", "/pl"]) {
      const plain = call(path);
      const withCookie = call(path, {
        headers: { cookie: `${FLORIST_SESSION_COOKIE}=florist.abc` },
      });
      const shape = (response: Response) =>
        [...response.headers.entries()]
          // Next's internal request-forwarding headers never leave the server.
          .filter(
            ([name]) =>
              name !== "x-request-id" &&
              !name.startsWith("x-middleware-request-") &&
              name !== "x-middleware-override-headers",
          )
          .sort();
      expect(shape(withCookie), path).toEqual(shape(plain));
      expect(withCookie.headers.get("set-cookie")).toBeNull();
      expect(withCookie.headers.get("vary")).toBeNull();
    }
  });

  it("re-issues the florist session cookie for 30 days on a florist page GET only", async () => {
    const call = await proxyIn("staging");
    const rolled = call("/vendor", {
      headers: { cookie: `${FLORIST_SESSION_COOKIE}=florist.abc` },
    }).headers.get("set-cookie");
    expect(rolled).toMatch(
      /^__Secure-fo-florist\.session-token=florist\.abc;/u,
    );
    expect(rolled).toMatch(/Path=\/vendor/u);
    expect(rolled).toMatch(/Max-Age=2592000/u);
    expect(rolled).toMatch(/Secure/u);
    expect(rolled).toMatch(/HttpOnly/u);
    expect(rolled).toMatch(/SameSite=lax/iu);
    expect(
      rollingCookie({
        method: "POST",
        pathname: "/vendor/api/auth/sign-out",
        value: "florist.abc",
      }),
    ).toBeNull();
    expect(
      rollingCookie({
        method: "GET",
        pathname: "/vendor/api/auth/confirm",
        value: "florist.abc",
      }),
    ).toBeNull();
    expect(
      rollingCookie({ method: "GET", pathname: "/en", value: "florist.abc" }),
    ).toBeNull();
    expect(
      rollingCookie({
        method: "GET",
        pathname: "/vendor",
        value: undefined,
      }),
    ).toBeNull();
  });

  it("no public source reads the florist cookie", () => {
    const readers = walk(join(ROOT, "src"))
      .filter((file) => /\.tsx?$/u.test(file))
      .filter((file) =>
        /__Secure-fo-florist|FLORIST_SESSION_COOKIE|floristSessionToken|getFloristContext/u.test(
          read(file),
        ),
      )
      .map((file) => relative(ROOT, file))
      .sort();
    expect(readers).toEqual(
      [
        "src/app/vendor/request.ts",
        // Spec 016 AC-23 (TASK-331): the confirm page sends a member already signed in to the order.
        "src/app/vendor/sign-in/confirm/page.tsx",
        "src/lib/auth/florist.ts",
        "src/lib/florist-headers.ts",
        "src/proxy.ts",
      ].sort(),
    );
  });
});

describe("AC-32 — the member's language", () => {
  const LINK =
    "https://staging.example.test/vendor/sign-in/confirm?t=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";

  it.each([
    ["en", "Your link to sign in to Flowers Overseas", "Open your orders:"],
    [
      "pl",
      "Twój link do logowania w Flowers Overseas",
      "Otwórz swoje zamówienia:",
    ],
    ["de", "Ihr Anmeldelink für Flowers Overseas", "Öffnen Sie Ihre Aufträge:"],
  ] as const)(
    "renders the sign-in email in %s, link and no address",
    (language, subject, lead) => {
      const email = renderFloristSignInEmail(LINK, language);
      expect(email.subject).toBe(subject);
      expect(email.text).toContain(`${lead} ${LINK}.`);
      expect(email.html).toContain(`<html lang="${language}">`);
      expect(email.html).toContain(`${lead} <a href="${LINK}">${LINK}</a>.`);
      for (const part of [email.subject, email.text, email.html]) {
        expect(part).not.toContain("@");
      }
    },
  );

  it("escapes the link in the HTML part", () => {
    const email = renderFloristSignInEmail(
      'https://x.test/c?t=a"><script>',
      "en",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("no florist file reads Accept-Language", () => {
    for (const file of [
      ...walk(TREE),
      join(ROOT, "src/lib/auth/florist.ts"),
      join(ROOT, "src/lib/florist-headers.ts"),
      ...walk(join(ROOT, "src/modules/partners")),
    ]) {
      expect(code(file).toLowerCase(), relative(ROOT, file)).not.toContain(
        "accept-language",
      );
    }
  });

  it("carries the page's language to the next page, never an address", () => {
    expect(withLanguage("/vendor/sign-in?state=sent", "pl")).toBe(
      "/vendor/sign-in?state=sent&hl=pl",
    );
    expect(withLanguage("/vendor/sign-in", "de")).toBe("/vendor/sign-in?hl=de");
    expect(withLanguage("/vendor/sign-in?state=sent", "en")).toBe(
      "/vendor/sign-in?state=sent",
    );
  });

  it("returns from the language form only to a florist page", () => {
    expect(safeFloristBack("/vendor/orders/abc")).toBe("/vendor/orders/abc");
    for (const hostile of [
      "https://evil.example/",
      "//evil.example",
      "/vendor//evil",
      "/vendors",
      "/en",
      "/vendor?x=1",
      "javascript:alert(1)",
    ]) {
      expect(safeFloristBack(hostile), hostile).toBe("/vendor");
    }
  });
});
