/**
 * `pnpm cache:warm` and the publish job's warm (spec 012b §2.3, AC-7: "every added URL is
 * requested exactly once"; TASK-296).
 */
import { describe, expect, it, vi } from "vitest";

import { runCacheWarm } from "../../scripts/cache-warm";
import { warmUrls } from "../../src/lib/cache-warm";
import { existenceManifestOf } from "../../src/lib/existence";

const BASE = "https://staging.flowersoverseas.com";

/** A fetch that answers `status` for every request and records what it was asked. */
function fakeFetch(status: (url: string) => number = () => 200) {
  const requested: string[] = [];
  const impl = vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input.href : String(input);
    requested.push(`${init?.method ?? "GET"} ${url}`);
    return Promise.resolve(new Response(null, { status: status(url) }));
  });
  return { impl: impl as unknown as typeof fetch, requested };
}

describe("warmUrls", () => {
  it("requests each distinct path exactly once, with GET, through the base", async () => {
    const fake = fakeFetch();
    const outcome = await warmUrls(
      ["/en/poland/product/amber-hour", "/en", "/en/poland/product/amber-hour"],
      fake.impl,
      BASE,
    );
    expect(fake.requested).toStrictEqual([
      `GET ${BASE}/en/poland/product/amber-hour`,
      `GET ${BASE}/en`,
    ]);
    expect(outcome).toStrictEqual({ ok: 2, failed: 0 });
  });

  it("counts a non-2xx answer and a network error as failed, and never throws", async () => {
    const fake = fakeFetch((url) => (url.endsWith("/gone") ? 404 : 200));
    const throwing = vi.fn(() => Promise.reject(new Error("offline")));
    expect(await warmUrls(["/en", "/en/gone"], fake.impl, BASE)).toStrictEqual({
      ok: 1,
      failed: 1,
    });
    expect(
      await warmUrls(["/en"], throwing as unknown as typeof fetch, BASE),
    ).toStrictEqual({ ok: 0, failed: 1 });
  });

  it("refuses anything that is not a site path, without requesting it", async () => {
    const fake = fakeFetch();
    const outcome = await warmUrls(
      ["https://evil.example/x", "//evil.example/x", "/en?x=1", "en"],
      fake.impl,
      BASE,
    );
    expect(fake.requested).toStrictEqual([]);
    expect(outcome).toStrictEqual({ ok: 0, failed: 4 });
  });
});

describe("pnpm cache:warm", () => {
  it("warms the given paths through --base and prints the counts, never a URL", async () => {
    const fake = fakeFetch();
    const run = await runCacheWarm(
      ["--base", BASE, "/en", "/de"],
      {},
      fake.impl,
    );
    expect(run.code).toBe(0);
    expect(fake.requested).toStrictEqual([`GET ${BASE}/en`, `GET ${BASE}/de`]);
    expect(run.stdout).toBe('{"msg":"cache.warm","ok":2,"failed":0}\n');
  });

  it("warms every URL of a manifest file, and NEXT_PUBLIC_SITE_URL is the default base", async () => {
    const fake = fakeFetch();
    const manifest = existenceManifestOf(
      ["/en", "/en/-product/poland/product/amber-hour"],
      null,
    );
    const run = await runCacheWarm(
      ["--manifest", "/x/existence-manifest.json"],
      { NEXT_PUBLIC_SITE_URL: BASE },
      fake.impl,
      () => JSON.stringify(manifest),
    );
    expect(run.code).toBe(0);
    expect(fake.requested).toStrictEqual([
      `GET ${BASE}/en`,
      `GET ${BASE}/en/poland/product/amber-hour`,
    ]);
  });

  it("exits 1 when a path fails, 2 without a base, without a path, or with a forged manifest", async () => {
    const failing = fakeFetch(() => 500);
    expect(
      (await runCacheWarm(["--base", BASE, "/en"], {}, failing.impl)).code,
    ).toBe(1);
    const fake = fakeFetch();
    expect((await runCacheWarm(["/en"], {}, fake.impl)).code).toBe(2);
    expect((await runCacheWarm(["--base", BASE], {}, fake.impl)).code).toBe(2);
    const forged = { ...existenceManifestOf(["/en"], null), urls: ["/de"] };
    const run = await runCacheWarm(
      ["--base", BASE, "--manifest", "/x.json"],
      {},
      fake.impl,
      () => JSON.stringify(forged),
    );
    expect(run.code).toBe(2);
    expect(fake.requested).toStrictEqual([]);
  });
});
