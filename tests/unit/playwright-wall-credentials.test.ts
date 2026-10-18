/**
 * `playwright.config.ts` `wallCredentials` (spec 040 AC-25, AC-26; TASK-099): the browser suites
 * reach the pull request's Railway environment through the staging wall with `STAGING_BASIC_AUTH`,
 * scoped to the `baseURL` origin and sent only in answer to the wall's challenge.
 */
import { describe, expect, it } from "vitest";

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
