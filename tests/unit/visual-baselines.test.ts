/**
 * The visual-baseline ledger (spec 001 AC-17 / T-18; TASK-139).
 *
 * `linux` is the authoritative platform and `darwin` is advisory, so the gate is one-directional:
 * a baseline that exists only for `darwin` fails, a baseline that exists only for `linux` does
 * not. The manifest and `--verify` are what let a reviewer tell a baseline rendered by the
 * `visual-baselines` workflow from one made somewhere nobody can reproduce.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AUTHORITATIVE_PLATFORM,
  baselinesFor,
  checkBaselines,
  LOCAL_PLATFORM,
  manifestFor,
  parseManifest,
  SNAPSHOT_ROOT,
  verifyAgainstManifest,
} from "../../scripts/visual/baselines.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

/** A fixture tree of `<project>/<platform>/<name>.png` files with the given bytes. */
function tree(spec: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fo-baselines-"));
  roots.push(root);
  for (const [path, bytes] of Object.entries(spec)) {
    const full = join(root, SNAPSHOT_ROOT, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, bytes);
  }
  return root;
}

describe("the baseline sets", () => {
  it("lists only PNGs, sorted, keyed by project", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/b.png`]: "b",
      [`visual/${AUTHORITATIVE_PLATFORM}/a.png`]: "a",
      [`visual/${AUTHORITATIVE_PLATFORM}/README.md`]: "not a baseline",
      [`pseudo-rtl/${AUTHORITATIVE_PLATFORM}/ar-XB.png`]: "rtl",
    });

    expect(baselinesFor(root, AUTHORITATIVE_PLATFORM)).toEqual([
      "pseudo-rtl/ar-XB.png",
      "visual/a.png",
      "visual/b.png",
    ]);
  });

  it("reports an absent platform directory as an empty set rather than throwing", () => {
    const root = tree({ [`visual/${LOCAL_PLATFORM}/a.png`]: "a" });

    expect(baselinesFor(root, AUTHORITATIVE_PLATFORM)).toEqual([]);
  });
});

describe("the authority rule (linux decides, darwin is advisory)", () => {
  it("fails a baseline that exists for darwin only — CI would have nothing to compare", () => {
    const root = tree({
      [`visual/${LOCAL_PLATFORM}/home.png`]: "mac",
      [`visual/${LOCAL_PLATFORM}/footer.png`]: "mac",
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "linux",
    });

    const result = checkBaselines(root);

    expect(result.missingOnLinux).toEqual(["visual/footer.png"]);
    expect(result.counts[AUTHORITATIVE_PLATFORM]).toBe(1);
    expect(result.counts[LOCAL_PLATFORM]).toBe(2);
  });

  it("allows a baseline that exists for linux only — the local set may lag", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "linux",
      [`visual/${AUTHORITATIVE_PLATFORM}/footer.png`]: "linux",
      [`visual/${LOCAL_PLATFORM}/home.png`]: "mac",
    });

    const result = checkBaselines(root);

    expect(result.missingOnLinux).toEqual([]);
    expect(result.localOnly).toEqual(["visual/footer.png"]);
  });

  it("passes when every local baseline has a Linux counterpart", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "linux",
      [`visual/${LOCAL_PLATFORM}/home.png`]: "mac",
      [`pseudo-rtl/${AUTHORITATIVE_PLATFORM}/ar-XB.png`]: "linux",
      [`pseudo-rtl/${LOCAL_PLATFORM}/ar-XB.png`]: "mac",
    });

    expect(checkBaselines(root).missingOnLinux).toEqual([]);
  });
});

describe("the manifest and --verify", () => {
  it("hashes every authoritative baseline with sha256", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
      [`visual/${LOCAL_PLATFORM}/home.png`]: "other pixels",
    });

    const manifest = manifestFor(root);

    expect(manifest.platform).toBe(AUTHORITATIVE_PLATFORM);
    expect(manifest.files).toEqual({
      "visual/home.png": createHash("sha256").update("pixels").digest("hex"),
    });
  });

  it("matches a set committed exactly as the runner produced it", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
    });

    const result = verifyAgainstManifest(root, manifestFor(root));

    expect(result).toMatchObject({
      matched: 1,
      unknown: [],
      altered: [],
      uncommitted: [],
    });
  });

  it("names a baseline whose bytes are not the ones the run produced", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
    });
    const manifest = manifestFor(root);
    writeFileSync(
      join(root, SNAPSHOT_ROOT, "visual", AUTHORITATIVE_PLATFORM, "home.png"),
      "hand-made",
    );

    const result = verifyAgainstManifest(root, manifest);

    expect(result.altered).toEqual(["visual/home.png"]);
    expect(result.matched).toBe(0);
  });

  it("names a baseline the run never produced at all", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
    });
    const manifest = manifestFor(root);
    writeFileSync(
      join(
        root,
        SNAPSHOT_ROOT,
        "visual",
        AUTHORITATIVE_PLATFORM,
        "smuggled.png",
      ),
      "from nowhere",
    );

    const result = verifyAgainstManifest(root, manifest);

    expect(result.unknown).toEqual(["visual/smuggled.png"]);
  });

  it("treats a manifest entry with no committed file as information, not a failure", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
      [`visual/${AUTHORITATIVE_PLATFORM}/gone.png`]: "deleted on purpose",
    });
    const manifest = manifestFor(root);
    rmSync(
      join(root, SNAPSHOT_ROOT, "visual", AUTHORITATIVE_PLATFORM, "gone.png"),
    );

    const result = verifyAgainstManifest(root, manifest);

    expect(result.uncommitted).toEqual(["visual/gone.png"]);
    expect(result.altered).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});

/**
 * The manifest arrives as a file out of a downloaded artifact, so it is untrusted input:
 * `--verify` has to *report* a malformed one rather than throw a `TypeError` from inside
 * `verifyAgainstManifest` (`/review 1` on PR 95, 2026-09-22 — the old hand-rolled check was a
 * structural test plus an `as` cast and let `files: null` through).
 */
describe("parseManifest", () => {
  it("accepts a manifest the refresh workflow wrote", () => {
    const root = tree({
      [`visual/${AUTHORITATIVE_PLATFORM}/home.png`]: "pixels",
    });

    const parsed = parseManifest(JSON.stringify(manifestFor(root)));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected a valid manifest");
    expect(parsed.manifest.platform).toBe(AUTHORITATIVE_PLATFORM);
    expect(Object.keys(parsed.manifest.files)).toEqual(["visual/home.png"]);
  });

  it("reports `files: null` instead of letting it through", () => {
    const parsed = parseManifest(
      JSON.stringify({ platform: AUTHORITATIVE_PLATFORM, files: null }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.problems.join(" ")).toContain("files");
  });

  it("reports a hash that is not a sha256 digest", () => {
    const parsed = parseManifest(
      JSON.stringify({
        platform: AUTHORITATIVE_PLATFORM,
        files: { "visual/home.png": 12345 },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.problems.join(" ")).toContain("visual/home.png");
  });

  it("reports a truncated hex digest, which a length-blind check would accept", () => {
    const parsed = parseManifest(
      JSON.stringify({
        platform: AUTHORITATIVE_PLATFORM,
        files: { "visual/home.png": "deadbeef" },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.problems.join(" ")).toContain("sha256");
  });

  it("reports a missing platform", () => {
    const parsed = parseManifest(JSON.stringify({ files: {} }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.problems.join(" ")).toContain("platform");
  });

  it("reports a file that is not JSON at all", () => {
    const parsed = parseManifest("<html>404 Not Found</html>");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a rejection");
    expect(parsed.problems.join(" ")).toContain("not JSON");
  });
});
