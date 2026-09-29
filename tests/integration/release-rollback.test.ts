/**
 * T-37 / AC-39, AC-35 (spec 040 §14 A3 change 4; TASK-156): `pnpm release:rollback --to
 * <previous-release-sha> --expect <bad-sha>` is step 2 of the rollback runbook. It moves `release`
 * back with a lease, and **being an ancestor is not enough**: `--to` is accepted only through
 *
 *  (a) a successful production `web` deployment Railway lists for it, made from `release`; or
 *  (b) the previous release recorded by the production release note (on `origin/main`, after a
 *      fetch) that promoted `<bad-sha>`.
 *
 * History of every case: `main` is c0 → c1 → c2 → c3 → c4 → c5 → notes. c0 is the F1 commit
 * (production ran it from `main` before A3), c2 the previous release, c4 the bad one, c5 a later
 * commit; `release` is at c4. The notes commit on top puts `docs/releases/` on `origin/main` only:
 * the working clone is reset behind it, so a local checkout that is behind cannot matter.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rollback } from "../../scripts/release.ts";
import {
  type ReleaseRepo,
  makeReleaseRepo,
  renderFixture,
  renderNote,
  serveHealth,
} from "../fixtures/releases/git-fixture.ts";

let repo: ReleaseRepo;

const sha = (name: string): string => {
  const value = repo.sha[name];
  if (value === undefined) throw new Error(`no commit ${name}`);
  return value;
};

/** Note template → file name under `docs/releases/`. */
const NOTE_FILES: Record<string, (r: ReleaseRepo) => string> = {
  "production-promoted-c2.md": (r) =>
    `2026-09-10-production-${(r.sha["c2"] ?? "").slice(0, 7)}.md`,
  "production-promoted-bad.md": (r) =>
    `2026-09-20-production-${(r.sha["c4"] ?? "").slice(0, 7)}.md`,
  "production-promoted-bad-first.md": (r) =>
    `2026-09-20-production-${(r.sha["c4"] ?? "").slice(0, 7)}.md`,
  "production-halted-later.md": (r) =>
    `2026-09-25-production-${(r.sha["c5"] ?? "").slice(0, 7)}.md`,
  "staging-verified-bad.md": (r) =>
    `2026-09-19-staging-${(r.sha["c4"] ?? "").slice(0, 7)}.md`,
};

async function history(notes: readonly string[]): Promise<void> {
  for (const name of ["c0", "c1", "c2", "c3", "c4", "c5"]) {
    await repo.commit(name);
  }
  const files: Record<string, string> = {};
  for (const template of notes) {
    const name = NOTE_FILES[template];
    if (name === undefined) throw new Error(`no file name for ${template}`);
    files[`docs/releases/${name(repo)}`] = renderNote(repo, template);
  }
  await repo.commit("notes", files);
  await repo.git(["push", "-q", "origin", "main"]);
  await repo.setRemote("release", sha("c4"));
  // The working clone falls behind origin/main: its checkout has no docs/releases/ at all.
  await repo.git(["reset", "-q", "--hard", sha("c3")]);
}

const NOTES = ["production-promoted-c2.md", "production-promoted-bad.md"];

const rollbackTo = (to: string, extra: readonly string[] = []) =>
  repo.release(["rollback", "--to", sha(to), "--expect", sha("c4"), ...extra]);

const deployments = (name: string): string[] => [
  "--fixture-deployments",
  renderFixture(repo, `railway/${name}`),
];

beforeEach(async () => {
  repo = await makeReleaseRepo();
});
afterEach(() => {
  repo.cleanup();
});

