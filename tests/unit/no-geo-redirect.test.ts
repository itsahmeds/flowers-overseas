/**
 * T-09 (spec 001 AC-8, TASK-004) and T-10 / T-11 (spec 003 AC-10, AC-11, TASK-032); ADR-0006:
 * `fo/no-geo-redirect` over the geo fixtures. The rule is path-dependent twice over — a location
 * hint is legal only in `src/modules/i18n/hints.ts`, and a redirect is banned in a
 * proxy/middleware file and in the i18n module — so every case runs through RuleTester's
 * `filename` option. The `next-intl/middleware` ban is path-independent.
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  GEO_HEADERS,
  NEXT_INTL_MIDDLEWARE,
  isHintsFile,
  isRedirectBannedFile,
} from "../../eslint/fo/no-geo-redirect.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const repoRoot = resolve(__dirname, "../..");
const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

/** An ordinary module file: no location hint may be read here. */
const OUTSIDE = "src/modules/geo/lookup.ts";
/** The one file allowed to read a hint, for the suggestion banner (spec 003). */
const HINTS = "src/modules/i18n/hints.ts";
/** A legacy middleware file: no redirect may be built here. */
const MIDDLEWARE = "src/middleware.ts";
/** Its Next 16 successor, the real file since TASK-032: same ban. */
const PROXY = "src/proxy.ts";

const lint = (code: string, filename: string): Linter.LintMessage[] =>
  new Linter().verify(
    code,
    {
      files: ["**/*.ts"],
      plugins: { fo: plugin },
      languageOptions: tsLanguageOptions,
      rules: { "fo/no-geo-redirect": "error" },
    },
    filename,
  );

