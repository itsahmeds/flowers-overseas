/**
 * The recorded Stripe fixtures (spec 013 AC-27, T-27; TASK-260): they live under
 * `tests/contract/fixtures/stripe/<api-version>/`, the one directory is named after the adapter's
 * pinned version, and no file holds an email address or a phone number other than Stripe's own
 * documented test values.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STRIPE_API_VERSION } from "../../src/modules/payments/stripe/version.ts";

const ROOT = resolve(import.meta.dirname, "../contract/fixtures/stripe");

/** Stripe's documented test values (docs.stripe.com/testing): allowed in fixtures. */
const STRIPE_TEST_VALUES: readonly RegExp[] = [
  /^jenny\.rosen@example\.com$/i,
  /^[a-z0-9._+-]+@example\.(com|org|net|test)$/i,
  /^\+15555550100$/,
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * An international number: `+` and eight or more digits, spaces and separators allowed. A bare
 * digit run is not matched: the fixtures hold Stripe's 16-digit test card numbers and dates.
 */
const PHONE = /\+\d[\d\s().-]{6,}\d/g;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

/** Strings found by `pattern` in JSON string values only (numbers such as amounts are not text). */
function matches(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const literal of text.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    for (const hit of (literal[1] ?? "").matchAll(pattern)) out.push(hit[0]);
  }
  return out;
}

describe("Stripe fixtures (AC-27, T-27)", () => {
  it("one directory, named after the pinned API version", () => {
    expect(readdirSync(ROOT)).toEqual([STRIPE_API_VERSION]);
  });

  it("no email address or phone number other than Stripe's documented test values", () => {
    const found: string[] = [];
    for (const file of files(ROOT).filter((name) => name.endsWith(".json"))) {
      const text = readFileSync(file, "utf8");
      for (const email of matches(text, EMAIL)) {
        if (!STRIPE_TEST_VALUES.some((allowed) => allowed.test(email))) {
          found.push(`${file}: ${email}`);
        }
      }
      for (const phone of matches(text, PHONE)) {
        const compact = phone.replace(/[\s().-]/g, "");
        if (!STRIPE_TEST_VALUES.some((allowed) => allowed.test(compact))) {
          found.push(`${file}: ${phone}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("the scan finds what it is for", () => {
    const sample = JSON.stringify({
      email: "anna.kowalska@gmail.com",
      phone: "+48 601 234 567",
    });
    expect(matches(sample, EMAIL)).toEqual(["anna.kowalska@gmail.com"]);
    expect(matches(sample, PHONE)).toEqual(["+48 601 234 567"]);
  });
});
