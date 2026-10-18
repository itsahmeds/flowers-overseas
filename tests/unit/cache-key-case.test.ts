/**
 * Case-exact cache files (spec 003 §6 "Canonical", spec 007 §2; TASK-247, QA-2 N-01).
 *
 * A case-variant URL (`/EN`, `/en/Occasions`, `/en/poland/product/AMBER-HOUR`) must never read or
 * write the files of the lowercase page. On macOS APFS it did: the variant read the lowercase
 * prerender, and its 404 regeneration was written into the lowercase page's files, so the real
 * page answered 404 to every later visitor until a restart.
 *
 * CI runs on case-sensitive Linux, where the defect cannot occur, so the volume is **simulated**
 * here: `foldingFs` stores every path below the dist directory in lower case, exactly as APFS
 * resolves `EN.html` to an existing `en.html`, and `foldingProbe` answers the handler's two
 * volume questions the way `realpath(3)` does on that volume. The first `describe` proves the
 * simulation reproduces the defect against Next's real `FileSystemCache`; the rest pin the rule.
 * The production-build regression is `tests/e2e/case-variant-cache.spec.ts`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import FileSystemCacheModule from "next/dist/server/lib/incremental-cache/file-system-cache.js";
import { nodeFs } from "next/dist/server/lib/node-fs-methods.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type CaseProbe,
  caseInsensitiveVolume,
  keyCollidesWithOtherCase,
  responseCacheFiles,
} from "../../src/lib/cache-key-case.ts";
import CspCacheHandler from "../../src/lib/csp-cache-handler.ts";

type FsMethods = typeof nodeFs;
type AtomicData = Parameters<NonNullable<FsMethods["writeFileAtomic"]>>[1];

/** `nodeFs`, with every path below `root` folded to lower case: a case-insensitive volume. */
function foldingFs(root: string): FsMethods {
  const fold = (file: string): string => {
    const rel = relative(root, file);
    return rel.startsWith("..") ? file : join(root, rel.toLowerCase());
  };
  const atomic = nodeFs.writeFileAtomic;
  return {
    ...nodeFs,
    existsSync: (file) => nodeFs.existsSync(fold(String(file))),
    readFile: ((file: string, ...rest: unknown[]) =>
      (nodeFs.readFile as (...args: unknown[]) => unknown)(
        fold(file),
        ...rest,
      )) as FsMethods["readFile"],
    readFileSync: ((file: string, ...rest: unknown[]) =>
      (nodeFs.readFileSync as (...args: unknown[]) => unknown)(
        fold(file),
        ...rest,
      )) as FsMethods["readFileSync"],
    writeFile: (file, data) => nodeFs.writeFile(fold(file), data),
    ...(atomic === undefined
      ? {}
      : {
          writeFileAtomic: (file: string, data: AtomicData) =>
            atomic(fold(file), data),
        }),
    mkdir: (dir) => nodeFs.mkdir(fold(dir)),
    stat: (file) => nodeFs.stat(fold(file)),
  };
}

/** What `realpath(3)` answers on that volume: the stored (lower-case) spelling, if anything is there. */
function foldingProbe(root: string, insensitive = true): CaseProbe {
  return {
    caseInsensitive: () => insensitive,
    trueCasePath: (file) => {
      const rel = relative(root, file);
      if (rel.startsWith("..")) return existsSync(file) ? file : undefined;
      const stored = join(root, rel.toLowerCase());
      return existsSync(stored) ? stored : undefined;
    },
  };
}

const FileSystemCache = ((
  FileSystemCacheModule as unknown as { default?: unknown }
).default ?? FileSystemCacheModule) as new (ctx: object) => {
  get(key: string, ctx: object): Promise<{ value: unknown } | null>;
  set(key: string, data: unknown, ctx: object): Promise<void>;
};

const HOME = "<!DOCTYPE html><html lang=en><title>Flowers Overseas</title>";
const NOT_FOUND = "<!DOCTYPE html><html lang=en><title>Page not found</title>";
const READ = { kind: "APP_PAGE", isRoutePPREnabled: false, isFallback: false };
const WRITE = { isRoutePPREnabled: false, isFallback: false };

const notFoundEntry = {
  kind: "APP_PAGE",
  html: NOT_FOUND,
  rscData: Buffer.from("0:{}"),
  headers: { "x-nextjs-prerender": "1" },
  status: 404,
  postponed: undefined,
  segmentData: undefined,
};

const htmlOf = (data: { value: unknown } | null): unknown =>
  (data?.value as { html?: unknown } | undefined)?.html;
const statusOf = (data: { value: unknown } | null): unknown =>
  (data?.value as { status?: unknown } | undefined)?.status;