describe("release:rollback (T-37, AC-39)", () => {
  it("moves release back to the previous release with a lease; release:status then says invariant: ok", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c2",
      deployments("deployments-rollback-none.json"),
    );
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("c2"));
    expect(result.stdout).toContain(`release is now ${sha("c2")}`);
    expect(result.stdout).toContain("accepted by route (b)");

    const health = await serveHealth(sha("c2"));
    try {
      const status = await repo.release(["status", "--health-url", health.url]);
      expect(status.code, status.output).toBe(0);
      expect(status.stdout).toMatch(/^invariant: ok$/m);
      expect(status.stdout).toContain(`production   ${sha("c2")}`);
      expect(status.stdout).toContain(`release      ${sha("c2")}`);
    } finally {
      await health.close();
    }
  });

  it("refuses a --to that is not an ancestor of release", async () => {
    await history(NOTES);
    const result = await rollbackTo("c5");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain(
      `refused: --to ${sha("c5")} is not an ancestor of release ${sha("c4")}`,
    );
  });

  it("refuses when the remote release is not --expect", async () => {
    await history(NOTES);
    await repo.setRemote("release", sha("c3"));
    const result = await rollbackTo("c2");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c3"));
    expect(result.stderr).toContain(
      `refused: the remote release is ${sha("c3")}, not --expect ${sha("c4")}`,
    );
  });

  it("refuses an ancestor that no production deployment ran and no release note names, naming both routes", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c1",
      deployments("deployments-rollback-none.json"),
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain(
      `refused: --to ${sha("c1")} is an ancestor of release, but neither route accepts it`,
    );
    expect(result.stderr).toContain("route (a)");
    expect(result.stderr).toContain("route (b)");
    expect(result.stderr).toContain(
      `names ${sha("c2")} as the previous release`,
    );
    expect(result.stderr).toContain("nothing was pushed");
  });

  it("refuses a --to whose only production deployment failed", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c3",
      deployments("deployments-rollback-failed.json"),
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain("no successful production web deployment");
    expect(result.stderr).toContain("FAILED");
  });

  it("refuses a --to whose only production deployment Railway marks REMOVED (success not stated)", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c3",
      deployments("deployments-rollback-removed.json"),
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain("REMOVED");
  });

  it("moves to a commit Railway lists as a successful production web deployment made from release (route a)", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c3",
      deployments("deployments-rollback-release-success.json"),
    );
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("c3"));
    expect(result.stdout).toContain("accepted by route (a)");
    expect(result.stdout).toContain("dep-c3");
  });

  it("refuses a --to whose only successful deployment was made from main (before A3), no note naming it", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c1",
      deployments("deployments-rollback-from-main.json"),
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain("made from main, not release");
  });

  it("refuses a --to whose successful deployment names no source branch, saying the branch is unknown", async () => {
    await history(NOTES);
    const result = await rollbackTo(
      "c1",
      deployments("deployments-rollback-no-branch.json"),
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain("source branch unknown");
  });

  it("moves to the F1 commit, recorded only as a main deployment, through the note that promoted <bad-sha> (route b)", async () => {
    await history(["production-promoted-bad-first.md"]);
    const result = await rollbackTo(
      "c0",
      deployments("deployments-rollback-f1-main.json"),
    );
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("c0"));
    expect(result.stdout).toContain("accepted by route (b)");
  });

  it("with the Railway API unreachable and a newer HALTED note, moves through the note and says only it was checked", async () => {
    await history([...NOTES, "production-halted-later.md"]);
    const result = await rollbackTo("c2");
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("c2"));
    expect(result.stdout).toContain(
      "only route (b), the release note, was checked",
    );
  });

  it("with the API unreachable over the network (not just unconfigured), says so and still checks the note", async () => {
    await history(NOTES);
    const result = await repo.release(
      [
        "rollback",
        "--to",
        sha("c2"),
        "--expect",
        sha("c4"),
        "--railway-url",
        "http://127.0.0.1:1/graphql",
      ],
      {
        RAILWAY_API_TOKEN: "fixture-token",
        RAILWAY_PROJECT_ID: "fixture-project",
      },
    );
    expect(result.code, result.output).toBe(0);
    expect(result.stdout).toContain("Railway API not reachable");
    expect(result.stdout).toContain(
      "only route (b), the release note, was checked",
    );
  }, 20_000);

  it("refuses a SHA named only by a later HALTED note's rollback plan, API unreachable", async () => {
    await history([...NOTES, "production-halted-later.md"]);
    const result = await rollbackTo("c3");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
  });

  it("refuses a SHA named only in an older note, API unreachable", async () => {
    await history(NOTES);
    const result = await rollbackTo("c0");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain(
      "only route (b), the release note, was checked",
    );
  });

  it("ignores a staging note, which names no previous release", async () => {
    await history(["production-promoted-bad.md", "staging-verified-bad.md"]);
    const result = await rollbackTo("c1");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
  });

  it("refuses when no production note promoted <bad-sha>, naming that", async () => {
    await history(["production-promoted-c2.md"]);
    const result = await rollbackTo("c2");
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c4"));
    expect(result.stderr).toContain(
      `no production release note on origin/main promoted ${sha("c4")}`,
    );
  });

  it("the lease refuses when release moves between the checks and the push", async () => {
    await history(NOTES);
    const result = await rollback(
      { to: sha("c2"), expect: sha("c4"), remote: "origin" },
      {
        cwd: repo.work,
        env: repo.env,
        beforePush: () => repo.setRemote("release", sha("c5")),
      },
    );
    expect(result.code).toBe(1);
    expect(await repo.remote("release")).toBe(sha("c5"));
    expect(result.errors.join("\n")).toContain(
      "refused: the push was rejected",
    );
  });

  it("a local checkout behind origin/main does not matter: notes are read from origin/main", async () => {
    await history(NOTES);
    writeFileSync(join(repo.work, "untracked.txt"), "x\n");
    const result = await rollbackTo("c2");
    expect(result.code, result.output).toBe(0);
    expect(await repo.remote("release")).toBe(sha("c2"));
  });
});
