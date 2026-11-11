/**
 * Spec 012b T-27 (AC-27) and T-29 (AC-29), TASK-301: slice A's copy, records and declarations.
 *
 * T-27: every `admin.catalogue`, `admin.media`, `admin.countries`, `admin.publish` and
 * `admin.review` key the code names resolves in `messages/admin/en.json` (a full key to a string,
 * a prefix the code completes at run time to a group), and no public catalogue or meta file
 * (`messages/{en,en-gb,de,pl}.json`, `*.meta.json`) holds a key of those namespaces. The diff half
 * ("no slice A PR changed a public catalogue") is a fact about merged history, which a depth-1 CI
 * checkout cannot read; it was checked once over the slice A merges and is recorded in the brief.
 *
 * T-29: the backup warning (production only; shown at 49 h and when absent, not at 47 h), on every
 * page of the four sections and on no other; the runbook exists and is indexed; the RoPA carries
 * spec 012b §8's flows; `.env.example`, the env schema and the Railway variable contract carry the
 * three keys, with `PUBLISH_TARGET`'s and the token's boot rules.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkEnvFile } from "../../scripts/env-check.ts";
import { loadDeclaredConfig } from "../../scripts/railway-check.ts";
import {
  BUILD_CREDENTIAL_ENV_KEYS,
  ENV_KEYS,
  RUNTIME_ENV_KEYS,
  validateBuildEnv,
  validateRuntimeEnv,
} from "../../src/lib/env.schema.ts";
import {
  CONTRACT_KEYS_NOT_REQUIRED,
  REQUIRED_VARIABLE_KEYS,
  compareVariableKeys,
} from "../../src/lib/railway.ts";
import {
  BACKUP_WARNING_MAX_AGE_HOURS,
  backupWarningDue,
  catalogueBackupWarning,
} from "../../src/modules/admin/backup.ts";
import { adminMessages } from "../../src/modules/admin/messages.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve({
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Founder Test",
      roles: ["admin" as const],
      timeZone: "Europe/Tallinn",
    });
  return {
    ...actual,
    requireAdminPage: (
      permission?: Parameters<typeof actual.requireAdminPage>[0],
    ) => actual.requireAdminPage(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
    listCountries: () => Promise.resolve([]),
  };
});

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (file: string): string =>
  readFileSync(join(repoRoot, file), "utf8");

function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap((entry) => {
    const path = join(repoRoot, dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");
});

/* -------------------------------------------------------------------------- */
/* T-27                                                                        */
/* -------------------------------------------------------------------------- */

const NAMESPACES_012B = [
  "catalogue",
  "media",
  "countries",
  "publish",
  "review",
] as const;

/** `admin.x.y` in the admin catalogue: the string, the group, or `undefined`. */
function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      adminMessages,
    );
}

