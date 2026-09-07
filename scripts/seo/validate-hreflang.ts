/**
 * `validate-hreflang` (spec 001 §2 "CI", §6, AC-22 / T-23, TASK-009).
 *
 * Over `tests/fixtures/seo/hreflang/*.json` (or `--dir <path>`), fixture shape:
 *
 * ```json
 * { "pages": [{ "url": "https://…/de/…", "alternates": [{ "hreflang": "de", "href": "https://…" },
 *                                                       { "hreflang": "x-default", "href": "…" }] }] }
 * ```
 *
 * Checks (`plan/02` §7, `plan/03` §11):
 *
 * 1. every `hreflang` is `x-default` or a BCP-47-ish `lang[-script][-region]` tag;
 * 2. every `url`/`href` is an absolute `https://` URL — a relative alternate is silently ignored
 *    by Google;
 * 3. **reciprocity**: each alternate points at a page that is present in the same fixture and
 *    that links back to the referring page. One missing back-link makes the whole cluster
 *    invalid, which is why the check is a gate rather than a warning;
 * 4. **`x-default` presence**: every page in a cluster carries an `x-default` alternate. Because
 *    (3) forces a cluster to be fully described inside one fixture, "per cluster" and "per page"
 *    are the same assertion here, and the per-page form names the offending URL.
 *
 * URLs are compared as exact strings after trimming: `…/de/` and `…/de` are different URLs to a
 * crawler, so normalising them away would hide the bug this validator exists to catch.
 *
 * Usage: `node scripts/seo/validate-hreflang.ts [--dir tests/fixtures/seo/hreflang]`
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

import {
  exitWith,
  formatZodError,
  isMainModule,
  runValidator,
  type FixtureProblem,
} from "./lib.ts";

export const DEFAULT_DIR = "tests/fixtures/seo/hreflang";
export const X_DEFAULT = "x-default";

export const hreflangFixtureSchema = z.object({
  pages: z
    .array(
      z.object({
        url: z.string().min(1),
        alternates: z
          .array(
            z.object({ hreflang: z.string().min(1), href: z.string().min(1) }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type HreflangFixture = z.infer<typeof hreflangFixtureSchema>;

/**
 * BCP-47-ish: 2–3 letter language, optional 4-letter script, optional 2-letter or 3-digit
 * region. Deliberately not the full registry (`sr-Latn-RS` passes, `de-Deutschland` does not);
 * spec 003 owns the locale list itself.
 */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/;

export function isValidHreflang(value: string): boolean {
  const tag = value.trim().toLowerCase();
  return tag === X_DEFAULT || LANGUAGE_TAG.test(tag);
}

export function isAbsoluteHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/** Problems in the link graph of one fixture: reciprocity and `x-default` presence. */
export function graphProblems(fixture: HreflangFixture): string[] {
  const problems: string[] = [];
  const byUrl = new Map<string, ReadonlySet<string>>();
  for (const page of fixture.pages) {
    byUrl.set(
      page.url.trim(),
      new Set(page.alternates.map((alternate) => alternate.href.trim())),
    );
  }
  for (const page of fixture.pages) {
    const url = page.url.trim();
    if (
      !page.alternates.some(
        (alternate) => alternate.hreflang.trim().toLowerCase() === X_DEFAULT,
      )
    ) {
      problems.push(`${url}: cluster has no ${X_DEFAULT} alternate`);
    }
    for (const alternate of page.alternates) {
      const href = alternate.href.trim();
      if (href === url) continue;
      const target = byUrl.get(href);
      if (target === undefined) {
        problems.push(
          `${url}: alternate ${alternate.hreflang} -> ${href} has no page entry in this fixture, so reciprocity cannot hold`,
        );
        continue;
      }
      if (!target.has(url)) {
        problems.push(
          `${url}: alternate ${alternate.hreflang} -> ${href} is not reciprocal (${href} does not link back to ${url})`,
        );
      }
    }
  }
  return problems;
}

export function validateHreflangFile(
  path: string,
  file: string,
): readonly FixtureProblem[] {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return [
      { file, reason: `is not valid JSON (${(error as Error).message})` },
    ];
  }
  const parsed = hreflangFixtureSchema.safeParse(data);
  if (!parsed.success) {
    return [
      {
        file,
        reason: `does not match the hreflang fixture shape (${formatZodError(parsed.error)})`,
      },
    ];
  }

  const problems: FixtureProblem[] = [];
  for (const page of parsed.data.pages) {
    const url = page.url.trim();
    if (!isAbsoluteHttpsUrl(url)) {
      problems.push({
        file,
        reason: `${url}: url is not an absolute https:// URL`,
      });
    }
    for (const alternate of page.alternates) {
      if (!isValidHreflang(alternate.hreflang)) {
        problems.push({
          file,
          reason: `${url}: ${JSON.stringify(alternate.hreflang)} is not a valid hreflang value (expected ${X_DEFAULT} or lang[-script][-region])`,
        });
      }
      if (!isAbsoluteHttpsUrl(alternate.href)) {
        problems.push({
          file,
          reason: `${url}: alternate ${alternate.hreflang} href is not an absolute https:// URL: ${alternate.href}`,
        });
      }
    }
  }
  for (const reason of graphProblems(parsed.data)) {
    problems.push({ file, reason });
  }
  return problems;
}

export function main(argv: readonly string[]): number {
  return runValidator(
    {
      name: "validate-hreflang",
      defaultDir: DEFAULT_DIR,
      extension: ".json",
      validateFile: validateHreflangFile,
    },
    argv,
  );
}

if (isMainModule(import.meta.url)) exitWith(main(process.argv.slice(2)));
