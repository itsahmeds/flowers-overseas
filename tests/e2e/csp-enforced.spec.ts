/**
 * The enforced Content-Security-Policy, in a real browser, over the real build (spec 004 §14 A2,
 * AC-23 enforcement half, ADR-0016; TASK-058).
 *
 * Two claims, and each is the one the other cannot make:
 *
 *  1. **Hydration survives enforcement.** With `CSP_REPORT_ONLY=false` the server sends
 *     `Content-Security-Policy` on every cached document — the static policy plus the
 *     `'sha256-…'` of that document's inline scripts, Next's `self.__next_f.push(…)` flight blocks
 *     included (`src/lib/csp-response.ts`). If one flight block were missing from the list the
 *     browser would refuse it, the RSC payload would never complete, and React would never mount
 *     the consent sheet — which exists only after hydration (`consent-banner.spec.ts`). So the
 *     sheet appearing *and answering a click* is the hydration proof, and zero
 *     `securitypolicyviolation` events under the enforcing policy is the completeness proof.
 *  2. **The policy actually blocks**, in both places a script can be added: to the stored HTML
 *     **before** it is hashed (stored XSS — only Next's flight pushes are ever hashed, so it stays
 *     unauthorised) and to the response **after** it was hashed (an edge or MITM rewrite). Neither
 *     may run, and the browser must say why.
 *
 * ## Its own server
 *
 * The suite's origin (`PLAYWRIGHT_BASE_URL`, `pnpm start` locally and the CI-owned origin of
 * `.github/actions/preview-origin`) runs Report-Only, as production does until the runbook's
 * evidence step passes, and `security-headers.spec.ts` pins that. So this file starts a second
 * `next start` over the **same `.next` build** with `CSP_REPORT_ONLY=false` — the flag is read at
 * run time by the cache handler, so no second build exists — on a port of its own, and stops it
 * by its own PID in `afterAll`. It needs that build in the working directory; where there is
 * none (a run pointed at a remote deployment) it skips and says so rather than passing.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, expect, test } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "../..");
const NEXT_BIN = resolve(ROOT, "node_modules/.bin/next");
const BUILD_ID = resolve(ROOT, ".next/BUILD_ID");
/** Well clear of the suite's `:3000`; one port per parallel worker, so two projects never clash. */
const BASE_PORT = 3158;

/**
 * One document per response class the cache handler stamps: a locale home (SSG), a country shop
 * listing (ISR, depth 3) and a product page (ISR, depth 4, `dynamicParams = true`).
 */
const PAGES = [
  "/en",
  "/de/polen/blumen",
  "/en/poland/product/amber-hour",
] as const;

/**
 * Prerendered product pages the stored-injection case edits, one per project. Not in `PAGES` and
 * not named by any other spec, so nothing else reads them through this worker's server first.
 */
const STORED_INJECTION_PAGES: Readonly<Record<string, string>> = {
  "e2e-desktop": "/en/poland/product/baltic-dawn",
  "e2e-mobile": "/en/poland/product/northern-light",
};

const SHOWN = '[data-fo-consent="shown"]';
const REJECT = '[data-fo-consent-action="reject"]';
const SAVED = '[data-fo-consent="saved"]';

interface Violation {
  readonly directive: string;
  readonly blocked: string;
  readonly disposition: string;
}

declare global {
  interface Window {
    __foCspViolations?: Violation[];
    __foInjected?: number;
    __foStoredInjected?: number;
  }
}

let server: ChildProcess | undefined;
let origin = "";

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`next start exited with ${String(server.exitCode)}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${url}/api/health did not answer 200 within 60 s`);
}

/** Record every CSP violation the document raises, from before its first script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__foCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__foCspViolations?.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        disposition: event.disposition,
      });
    });
    // The sheet is the hydration marker; it must not be pre-empted by the language suggestion.
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
}

const violations = (page: Page): Promise<Violation[]> =>
  page.evaluate(() => window.__foCspViolations ?? []);

/** `script-src` of a policy, as its list of sources. */
function scriptSources(policy: string): string[] {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src "));
  return directive?.split(/\s+/u).slice(1) ?? [];
}