const KEY_PATTERN =
  /["'`](admin\.(?:catalogue|media|countries|publish|review)(?![A-Za-z0-9_])(?:\.[A-Za-z0-9_]+)*\.?)(\$\{)?/gu;

const sources = walk("src").filter((f) => /\.tsx?$/u.test(f));
const named = sources.flatMap((file) =>
  [...read(file).matchAll(KEY_PATTERN)].map((match) => {
    const text = match[1] ?? "";
    const prefix = match[2] !== undefined || text.endsWith(".");
    return { file, key: text.replace(/\.$/u, ""), prefix };
  }),
);

describe("T-27 — slice A's copy is admin copy (AC-27)", () => {
  it("finds the keys the catalogue, photos, countries and publish templates name", () => {
    expect(named.length).toBeGreaterThan(200);
    for (const namespace of ["catalogue", "media", "countries", "publish"]) {
      expect(
        named.some(({ key }) => key.startsWith(`admin.${namespace}.`)),
        namespace,
      ).toBe(true);
    }
  });

  it("resolves every full key to a string in messages/admin/en.json", () => {
    const missing = named
      .filter(({ prefix }) => !prefix)
      .filter(({ key }) => typeof lookup(key) !== "string")
      .map(({ file, key }) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it("resolves every prefix the code completes at run time to a group of strings", () => {
    const missing = named
      .filter(({ prefix }) => prefix)
      .filter(({ key }) => {
        const group = lookup(key);
        return typeof group !== "object" || group === null;
      })
      .map(({ file, key }) => `${file}: ${key}.*`);
    expect(missing).toEqual([]);
  });

  it.each(["en", "en-gb", "de", "pl"])(
    "puts no 012b key in messages/%s.json or its meta file",
    (locale) => {
      const catalogue = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const meta = JSON.parse(read(`messages/${locale}.meta.json`)) as Record<
        string,
        unknown
      >;
      const admin = catalogue["admin"];
      for (const namespace of NAMESPACES_012B) {
        expect(
          typeof admin === "object" && admin !== null && namespace in admin,
          namespace,
        ).toBe(false);
        expect(
          Object.keys(meta).filter((key) =>
            key.startsWith(`admin.${namespace}.`),
          ),
        ).toEqual([]);
      }
    },
  );

  it("ships the backup warning's two strings in the admin catalogue only", () => {
    expect(lookup("admin.catalogue.backupWarning.title")).toBe(
      "No checked backup in the last 48 hours.",
    );
    expect(lookup("admin.catalogue.backupWarning.body")).toBe(
      "The database is the only copy of the catalogue. Check the nightly backup before you edit.",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-29: the backup warning                                                     */
/* -------------------------------------------------------------------------- */

const NOW = new Date("2026-11-11T12:00:00.000Z");
const hoursAgo = (hours: number): Date =>
  new Date(NOW.getTime() - hours * 3_600_000);

describe("T-29 — the backup warning (AC-29)", () => {
  it("is due in production at 49 h and when no verification exists, not at 47 h or at 48 h", () => {
    expect(BACKUP_WARNING_MAX_AGE_HOURS).toBe(48);
    const due = (lastVerifiedAt: Date | null) =>
      backupWarningDue({ environment: "production", lastVerifiedAt, now: NOW });
    expect(due(hoursAgo(49))).toBe(true);
    expect(due(null)).toBe(true);
    expect(due(hoursAgo(47))).toBe(false);
    expect(due(hoursAgo(48))).toBe(false);
  });

  it.each(["staging", "preview", "development", "test"] as const)(
    "is never due in %s, whatever the record says, and reads nothing there",
    async (environment) => {
      expect(
        backupWarningDue({ environment, lastVerifiedAt: null, now: NOW }),
      ).toBe(false);
      const read = vi.fn(() => Promise.resolve(null));
      expect(
        await catalogueBackupWarning({
          environment,
          lastVerifiedAt: read,
          now: () => NOW,
        }),
      ).toBe(false);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("reads the record in production and decides on it", async () => {
    const at = (date: Date | null) =>
      catalogueBackupWarning({
        environment: "production",
        lastVerifiedAt: () => Promise.resolve(date),
        now: () => NOW,
      });
    expect(await at(hoursAgo(49))).toBe(true);
    expect(await at(hoursAgo(47))).toBe(false);
    expect(await at(null)).toBe(true);
  });

  const SECTIONS =
    /^src\/app\/admin\/\(signed-in\)\/(catalogue|media|countries|publish)\//u;
  const pages = walk("src/app/admin").filter((f) => /\/page\.tsx$/u.test(f));
  const PASSES = "backupWarning={await catalogueBackupWarning()}";

  it("is asked for by every page of the four sections, and by no other admin page", () => {
    const inSections = pages.filter((f) => SECTIONS.test(f));
    expect(inSections).toHaveLength(8);
    for (const page of inSections) expect(read(page), page).toContain(PASSES);
    for (const page of pages.filter((f) => !SECTIONS.test(f))) {
      expect(read(page), page).not.toContain("catalogueBackupWarning");
    }
  });

  async function countriesHtml(): Promise<string> {
    const { default: CountriesPage } =
      await import("../../src/app/admin/(signed-in)/countries/page.tsx");
    return renderToStaticMarkup(await CountriesPage());
  }

  it("shows on a section page in production while no backup is verified", async () => {
    vi.stubEnv("APP_ENV", "production");
    const html = await countriesHtml();
    expect(html).toContain("data-backup-warning");
    expect(html).toContain("No checked backup in the last 48 hours.");
    expect(html).toContain(
      "The database is the only copy of the catalogue. Check the nightly backup before you edit.",
    );
  });

  it("is absent from the same page in staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const html = await countriesHtml();
    expect(html).not.toContain("data-backup-warning");
    expect(html).not.toContain("No checked backup");
  });
});

/* -------------------------------------------------------------------------- */
/* T-29: records and declarations                                               */
/* -------------------------------------------------------------------------- */

const KEYS_012B = [
  "DATABASE_BUILD_URL",
  "PUBLISH_TARGET",
  "RAILWAY_PUBLISH_TOKEN",
] as const;

describe("T-29 — runbook, RoPA, env and Railway (AC-29)", () => {
  it("has docs/runbooks/catalogue.md, indexed by link in the runbook README", () => {
    const runbook = read("docs/runbooks/catalogue.md");
    expect(runbook).toMatch(/^# Runbook: the catalogue in admin/u);
    for (const topic of [
      "PUBLISH_TARGET",
      "RAILWAY_PUBLISH_TOKEN",
      "DATABASE_BUILD_URL",
      "backup warning",
      "catalogue:parity",
    ]) {
      expect(runbook, topic).toContain(topic);
    }
    expect(read("docs/runbooks/README.md")).toContain("](catalogue.md)");
  });

  it("carries spec 012b §8's three flows in the RoPA", () => {
    const ropa = read("docs/compliance/ropa.md");
    const row = (n: number): string =>
      ropa.split("\n").find((line) => line.startsWith(`| ${String(n)} |`)) ??
      "";
    expect(row(25)).toContain("Reviewers and review attestations");
    expect(row(25)).toContain("3 years after `admin_profile.deactivated_at`");
    expect(row(25)).toContain("012b");
    expect(row(26)).toContain("Florist photos and payouts in the catalogue");
    expect(row(26)).toContain("Art. 6(1)(b)");
    expect(ropa).toContain(
      "**Spec 012b (catalogue CMS): Railway as publish target sends no personal data.**",
    );
  });

  it("declares the three keys in .env.example and the env schema, in agreement", () => {
    const report = checkEnvFile(join(repoRoot, ".env.example"));
    expect(report.missingKeys).toEqual([]);
    expect(report.unknownKeys).toEqual([]);
    const example = read(".env.example");
    for (const key of KEYS_012B) {
      expect(ENV_KEYS, key).toContain(key);
      expect(example, key).toMatch(new RegExp(`^${key}=$`, "mu"));
    }
    expect(BUILD_CREDENTIAL_ENV_KEYS).toEqual(["DATABASE_BUILD_URL"]);
    expect(RUNTIME_ENV_KEYS).toEqual(
      expect.arrayContaining(["PUBLISH_TARGET", "RAILWAY_PUBLISH_TOKEN"]),
    );
  });

  it("asks Railway for the three keys in staging and production, and a PR environment for the target only", () => {
    expect(loadDeclaredConfig(repoRoot).deploy.healthcheckPath).toBe(
      "/api/health",
    );
    for (const key of KEYS_012B)
      expect(REQUIRED_VARIABLE_KEYS, key).toContain(key);
    expect(CONTRACT_KEYS_NOT_REQUIRED.preview).toEqual([
      "DATABASE_BUILD_URL",
      "RAILWAY_PUBLISH_TOKEN",
    ]);
    expect(
      compareVariableKeys(
        REQUIRED_VARIABLE_KEYS.filter(
          (key) => !KEYS_012B.includes(key as never),
        ),
        "production",
      ).missing,
    ).toEqual([...KEYS_012B]);
  });

  const issueKeys = (source: Record<string, string>): string[] =>
    validateRuntimeEnv(source)
      .issues.map((issue) => issue.key)
      .filter((key) => (KEYS_012B as readonly string[]).includes(key));

  it.each(["production", "staging"])(
    "refuses PUBLISH_TARGET=fake in %s, naming the key and no value",
    (environment) => {
      const { issues } = validateRuntimeEnv({
        APP_ENV: environment,
        PUBLISH_TARGET: "fake",
      });
      const issue = issues.find((i) => i.key === "PUBLISH_TARGET");
      expect(issue?.message).toMatch(/must not be `fake`/u);
    },
  );

  it("accepts PUBLISH_TARGET=fake in preview and test, and none or blank anywhere", () => {
    expect(issueKeys({ APP_ENV: "preview", PUBLISH_TARGET: "fake" })).toEqual(
      [],
    );
    expect(issueKeys({ APP_ENV: "test", PUBLISH_TARGET: "fake" })).toEqual([]);
    expect(
      issueKeys({ APP_ENV: "production", PUBLISH_TARGET: "none" }),
    ).toEqual([]);
    expect(issueKeys({ APP_ENV: "production", PUBLISH_TARGET: "" })).toEqual(
      [],
    );
  });

  it("refuses an unknown PUBLISH_TARGET everywhere", () => {
    expect(
      issueKeys({ APP_ENV: "development", PUBLISH_TARGET: "vercel" }),
    ).toEqual(["PUBLISH_TARGET"]);
  });

  it.each(["production", "staging", "preview"])(
    "refuses PUBLISH_TARGET=railway without its token in %s, and accepts it with one",
    (environment) => {
      const token = "railway-token-sentinel-value";
      const without = validateRuntimeEnv({
        APP_ENV: environment,
        PUBLISH_TARGET: "railway",
      }).issues.find((i) => i.key === "RAILWAY_PUBLISH_TOKEN");
      expect(without?.message).toMatch(/is required/u);
      const withToken = validateRuntimeEnv({
        APP_ENV: environment,
        PUBLISH_TARGET: "railway",
        RAILWAY_PUBLISH_TOKEN: token,
      }).issues;
      expect(
        withToken.filter((i) => i.key === "RAILWAY_PUBLISH_TOKEN"),
      ).toEqual([]);
      expect(JSON.stringify(withToken)).not.toContain(token);
    },
  );

  it("refuses a DATABASE_BUILD_URL that is not a postgres:// string at build, naming the key and no value", () => {
    const value = "https://not-a-database.example.test/secret-sentinel";
    const { issues } = validateBuildEnv({
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://staging.flowersoverseas.com",
      DATABASE_BUILD_URL: value,
    });
    expect(issues.map((issue) => issue.key)).toContain("DATABASE_BUILD_URL");
    expect(JSON.stringify(issues)).not.toContain("secret-sentinel");
    expect(
      validateBuildEnv({
        APP_ENV: "staging",
        NEXT_PUBLIC_SITE_URL: "https://staging.flowersoverseas.com",
        DATABASE_BUILD_URL: "postgres://app_build:pw@db.example.test/fo",
      }).issues.map((issue) => issue.key),
    ).not.toContain("DATABASE_BUILD_URL");
  });
});
