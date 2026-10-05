/**
 * The root redirect (spec 003 §14 A16 clause 1, AC-7 and T-07 as A16 restates them; TASK-119).
 *
 * `/` answers one permanent 308 to `/en` for every request. The assertion is the **one value**:
 * `redirects()` deep-equals the single rule `{ source: "/", destination: "/en", permanent: true }`,
 * so an added `has` or `missing` (a cookie condition, a header condition), a second rule, a
 * temporary redirect or a moved destination each fails it (CLAUDE.md DoD §4, "no assertion may pass
 * with its subject removed"). The served half — the status, `Location`, `Set-Cookie` and `Vary`
 * for `GET` and `HEAD` in five request variants — is `tests/e2e/root-redirect.spec.ts`.
 *
 * `next.config.ts` is imported for real, with the build keys stubbed, so the value under test is
 * what Next reads, not a copy of the builder's output.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { rootRedirectRules } from "../../src/lib/root-redirect";
import { documentFallbackLocale } from "../../src/modules/i18n/registry";

const NEXT_CONFIG = resolve(import.meta.dirname, "../../next.config.ts");

/** The one rule A16 clause 6 names, written out as a literal on purpose. */
const THE_RULE = { source: "/", destination: "/en", permanent: true };

describe("rootRedirectRules()", () => {
  it("is exactly one unconditional permanent rule from `/` to `/en`", () => {
    expect(rootRedirectRules()).toStrictEqual([THE_RULE]);
  });

  it("carries no `has` and no `missing` key at all", () => {
    for (const rule of rootRedirectRules()) {
      expect(Object.keys(rule).sort()).toStrictEqual([
        "destination",
        "permanent",
        "source",
      ]);
    }
  });

  it("takes its destination from the registry's x-default locale home", () => {
    expect(documentFallbackLocale().code).toBe("en");
    const source = readFileSync(
      resolve(import.meta.dirname, "../../src/lib/root-redirect.ts"),
      "utf8",
    );
    // `localePath()` and the x-default resolver, never a locale literal in the destination.
    expect(source).toMatch(
      /destination:\s*localePath\(documentFallbackLocale\(\)\.code,\s*"home"\)/u,
    );
    expect(source).not.toMatch(/destination:\s*["'`]/u);
  });
});

describe("next.config.ts redirects()", () => {
  beforeAll(() => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("yields exactly the one rule, with no `has` and no `missing`", async () => {
    const { default: config } = await import("../../next.config");
    expect(typeof config.redirects).toBe("function");
    const rules = await config.redirects?.();
    expect(rules).toStrictEqual([THE_RULE]);
  });

  it("mounts the builder and nothing else (asserted from source)", () => {
    const source = readFileSync(NEXT_CONFIG, "utf8");
    expect(source).toMatch(
      /import \{\s*rootRedirectRules\s*\} from "\.\/src\/lib\/root-redirect"/u,
    );
    expect(source).toMatch(
      /redirects:\s*\(\)\s*=>\s*Promise\.resolve\(rootRedirectRules\(\)\)/u,
    );
  });
});

describe("the redirect is not in the proxy", () => {
  it("`src/proxy.ts` redirects nothing", () => {
    const proxy = readFileSync(
      resolve(import.meta.dirname, "../../src/proxy.ts"),
      "utf8",
    );
    expect(proxy).not.toMatch(/\bredirect\s*\(/u);
  });
});
