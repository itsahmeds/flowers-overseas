/**
 * T-36 / AC-36 (spec 040 §14 A3 change 3, step 3; TASK-156): `pnpm release:promote --sha <sha>
 * --expect <old-sha>` moves `release` to exactly the gated commit, fast-forward only, with a lease,
 * and every refusal pushes nothing and names its reason.
 *
 * Each case builds a temporary bare repository (`tests/fixtures/releases/git-fixture.ts`) and
 * reads the verdict off the **remote's** refs, never off the command's own claim. The one case the
 * CLI cannot stage — `release` moved by someone else *between* the command's `--expect` check and
 * its push — calls the exported `promote` in-process with a `beforePush` seam, so the lease
 * (`--force-with-lease=release:<old-sha>`) is what refuses there, and nothing else can.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { promote } from "../../scripts/release.ts";
import {
  type ReleaseRepo,
  makeReleaseRepo,
} from "../fixtures/releases/git-fixture.ts";

let repo: ReleaseRepo;

/** main: m0 → m1 → m2 → m3, all pushed; release at m1. */
async function standardHistory(): Promise<void> {
  for (const name of ["m0", "m1", "m2", "m3"]) await repo.commit(name);
  await repo.git(["push", "-q", "origin", "main"]);
  await repo.setRemote("release", repo.sha["m1"] ?? "");
}

const sha = (name: string): string => {
  const value = repo.sha[name];
  if (value === undefined) throw new Error(`no commit ${name}`);
  return value;
};

beforeEach(async () => {
  repo = await makeReleaseRepo();
});
afterEach(() => {
  repo.cleanup();
});

describe("release:promote (T-36, AC-36)", () => {
  it("fast-forwards release to exactly <sha> with a lease and prints the new tip", async () => {
    await standardHistory();
    const result = await repo.release([
      "promote",
      "--sha",
      sha("m2"),
      "--expect",
      sha("m1"),
    ]);
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("m2"));
    expect(result.stdout).toContain(`release is now ${sha("m2")}`);
  });

  it("refuses, pushing nothing, when the remote release moved since READY (--expect is stale)", async () => {
    await standardHistory();
    await repo.setRemote("release", sha("m2")); // someone promoted m2 in between
    const result = await repo.release([
      "promote",
      "--sha",
      sha("m3"),
      "--expect",
      sha("m1"),
    ]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m2"));
    expect(result.stderr).toContain(
      `refused: the remote release is ${sha("m2")}, not --expect ${sha("m1")}`,
    );
    expect(result.stderr).toContain("nothing was pushed");
  });

  it("refuses when <sha> is not on origin/main (a commit on another branch)", async () => {
    await standardHistory();
    await repo.git(["checkout", "-q", "-b", "side", sha("m1")]);
    await repo.commit("s1");
    await repo.git(["push", "-q", "origin", "side"]);
    const result = await repo.release([
      "promote",
      "--sha",
      sha("s1"),
      "--expect",
      sha("m1"),
    ]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m1"));
    expect(result.stderr).toContain(
      `refused: ${sha("s1")} is not on origin/main`,
    );
  });

  it("refuses a SHA the repository does not know", async () => {
    await standardHistory();
    const result = await repo.release([
      "promote",
      "--sha",
      "0123456789abcdef0123456789abcdef01234567",
      "--expect",
      sha("m1"),
    ]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m1"));
    expect(result.stderr).toContain("refused: --sha");
    expect(result.stderr).toContain("is not a commit");
  });

  it("refuses a non-fast-forward (<old-sha> is not an ancestor of <sha>)", async () => {
    await standardHistory();
    const result = await repo.release([
      "promote",
      "--sha",
      sha("m0"),
      "--expect",
      sha("m1"),
    ]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m1"));
    expect(result.stderr).toContain(
      `refused: not a fast-forward: --expect ${sha("m1")} is not an ancestor of ${sha("m0")}`,
    );
  });

  it("leaves release at <sha>, not at main's tip, when main moved on after READY", async () => {
    await standardHistory();
    // READY named m2; m3 is already on main, and m4 lands after READY, before promotion.
    await repo.commit("m4");
    await repo.git(["push", "-q", "origin", "main"]);
    const result = await repo.release([
      "promote",
      "--sha",
      sha("m2"),
      "--expect",
      sha("m1"),
    ]);
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("m2"));
    expect(await repo.remote("main")).toBe(sha("m4"));
  });

  it("refuses --create when release already exists", async () => {
    await standardHistory();
    const result = await repo.release(["promote", "--create", "--sha", sha("m2")]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m1"));
    expect(result.stderr).toContain(
      `refused: --create, but the remote release already exists at ${sha("m1")}`,
    );
  });

  it("creates release with --create when it does not exist yet", async () => {
    for (const name of ["m0", "m1"]) await repo.commit(name);
    await repo.git(["push", "-q", "origin", "main"]);
    const result = await repo.release(["promote", "--create", "--sha", sha("m0")]);
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("m0"));
  });

  it("refuses --create for a commit that is not on origin/main", async () => {
    await repo.commit("m0");
    await repo.git(["push", "-q", "origin", "main"]);
    await repo.git(["checkout", "-q", "-b", "side"]);
    await repo.commit("s1");
    await repo.git(["push", "-q", "origin", "side"]);
    const result = await repo.release(["promote", "--create", "--sha", sha("s1")]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBeUndefined();
    expect(result.stderr).toContain("is not on origin/main");
  });

  it("refuses without --create when release does not exist", async () => {
    await repo.commit("m0");
    await repo.git(["push", "-q", "origin", "main"]);
    const result = await repo.release([
      "promote",
      "--sha",
      sha("m0"),
      "--expect",
      sha("m0"),
    ]);
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBeUndefined();
    expect(result.stderr).toContain(
      "refused: the remote has no release branch yet",
    );
  });

  it("refuses a missing --expect, and --expect together with --create", async () => {
    await standardHistory();
    const noExpect = await repo.release(["promote", "--sha", sha("m2")]);
    expect(noExpect.code).toBe(1);
    expect(noExpect.stderr).toContain("--expect <old-sha> is required");
    const both = await repo.release([
      "promote",
      "--create",
      "--sha",
      sha("m2"),
      "--expect",
      sha("m1"),
    ]);
    expect(both.code).toBe(1);
    expect(both.stderr).toContain("--create takes no --expect");
    expect(await repo.remote("release")).toBe(sha("m1"));
  });

  it("the lease refuses when release moves between the --expect check and the push", async () => {
    await standardHistory();
    // Someone fast-forwards release to m2 after the check read m1. Without the lease, pushing m3
    // would be a plain fast-forward from m2 and would succeed.
    const result = await promote(
      { sha: sha("m3"), expect: sha("m1"), create: false, remote: "origin" },
      {
        cwd: repo.work,
        env: repo.env,
        beforePush: () => repo.setRemote("release", sha("m2")),
      },
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("m2"));
    expect(result.errors.join("\n")).toContain(
      "refused: the push was rejected",
    );
  });
});
