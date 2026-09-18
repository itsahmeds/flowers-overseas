/**
 * Seed the visitor's recorded language choice (spec 003 §2, §14 A14; TASK-119).
 *
 * Since §14 A14 the locale suggestion is a **modal** `<dialog>`: on a first visit to a locale that
 * the browser's own languages do not name, it opens over the page and — by design — the page
 * behind it is inert until the visitor answers. A Playwright runner is configured `en-US`, so
 * every test that visits `/de`, `/pl` or `/en-gb` and then *clicks* something is racing the
 * island's mount, and a race is not a test.
 *
 * The fix is the one a returning visitor already has: `fo_locale`. A recorded choice silences the
 * suggestion for a year (`decideSuggestion` → `reason: "cookie"`), so seeding it puts the browser
 * in the state the test is actually about — someone who has been here before — and changes nothing
 * else: the cookie never varies a response, never redirects and is not read by the server
 * (AC-9, AC-12, ADR-0006).
 *
 * The suggestion's own behaviour is covered where it belongs, with no cookie seeded:
 * `tests/e2e/banner.spec.ts` and `tests/a11y/banner.spec.ts`.
 */
import type { BrowserContext } from "@playwright/test";

export async function recordLocaleChoice(
  context: BrowserContext,
  locale: string,
  baseURL: string | undefined,
): Promise<void> {
  const url = new URL(baseURL ?? "http://localhost:3000");
  await context.addCookies([
    { name: "fo_locale", value: locale, domain: url.hostname, path: "/" },
  ]);
}
