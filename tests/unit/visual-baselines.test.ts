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