test.describe("enforced CSP over the real build (TASK-058)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, workerInfo) => {
    test.skip(
      !existsSync(BUILD_ID) || !existsSync(NEXT_BIN),
      "needs `pnpm build` output in the working directory to start an enforcing server",
    );
    const port = BASE_PORT + workerInfo.parallelIndex;
    origin = `http://localhost:${String(port)}`;
    server = spawn(NEXT_BIN, ["start", "-p", String(port)], {
      cwd: ROOT,
      env: { ...process.env, CSP_REPORT_ONLY: "false", PORT: String(port) },
      stdio: "ignore",
    });
    await waitForHealth(origin);
  });

  test.afterAll(() => {
    // Stopped by its own PID — never by name (CLAUDE.md, "Stop what you start").
    if (server?.pid !== undefined && server.exitCode === null) {
      server.kill("SIGTERM");
    }
  });

  for (const path of PAGES) {
    test(`${path}: hydrates under the enforcing policy with zero violations`, async ({
      page,
    }) => {
      await recordViolations(page);
      const response = await page.goto(`${origin}${path}`);
      expect(response?.status()).toBe(200);

      const headers = response?.headers() ?? {};
      const policy = headers["content-security-policy"] ?? "";
      expect(policy, "no enforcing header on a cached document").not.toBe("");
      // Strict where it matters: no `'unsafe-inline'` (it would let any inline script run when
      // the hash list is empty) and no `'unsafe-eval'`.
      expect(scriptSources(policy)).not.toContain("'unsafe-inline'");
      expect(scriptSources(policy)).not.toContain("'unsafe-eval'");

      // Every inline script the browser received is authorised by name. Recomputed in the page
      // from the DOM the parser built, not from our own hashing code.
      const inlineDigests = await page.evaluate(async () => {
        const scripts = [...document.querySelectorAll("script:not([src])")]
          .filter((element) => {
            const type = (element.getAttribute("type") ?? "").toLowerCase();
            return (
              type === "" || type === "text/javascript" || type === "module"
            );
          })
          .map((element) => element.textContent ?? "");
        const digests: string[] = [];
        for (const text of scripts) {
          const bytes = new TextEncoder().encode(text);
          const hash = await crypto.subtle.digest("SHA-256", bytes);
          digests.push(
            `'sha256-${btoa(String.fromCharCode(...new Uint8Array(hash)))}'`,
          );
        }
        return digests;
      });
      const flightBlocks = await page.evaluate(
        () =>
          [...document.querySelectorAll("script:not([src])")].filter(
            (element) => (element.textContent ?? "").includes("self.__next_f"),
          ).length,
      );
      expect(flightBlocks, "the document has no flight blocks").toBeGreaterThan(
        0,
      );
      for (const digest of inlineDigests) {
        expect(scriptSources(policy), digest).toContain(digest);
      }

      // Hydrated: the consent sheet only exists after React mounts, and it answers a click.
      await expect(page.locator(SHOWN)).toBeVisible();
      await page.locator(REJECT).click();
      await expect(page.locator(SAVED)).toBeAttached();

      expect(
        (await violations(page)).filter(
          (violation) => violation.disposition === "enforce",
        ),
      ).toEqual([]);
    });
  }

  test("blocks an inline script added to the response after it was hashed", async ({
    page,
  }) => {
    await recordViolations(page);
    const target = `${origin}/en`;
    // The served document, headers untouched, with one script added before `</body>` on its way to
    // the browser: the shape of an edge or man-in-the-middle rewrite **after** the server hashed.
    // A script that is already in the HTML when it is cached is the next case.
    await page.route(target, async (route) => {
      const original = await route.fetch();
      const headers = { ...original.headers() };
      delete headers["content-length"];
      delete headers["content-encoding"];
      const body = (await original.text()).replace(
        "</body>",
        "<script>window.__foInjected=1</script></body>",
      );
      await route.fulfill({ status: original.status(), headers, body });
    });

    const response = await page.goto(target);
    expect(response?.headers()["content-security-policy"]).toBeDefined();
    await expect(page.locator(SHOWN)).toBeVisible();

    expect(await page.evaluate(() => window.__foInjected)).toBeUndefined();
    expect(await violations(page)).toContainEqual({
      directive: "script-src-elem",
      blocked: "inline",
      disposition: "enforce",
    });
  });

  // `/review 196` item 1 and 2, `/break 196` hole 1: a stored XSS — a script that reaches the
  // server-rendered HTML through content (a florist field, a CMS body, a JSON-LD escape bug) — is
  // in the document **before** the cache handler hashes it. Only Next's own flight pushes may be
  // hashed, so this one must stay unauthorised and be blocked. The payload is written into the
  // prerendered entry on disk before this worker's enforcing server first reads that page, and the
  // original bytes are put back afterwards. One page per project, so the two projects running in
  // parallel never edit the same file; the payload is inert on any other server that reads it.
  test("blocks a script that was in the stored HTML before it was hashed (stored XSS)", async ({
    page,
  }, testInfo) => {
    const path = STORED_INJECTION_PAGES[testInfo.project.name];
    test.skip(path === undefined, "no stored-injection page for this project");
    const file = resolve(ROOT, `.next/server/app${path ?? ""}.html`);
    const original = readFileSync(file, "utf8");
    const payload = "<script>window.__foStoredInjected=1</script>";
    expect(original).toContain("</body>");
    writeFileSync(file, original.replace("</body>", `${payload}</body>`));
    try {
      await recordViolations(page);
      const response = await page.goto(`${origin}${path ?? ""}`);
      expect(response?.status()).toBe(200);
      // The server really served the stored payload, under an enforcing header that does not
      // name it — and the rest of the document still hydrates.
      expect(await response?.text()).toContain(payload);
      const policy = response?.headers()["content-security-policy"] ?? "";
      expect(policy).not.toBe("");
      expect(scriptSources(policy)).not.toContain(
        `'sha256-${createHash("sha256").update("window.__foStoredInjected=1", "utf8").digest("base64")}'`,
      );
      await expect(page.locator(SHOWN)).toBeVisible();

      expect(
        await page.evaluate(() => window.__foStoredInjected),
      ).toBeUndefined();
      expect(await violations(page)).toContainEqual({
        directive: "script-src-elem",
        blocked: "inline",
        disposition: "enforce",
      });
    } finally {
      writeFileSync(file, original);
    }
  });

  // `/review 196` item 4: the enforcing server says so on `/api/health`.
  test("reports `cspEnforce: ok` on /api/health", async ({ request }) => {
    const body = (await (await request.get(`${origin}/api/health`)).json()) as {
      cspEnforce?: string;
    };
    expect(body.cspEnforce).toBe("ok");
  });
});
