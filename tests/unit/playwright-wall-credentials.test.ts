/**
 * `playwright.config.ts` `wallCredentials` (spec 040 AC-25, AC-26; TASK-099): the browser suites
 * reach the pull request's Railway environment through the staging wall with `STAGING_BASIC_AUTH`,
 * scoped to the `baseURL` origin and sent only in answer to the wall's challenge.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import config, { wallCredentials } from "../../playwright.config";

const TARGET = "https://pr-263.flowersoverseas.com";

describe("wallCredentials", () => {
  it("splits user:password and scopes it to the target's origin", () => {
    expect(wallCredentials("ci:s3cr:et", `${TARGET}/en`)).toEqual({
      username: "ci",
      password: "s3cr:et",
      origin: TARGET,
      send: "unauthorized",
    });
  });

  it.each([undefined, "", "  ", "no-colon", ":password", "user:", "us er:pw"])(
    "sends nothing for %j",
    (raw) => {
      expect(wallCredentials(raw, TARGET)).toBeUndefined();
    },
  );

  it("adds no credential and no header to a local run without the variable", () => {
    // This file runs with no STAGING_BASIC_AUTH, as a laptop does.
    expect(process.env["STAGING_BASIC_AUTH"]).toBeUndefined();
    expect(config.use?.httpCredentials).toBeUndefined();
    expect(config.use?.extraHTTPHeaders).toBeUndefined();
  });
});

describe("no trace is recorded while the wall's credential is in scope (/review 263 item 1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("turns tracing off when STAGING_BASIC_AUTH is set: a trace would hold the Basic header", async () => {
    vi.stubEnv("STAGING_BASIC_AUTH", "ci-wall:aaaa?bbbb?cccc");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", TARGET);
    vi.resetModules();
    const { default: walled } = await import("../../playwright.config");
    expect(walled.use?.httpCredentials).toMatchObject({ origin: TARGET });
    expect(walled.use?.trace).toBe("off");
  });

  it("keeps the retry trace on a local run, which has no credential to leak", () => {
    expect(config.use?.trace).toBe("on-first-retry");
  });
});
