/**
 * Spec 040 T-01 (AC-1) and T-04 (AC-4), TASK-097 — the `APP_ENV` abstraction itself.
 *
 * Two tables and nothing else, because the whole value of this module is that it is total: every
 * combination of `{APP_ENV, VERCEL_ENV, NODE_ENV}` that can reach a running deployment has one
 * defined answer, and every one of the five answers has one defined `X-Robots-Tag` consequence.
 * A test that probed a few interesting cases would leave the interesting one — a typo in
 * `APP_ENV` on the day of the Railway cutover — unpinned, and that is the case ADR-0018 says
 * must fail the build rather than produce a `development` deployment that passes the placeholder
 * guard it was supposed to fail.
 *
 * `hostPlatform()` is here too. It has no table of its own in §10 because it is a three-line
 * derivation, but it is the one function outside the environment that behaviour may key on, and
 * the assertion that it is *only* read by the CSP is `pnpm check:no-vercel-env`'s sibling
 * argument in `tests/unit/check-no-vercel-env.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  APP_ENV_KEY,
  type DeploymentEnvironment,
  type EnvSource,
  EnvValidationError,
  UNPARSEABLE_APP_ENV_MESSAGE,
  appEnvironment,
  commitSha,
  deploymentEnvironment,
  deploymentEnvironments,
  hostPlatform,
} from "../../src/lib/env.schema";
import {
  NOINDEX_HEADER_NAME,
  NOINDEX_HEADER_VALUE,
  ALL_PATHS,
  noindexHeaderRules,
} from "../../src/lib/robots-headers";

/**
 * T-01. Every row is `{APP_ENV, VERCEL_ENV, NODE_ENV}` → the expected value, with `undefined`
 * meaning "the key is absent" and `""` meaning "the key is present and blank", which is what a
 * platform env store produces when somebody clears a field rather than deleting it.
 */
const RESOLUTION_TABLE: readonly {
  name: string;
  source: EnvSource;
  expected: DeploymentEnvironment;
}[] = [
  // 1. `APP_ENV` wins, for each of the five values.
  ...deploymentEnvironments.map((value) => ({
    name: `APP_ENV=${value}`,
    source: { APP_ENV: value },
    expected: value,
  })),
  {
    name: "APP_ENV wins over a disagreeing VERCEL_ENV",
    source: { APP_ENV: "staging", VERCEL_ENV: "production" },
    expected: "staging",
  },
  {
    name: "APP_ENV wins over NODE_ENV=test",
    source: { APP_ENV: "production", NODE_ENV: "test" },
    expected: "production",
  },
  {
    name: "surrounding whitespace is trimmed, as an env store adds it",
    source: { APP_ENV: "  production  " },
    expected: "production",
  },
  // 2. `VERCEL_ENV`, and only its two deployed values — the cold-fallback path.
  {
    name: "VERCEL_ENV=production when APP_ENV is absent",
    source: { VERCEL_ENV: "production" },
    expected: "production",
  },
  {
    name: "VERCEL_ENV=preview when APP_ENV is absent",
    source: { VERCEL_ENV: "preview" },
    expected: "preview",
  },
  {
    name: "VERCEL_ENV=production when APP_ENV is present but blank",
    source: { APP_ENV: "", VERCEL_ENV: "production" },
    expected: "production",
  },
  {
    name: "VERCEL_ENV=development is not a fallback source",
    source: { VERCEL_ENV: "development" },
    expected: "development",
  },
  {
    name: "VERCEL_ENV=staging is not a fallback source either",
    source: { VERCEL_ENV: "staging" },
    expected: "development",
  },
  {
    name: "VERCEL_ENV loses to NODE_ENV=test only when it is not deployed",
    source: { VERCEL_ENV: "development", NODE_ENV: "test" },
    expected: "test",
  },
  // 3. `NODE_ENV`.
  { name: "NODE_ENV=test", source: { NODE_ENV: "test" }, expected: "test" },
  // 4. The fail-closed default.
  { name: "nothing set at all", source: {}, expected: "development" },
  {
    name: "NODE_ENV=production alone is not a deployment signal",
    source: { NODE_ENV: "production" },
    expected: "development",
  },
  {
    name: "every key present and blank",
    source: { APP_ENV: "", VERCEL_ENV: "", NODE_ENV: "" },
    expected: "development",
  },
];

describe("appEnvironment resolution order (spec 040 AC-1, T-01)", () => {
  it.each(RESOLUTION_TABLE)("$name → $expected", ({ source, expected }) => {
    expect(appEnvironment(source)).toBe(expected);
  });

  it("knows exactly the five values of §5.2", () => {
    expect([...deploymentEnvironments]).toEqual([
      "development",
      "test",
      "preview",
      "staging",
      "production",
    ]);
  });
});

/**
 * The fail-closed clause, which is the reason the function throws rather than falling back: a
 * `development` answer would pass the placeholder guard and produce an indexable-looking build
 * from a typo.
 */