describe("a case-insensitive cache volume", () => {
  let dist = "";
  let server = "";

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-case-"));
    server = join(dist, "server");
    // What `next build` leaves for the home page and one depth-2 page.
    for (const page of ["en", "en/occasions"]) {
      const base = join(server, "app", page);
      mkdirSync(join(base, ".."), { recursive: true });
      writeFileSync(`${base}.html`, HOME);
      writeFileSync(`${base}.rsc`, "0:{}");
      writeFileSync(
        `${base}.meta`,
        JSON.stringify({ headers: { "x-nextjs-prerender": "1" }, status: 200 }),
      );
    }
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  const ctx = (probe?: CaseProbe) => ({
    fs: foldingFs(server),
    serverDistDir: server,
    flushToDisk: true,
    dev: false,
    ...(probe === undefined ? {} : { caseProbe: probe }),
  });

  describe("reproduces the defect against Next's own FileSystemCache", () => {
    it("serves /EN the lowercase prerender, then lets /EN's 404 overwrite /en", async () => {
      const cache = new FileSystemCache(ctx());
      expect(htmlOf(await cache.get("/EN", READ))).toBe(HOME);

      await cache.set("/EN", notFoundEntry, WRITE);
      const after = await new FileSystemCache(ctx()).get("/en", READ);
      expect(statusOf(after)).toBe(404);
      expect(htmlOf(after)).toBe(NOT_FOUND);
    });
  });

  describe("CspCacheHandler keeps every key to its own file (TASK-247)", () => {
    const VARIANTS = ["/EN", "/En", "/en/Occasions", "/EN/OCCASIONS"];

    for (const variant of VARIANTS) {
      it(`${variant} is a miss, never the lowercase page`, async () => {
        const handler = new CspCacheHandler(ctx(foldingProbe(server)));
        expect(await handler.get(variant, READ)).toBeNull();
      });

      it(`${variant}'s 404 is never written over the lowercase page`, async () => {
        const handler = new CspCacheHandler(ctx(foldingProbe(server)));
        await handler.set(variant, notFoundEntry, WRITE);

        const lower = variant.toLowerCase();
        const after = await new CspCacheHandler(ctx(foldingProbe(server))).get(
          lower,
          READ,
        );
        expect(statusOf(after)).toBe(200);
        expect(htmlOf(after)).toBe(HOME);
      });
    }

    it("still serves and rewrites the lowercase page through its own key", async () => {
      const handler = new CspCacheHandler(ctx(foldingProbe(server)));
      expect(htmlOf(await handler.get("/en", READ))).toBe(HOME);

      // An ISR regeneration of the real page is written as before.
      await handler.set(
        "/en",
        { ...notFoundEntry, html: `${HOME}<p>regenerated`, status: 200 },
        WRITE,
      );
      expect(htmlOf(await handler.get("/en", READ))).toBe(
        `${HOME}<p>regenerated`,
      );
    });

    it("writes a variant whose file collides with nothing (a page the build never made)", async () => {
      const handler = new CspCacheHandler(ctx(foldingProbe(server)));
      await handler.set("/de", notFoundEntry, WRITE);
      expect(statusOf(await handler.get("/de", READ))).toBe(404);
    });

    it("checks nothing on a case-sensitive volume", async () => {
      // The probe says case-sensitive while the files fold: the handler must not consult the
      // true spelling at all, so it behaves as Next's own cache does (production on Linux).
      const handler = new CspCacheHandler(
        ctx(foldingProbe(server, /* insensitive */ false)),
      );
      expect(htmlOf(await handler.get("/EN", READ))).toBe(HOME);
    });
  });
});

describe("keyCollidesWithOtherCase", () => {
  const dist = "/srv/.next/server";
  const stored = new Set([
    "/srv/.next/server",
    "/srv/.next/server/app/en.html",
    "/srv/.next/server/app/en-XA.html",
    "/srv/.next/server/app/en/poland/product/amber-hour.html",
    "/srv/.next/server/app/route-cache/APP_PAGE/abc/$/en.html",
  ]);
  /** A case-insensitive volume holding exactly `stored`, spelled as stored. */
  const trueCase = (file: string): string | undefined =>
    [...stored].find((entry) => entry.toLowerCase() === file.toLowerCase());

  it.each([
    ["/EN", "APP_PAGE"],
    ["/en-xa", "APP_PAGE"],
    ["/en/Poland/product/amber-hour", "APP_PAGE"],
    ["/en/poland/product/AMBER-HOUR", "APP_PAGE"],
    ["/route-cache/APP_PAGE/abc/$/EN", "APP_PAGE"],
    ["/route-cache/APP_PAGE/other/$/EN", "APP_PAGE"],
  ])("%s collides with a file of another spelling", (key, kind) => {
    expect(keyCollidesWithOtherCase(dist, key, kind, trueCase)).toBe(true);
  });

  it.each([
    ["/en", "APP_PAGE"],
    ["/en-XA", "APP_PAGE"],
    ["/en/poland/product/amber-hour", "APP_PAGE"],
    ["/route-cache/APP_PAGE/abc/$/en", "APP_PAGE"],
    ["/en/nothing-here", "APP_PAGE"],
    ["/EN", "FETCH"],
    ["/EN", "IMAGE"],
  ])("%s (%s) collides with nothing", (key, kind) => {
    expect(keyCollidesWithOtherCase(dist, key, kind, trueCase)).toBe(false);
  });
});

describe("responseCacheFiles", () => {
  it("names the payload of each response kind and the build seed of a scoped key", () => {
    expect(responseCacheFiles("/en", "APP_PAGE")).toEqual(["app/en.html"]);
    expect(responseCacheFiles("/api/x", "APP_ROUTE")).toEqual([
      "app/api/x.body",
    ]);
    expect(responseCacheFiles("/en", "PAGES")).toEqual(["pages/en.html"]);
    expect(
      responseCacheFiles(
        "/route-cache/APP_PAGE/abc/$/en/occasions",
        "APP_PAGE",
      ),
    ).toEqual([
      "app/route-cache/APP_PAGE/abc/$/en/occasions.html",
      "app/en/occasions.html",
    ]);
    expect(responseCacheFiles("abc123", "FETCH")).toEqual([]);
  });
});

describe("caseInsensitiveVolume", () => {
  it("answers for the volume the directory is on, and false for a missing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "fo-vol-"));
    try {
      const server = join(dir, "server");
      mkdirSync(server);
      expect(caseInsensitiveVolume(server)).toBe(
        existsSync(join(dir, "SERVER")),
      );
      expect(caseInsensitiveVolume(join(dir, "absent"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
