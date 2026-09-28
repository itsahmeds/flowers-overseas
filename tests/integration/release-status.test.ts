/**
 * T-38 / AC-35 (spec 040 §14 A3; TASK-156): `pnpm release:status` makes the invariant visible.
 * `release` must equal `origin/main` or be an ancestor of it; when it is not, the command exits 1
 * with `invariant: BROKEN (release has <n> commits not on main)`. It also compares production's
 * live `/api/health` `commit` with `release`, and tolerates a difference only while Railway
 * reports a production deployment of the `release` commit in progress.
 *
 * Production's health endpoint is a local HTTP stand-in (`serveHealth`); Railway's deployments
 * are recorded-shape responses under `tests/fixtures/railway/`, rendered with this repository's
 * SHAs.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type HealthServer,
  type ReleaseRepo,
  makeReleaseRepo,
  renderFixture,
  serveHealth,
} from "../fixtures/releases/git-fixture.ts";

let repo: ReleaseRepo;
let health: HealthServer;

const sha = (name: string): string => {
  const value = repo.sha[name];
  if (value === undefined) throw new Error(`no commit ${name}`);
  return value;
};

beforeEach(async () => {
  repo = await makeReleaseRepo();
  for (const name of ["m0", "m1", "m2", "m3"]) await repo.commit(name);
  await repo.git(["push", "-q", "origin", "main"]);
  await repo.setRemote("release", sha("m1"));
  health = await serveHealth(sha("m1"));
});
afterEach(async () => {
  await health.close();
  repo.cleanup();
});

describe("release:status (T-38, AC-35)", () => {
  it("on a clean pair exits 0 with both SHAs, the pending commits and invariant: ok", async () => {
    const result = await repo.release(["status", "--health-url", health.url]);
    expect(result.code, result.output).toBe(0);
    expect(result.stdout).toContain(`release      ${sha("m1")}`);
    expect(result.stdout).toContain(`origin/main  ${sha("m3")}`);
    expect(result.stdout).toContain("unreleased   2 commits on main");
    expect(result.stdout).toContain("commit m2");
    expect(result.stdout).toContain("commit m3");
    expect(result.stdout).toContain(`production   ${sha("m1")}`);
    expect(result.stdout).toMatch(/^invariant: ok$/m);
  });

  it("on a release carrying a commit not on main exits 1 with invariant: BROKEN", async () => {
    await repo.git(["checkout", "-q", "-b", "stray", sha("m1")]);
    await repo.commit("x1");
    await repo.git(["push", "-q", "origin", "stray"]);
    await repo.setRemote("release", sha("x1"));
    health.setCommit(sha("x1"));
    const result = await repo.release(["status", "--health-url", health.url]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "invariant: BROKEN (release has 1 commits not on main)",
    );
    expect(result.stdout).not.toMatch(/^invariant: ok$/m);
  });

  it("exits 1 naming both when production runs another commit and nothing is deploying", async () => {
    health.setCommit(sha("m0"));
    const result = await repo.release([
      "status",
      "--health-url",
      health.url,
      "--fixture-deployments",
      renderFixture(repo, "railway/deployments-status-idle.json"),
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^invariant: ok$/m);
    expect(result.output).toContain(
      `production runs ${sha("m0")}, release is ${sha("m1")}`,
    );
  });

  it("prints deploying <b> and exits 0 while Railway builds the release commit", async () => {
    health.setCommit(sha("m0"));
    const result = await repo.release([
      "status",
      "--health-url",
      health.url,
      "--fixture-deployments",
      renderFixture(repo, "railway/deployments-status-building.json"),
    ]);
    expect(result.code, result.output).toBe(0);
    expect(result.stdout).toContain(`deploying ${sha("m1")}`);
    expect(result.output).not.toContain("production runs");
  });

  it("exits 1 when production differs and Railway cannot be asked", async () => {
    health.setCommit(sha("m0"));
    const result = await repo.release(["status", "--health-url", health.url]);
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      `production runs ${sha("m0")}, release is ${sha("m1")}`,
    );
    expect(result.output).toContain("Railway not checked");
  });

  it("exits 1 when production's health endpoint cannot be read", async () => {
    await health.close();
    health = await serveHealth(sha("m1"));
    const url = health.url.replace(/:\d+\//, ":1/");
    const result = await repo.release(["status", "--health-url", url]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("production   unknown");
  });

  it("exits 1 when the remote has no release branch", async () => {
    await repo.git(["update-ref", "-d", "refs/heads/release"], repo.bare);
    const result = await repo.release(["status", "--health-url", health.url]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("the remote has no release branch yet");
  });
});