describe("fo/no-geo-redirect fixtures (T-09)", () => {
  it("reports exactly one error per invalid fixture", () => {
    expect(() => {
      ruleTester.run("no-geo-redirect", rule, {
        valid: [],
        invalid: [
          {
            code: fixture("geo-redirect-header.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "header" }],
          },
          {
            code: fixture("geo-redirect-geo.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "geo" }],
          },
          {
            // the fixture's own name carries the `middleware.ts` suffix the rule keys on
            code: fixture("geo-redirect-middleware.ts"),
            filename: "tests/fixtures/lint/geo-redirect-middleware.ts",
            errors: [{ messageId: "redirect" }],
          },
          {
            // AC-11: the same redirect in a `proxy.ts`-named file
            code: fixture("geo-redirect-proxy.ts"),
            filename: "tests/fixtures/lint/geo-redirect-proxy.ts",
            errors: [{ messageId: "redirect" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows the same hint reads inside src/modules/i18n/hints.ts and non-geo code elsewhere", () => {
    expect(() => {
      ruleTester.run("no-geo-redirect", rule, {
        valid: [
          { code: fixture("src/modules/i18n/hints.ts"), filename: HINTS },
          { code: fixture("geo-redirect-header.ts"), filename: HINTS },
          { code: fixture("geo-redirect-geo.ts"), filename: HINTS },
          { code: fixture("geo-redirect-valid.ts"), filename: OUTSIDE },
          {
            code: fixture("geo-redirect-valid-proxy.ts"),
            filename: PROXY,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("cites ADR-0006 in every message", () => {
    for (const [code, filename] of [
      [fixture("geo-redirect-header.ts"), OUTSIDE],
      [fixture("geo-redirect-geo.ts"), OUTSIDE],
      [fixture("geo-redirect-middleware.ts"), MIDDLEWARE],
      [fixture("geo-redirect-proxy.ts"), PROXY],
    ] as const) {
      const messages = lint(code, filename);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain("ADR-0006");
    }
  });
});

describe("fo/no-geo-redirect bans next-intl's locale middleware (T-10, AC-10)", () => {
  it("reports the import and the createMiddleware call in the fixture", () => {
    expect(() => {
      ruleTester.run("no-geo-redirect", rule, {
        valid: [],
        invalid: [
          {
            code: fixture("geo-redirect-nextintl-middleware.ts"),
            filename: PROXY,
            errors: [
              { messageId: "nextIntlMiddleware" },
              { messageId: "createMiddleware" },
            ],
          },
        ],
      });
    }).not.toThrow();
  });

  it("bans both forms in any file, not only a proxy file", () => {
    for (const filename of [
      PROXY,
      MIDDLEWARE,
      HINTS,
      OUTSIDE,
      "src/app/[locale]/layout.tsx",
    ]) {
      expect(
        lint(
          `import m from "${NEXT_INTL_MIDDLEWARE}";\nexport default m;\n`,
          filename,
        ),
      ).toHaveLength(1);
      expect(lint("createMiddleware(routing);", filename)).toHaveLength(1);
    }
  });

  it("cites ADR-0006 and the URL-resolved locale rule", () => {
    const [importMessage] = lint(
      `import createMiddleware from "${NEXT_INTL_MIDDLEWARE}";`,
      PROXY,
    );
    expect(importMessage?.message).toContain("ADR-0006");
    expect(importMessage?.message).toContain("spec 003");
    const [callMessage] = lint("createMiddleware({});", PROXY);
    expect(callMessage?.message).toContain("ADR-0006");
    expect(callMessage?.message).toContain("spec 003");
  });

  it("leaves other next-intl entry points and other createMiddleware-free code alone", () => {
    expect(
      lint('import { useTranslations } from "next-intl";', PROXY),
    ).toHaveLength(0);
    expect(
      lint('import { defineRouting } from "next-intl/routing";', PROXY),
    ).toHaveLength(0);
    expect(lint("createProxy(routing);", PROXY)).toHaveLength(0);
  });
});

describe("the repo grep AC-10 names", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
    });
  }

  it('finds no "next-intl/middleware" and no "createMiddleware(" under src/', () => {
    const offenders = sourceFiles(resolve(repoRoot, "src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return (
        text.includes(NEXT_INTL_MIDDLEWARE) ||
        text.includes("createMiddleware(")
      );
    });
    expect(offenders).toEqual([]);
  });
});

describe("fo/no-geo-redirect shapes", () => {
  it.each([...GEO_HEADERS])(
    "flags a %s read in both access forms",
    (header) => {
      expect(lint(`h.get("${header}");`, OUTSIDE)).toHaveLength(1);
      expect(lint(`h["${header}"];`, OUTSIDE)).toHaveLength(1);
      expect(lint(`h.get("${header.toUpperCase()}");`, OUTSIDE)).toHaveLength(
        1,
      );
      expect(lint(`h.get("${header}");`, HINTS)).toHaveLength(0);
    },
  );

  it.each([
    ['h.get("accept-language");', 0],
    ['h.get("x-request-id");', 0],
    ["request.geo?.country;", 1],
    ["req.geo.country;", 1],
    ["order.geo;", 0],
    ["geolocation(request);", 1],
  ])("%s reports %i outside the hints file", (code, expected) => {
    expect(lint(code, OUTSIDE)).toHaveLength(expected);
  });

  it("flags redirects only in proxy/middleware files and the i18n module", () => {
    const nextResponse = 'NextResponse.redirect(new URL("/de", request.url));';
    const navigation =
      'import { redirect } from "next/navigation";\nredirect("/de");\n';
    expect(lint(nextResponse, MIDDLEWARE)).toHaveLength(1);
    expect(lint(navigation, MIDDLEWARE)).toHaveLength(1);
    expect(lint(nextResponse, PROXY)).toHaveLength(1);
    expect(lint(navigation, PROXY)).toHaveLength(1);
    expect(lint(nextResponse, "proxy.ts")).toHaveLength(1);
    expect(lint(nextResponse, "src/modules/i18n/switcher.ts")).toHaveLength(1);
    expect(lint(nextResponse, HINTS)).toHaveLength(1);
    expect(lint(nextResponse, "src/app/actions.ts")).toHaveLength(0);
    expect(lint(navigation, "src/app/actions.ts")).toHaveLength(0);
    expect(
      lint(
        'import { redirect } from "./local";\nredirect("/de");\n',
        MIDDLEWARE,
      ),
    ).toHaveLength(0);
  });
});

describe("exported predicates", () => {
  it("identifies the hints file", () => {
    expect(isHintsFile("/repo/src/modules/i18n/hints.ts")).toBe(true);
    expect(isHintsFile("C:\\repo\\src\\modules\\i18n\\hints.ts")).toBe(true);
    expect(isHintsFile("/repo/src/modules/i18n/index.ts")).toBe(false);
  });

  it("identifies the files where a redirect is banned", () => {
    expect(isRedirectBannedFile("/repo/src/middleware.ts")).toBe(true);
    expect(isRedirectBannedFile("/repo/src/proxy.ts")).toBe(true);
    expect(isRedirectBannedFile("/repo/proxy.js")).toBe(true);
    expect(isRedirectBannedFile("C:\\repo\\src\\proxy.ts")).toBe(true);
    expect(
      isRedirectBannedFile("/repo/tests/fixtures/lint/geo-redirect-proxy.ts"),
    ).toBe(true);
    expect(isRedirectBannedFile("/repo/src/lib/proxy-helpers.ts")).toBe(false);
    expect(
      isRedirectBannedFile(
        "/repo/tests/fixtures/lint/geo-redirect-middleware.ts",
      ),
    ).toBe(true);
    expect(isRedirectBannedFile("/repo/src/modules/i18n/banner.tsx")).toBe(
      true,
    );
    expect(isRedirectBannedFile("/repo/src/app/page.tsx")).toBe(false);
  });
});
