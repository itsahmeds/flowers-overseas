/**
 * `validate-sitemap` (spec 001 §2 "CI", §6, AC-22 / T-23, TASK-009).
 *
 * Over `tests/fixtures/seo/sitemap/*.xml` (or `--dir <path>`):
 *
 * 1. the file is well-formed XML;
 * 2. it contains at least one `<loc>`;
 * 3. every `<loc>` is an absolute `https://` URL (`plan/02` §10: sitemaps carry absolute,
 *    canonical, indexable URLs — a relative or `http://` entry is a bug Search Console reports
 *    days later);
 * 4. no `<loc>` appears in the directory's optional `noindex.json` (`{ "noindex": [url, …] }` or
 *    a bare array) — a URL cannot be both `noindex` and a sitemap member (ADR-0007, `plan/02`
 *    §10).
 *
 * Well-formedness comes from `fast-xml-parser`'s `XMLValidator` rather than a hand-rolled
 * scanner: it reports the offending line and column, and mismatched-tag/attribute-quoting rules
 * are exactly the kind of thing a 40-line regex parser gets subtly wrong — this gate has to be
 * trustworthy, because from spec 007 it is the only thing standing between a broken sitemap and
 * Googlebot. It is a devDependency: it never enters the application bundle.
 *
 * Usage: `node scripts/seo/validate-sitemap.ts [--dir tests/fixtures/seo/sitemap]`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

import {
  displayPath,
  exitWith,
  formatZodError,
  isMainModule,
  runValidator,
  type FixtureProblem,
} from "./lib.ts";

export const DEFAULT_DIR = "tests/fixtures/seo/sitemap";
export const NOINDEX_FILE = "noindex.json";

/** `noindex.json`: the URLs that must never appear in a sitemap in the same directory. */
export const noindexFixtureSchema = z.union([
  z.array(z.string().min(1)),
  z.object({ noindex: z.array(z.string().min(1)) }),
]);

export function noindexUrls(
  parsed: z.infer<typeof noindexFixtureSchema>,
): string[] {
  return (Array.isArray(parsed) ? parsed : parsed.noindex).map((url) =>
    url.trim(),
  );
}

/** Every `<loc>` text value in a parsed sitemap or sitemap index, in document order. */
export function collectLocs(node: unknown): string[] {
  if (typeof node === "string") return [];
  if (Array.isArray(node)) return node.flatMap((child) => collectLocs(child));
  if (node === null || typeof node !== "object") return [];
  const locs: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") {
      for (const entry of Array.isArray(value) ? value : [value]) {
        if (typeof entry === "string") locs.push(entry.trim());
      }
      continue;
    }
    locs.push(...collectLocs(value));
  }
  return locs;
}

/** The reason a `<loc>` is unacceptable, or `null` when it is fine. */
export function locProblem(loc: string): string | null {
  if (loc === "") return "empty <loc>";
  if (/\s/.test(loc))
    return `<loc> contains whitespace: ${JSON.stringify(loc)}`;
  let url: URL;
  try {
    url = new URL(loc);
  } catch {
    return `<loc> is not an absolute URL: ${loc}`;
  }
  if (url.protocol !== "https:") {
    return `<loc> must be https://, found ${url.protocol}//: ${loc}`;
  }
  return null;
}

const noindexCache = new Map<
  string,
  { urls: string[]; error: string | null }
>();

function noindexFor(dir: string): { urls: string[]; error: string | null } {
  const cached = noindexCache.get(dir);
  if (cached !== undefined) return cached;
  const path = join(dir, NOINDEX_FILE);
  let result: { urls: string[]; error: string | null } = {
    urls: [],
    error: null,
  };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    noindexCache.set(dir, result);
    return result;
  }
  try {
    const parsed = noindexFixtureSchema.safeParse(JSON.parse(raw));
    result = parsed.success
      ? { urls: noindexUrls(parsed.data), error: null }
      : {
          urls: [],
          error: `${displayPath(path)} does not match the noindex fixture shape (${formatZodError(parsed.error)})`,
        };
  } catch (error) {
    result = {
      urls: [],
      error: `${displayPath(path)} is not valid JSON (${(error as Error).message})`,
    };
  }
  noindexCache.set(dir, result);
  return result;
}

export function validateSitemapFile(
  path: string,
  file: string,
): readonly FixtureProblem[] {
  const problems: FixtureProblem[] = [];
  const xml = readFileSync(path, "utf8");

  const wellFormed = XMLValidator.validate(xml, {
    allowBooleanAttributes: false,
  });
  if (wellFormed !== true) {
    const { msg, line, col } = wellFormed.err;
    return [
      {
        file,
        reason: `not well-formed XML at line ${String(line)}, column ${String(col)}: ${msg}`,
      },
    ];
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    // URLs are strings: without this, `fast-xml-parser` would coerce a numeric-looking text
    // node and the https check would see a number.
    parseTagValue: false,
    trimValues: true,
  });
  const locs = collectLocs(parser.parse(xml));
  if (locs.length === 0) {
    problems.push({ file, reason: "contains no <loc> element" });
  }

  const { urls: noindex, error: noindexError } = noindexFor(dirname(path));
  if (noindexError !== null) problems.push({ file, reason: noindexError });

  for (const loc of locs) {
    const reason = locProblem(loc);
    if (reason !== null) problems.push({ file, reason });
    else if (noindex.includes(loc)) {
      problems.push({
        file,
        reason: `<loc> is listed in ${NOINDEX_FILE} and must not be in a sitemap: ${loc}`,
      });
    }
  }
  return problems;
}

export function main(argv: readonly string[]): number {
  noindexCache.clear();
  return runValidator(
    {
      name: "validate-sitemap",
      defaultDir: DEFAULT_DIR,
      extension: ".xml",
      validateFile: validateSitemapFile,
    },
    argv,
  );
}

if (isMainModule(import.meta.url)) exitWith(main(process.argv.slice(2)));