describe("a present-but-unparseable APP_ENV is a build failure (AC-1)", () => {
  const badValues = ["prod", "Production", "staging ", "live", "1", "PREVIEW"];

  it.each(badValues.filter((value) => value.trim() !== "staging"))(
    "throws on APP_ENV=%s",
    (value) => {
      expect(() => appEnvironment({ APP_ENV: value })).toThrow(
        EnvValidationError,
      );
    },
  );

  it("names the key and prints no value", () => {
    try {
      appEnvironment({
        APP_ENV: "prod",
        DATABASE_URL: "postgres://s3cret@h/d",
      });
      expect.unreachable("appEnvironment should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const thrown = error as EnvValidationError;
      expect(thrown.keys).toEqual([APP_ENV_KEY]);
      expect(thrown.message).toContain(APP_ENV_KEY);
      expect(thrown.message).toContain(UNPARSEABLE_APP_ENV_MESSAGE);
      // Neither the offending value nor any other variable's value reaches the message.
      expect(thrown.message).not.toContain("prod`");
      expect(thrown.message).not.toContain("s3cret");
    }
  });

  it("does not throw when APP_ENV is merely absent or blank", () => {
    expect(() => appEnvironment({})).not.toThrow();
    expect(() => appEnvironment({ APP_ENV: "   " })).not.toThrow();
  });

  it("keeps `deploymentEnvironment` as a deprecated alias for one PR (§5.2)", () => {
    expect(deploymentEnvironment).toBe(appEnvironment);
  });
});

/** T-04: the `noindex` consequence of each of the five values, including the unset case. */
describe("noindexHeaderRules over every environment (AC-4, T-04)", () => {
  const NOINDEX_TABLE: readonly {
    environment: DeploymentEnvironment;
    noindex: boolean;
  }[] = [
    { environment: "development", noindex: true },
    { environment: "test", noindex: true },
    { environment: "preview", noindex: true },
    { environment: "staging", noindex: true },
    { environment: "production", noindex: false },
  ];

  it.each(NOINDEX_TABLE)(
    "$environment → noindex: $noindex",
    ({ environment, noindex }) => {
      const rules = noindexHeaderRules(environment);
      if (!noindex) {
        expect(rules).toEqual([]);
        return;
      }
      expect(rules).toHaveLength(1);
      expect(rules[0]?.source).toBe(ALL_PATHS);
      expect(rules[0]?.headers).toEqual([
        { key: NOINDEX_HEADER_NAME, value: NOINDEX_HEADER_VALUE },
      ]);
    },
  );

  it("covers every value the type knows, so a sixth one cannot be forgotten", () => {
    expect(NOINDEX_TABLE.map((row) => row.environment)).toEqual([
      ...deploymentEnvironments,
    ]);
  });

  it("noindexes the unset-APP_ENV case, which is the whole fail-closed argument (AC-4)", () => {
    expect(noindexHeaderRules(appEnvironment({}))).toHaveLength(1);
    expect(noindexHeaderRules(appEnvironment({ VERCEL_ENV: "" }))).toHaveLength(
      1,
    );
  });
});

describe("hostPlatform (spec 040 §5.2)", () => {
  it.each([
    {
      name: "Vercel sets VERCEL=1",
      source: { VERCEL: "1" },
      expected: "vercel",
    },
    {
      name: "Railway sets RAILWAY_ENVIRONMENT_NAME",
      source: { RAILWAY_ENVIRONMENT_NAME: "production" },
      expected: "railway",
    },
    { name: "a laptop sets neither", source: {}, expected: "local" },
    {
      name: "a blank Railway name is not Railway",
      source: { RAILWAY_ENVIRONMENT_NAME: "  " },
      expected: "local",
    },
    {
      name: "VERCEL=0 is not Vercel",
      source: { VERCEL: "0" },
      expected: "local",
    },
    {
      name: "Vercel wins when both are somehow set",
      source: { VERCEL: "1", RAILWAY_ENVIRONMENT_NAME: "staging" },
      expected: "vercel",
    },
  ])("$name → $expected", ({ source, expected }) => {
    expect(hostPlatform(source)).toBe(expected);
  });

  it("is independent of the environment: the two axes never collapse", () => {
    expect(hostPlatform({ APP_ENV: "production" })).toBe("local");
    expect(appEnvironment({ VERCEL: "1" })).toBe("development");
  });
});

describe("commitSha (spec 040 §5.2)", () => {
  it("prefers Railway, then the Vercel server key, then the browser mirror", () => {
    expect(
      commitSha({
        RAILWAY_GIT_COMMIT_SHA: "r",
        VERCEL_GIT_COMMIT_SHA: "v",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "n",
      }),
    ).toBe("r");
    expect(
      commitSha({
        VERCEL_GIT_COMMIT_SHA: "v",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "n",
      }),
    ).toBe("v");
    expect(commitSha({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "n" })).toBe("n");
  });

  it("treats blank as absent and answers undefined when nothing is injected", () => {
    expect(commitSha({})).toBeUndefined();
    expect(commitSha({ RAILWAY_GIT_COMMIT_SHA: "  " })).toBeUndefined();
  });
});
