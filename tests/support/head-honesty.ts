/**
 * **The head half of the honesty sweep** (spec 004 §14 A19; spec 007 AC-19 widened to `<head>`;
 * TASK-145).
 *
 * `tests/e2e/chrome-honesty.spec.ts` reads `document.body.innerText`, which cannot see `<head>`.
 * Since TASK-112 the hubs, and since TASK-127 the product page, render authored `seoTitle` and
 * `seoDescription` copy into `<title>` and `<meta name="description">`, so those are page surface
 * nothing scanned. This file is the read and the judgement, split so each half can be tested:
 *
 *  - {@link HEAD_READ} is the one in-browser read: every head string a claim could sit in, as the
 *    served document has it, plus the raw text of every JSON-LD block. It returns data only.
 *  - {@link headStrings} and {@link headOffences} are pure Node: they walk the JSON-LD and apply
 *    the **same patterns** the body sweep uses, never a second list.
 *
 * The scan reads what exists. A page with no `og:` or `twitter:` tags contributes none, and the
 * sweep's own control (a claim planted into the title, the description and a JSON-LD block, read
 * through the same function) is what proves the read can see each of them.
 */
import {
  FORBIDDEN_DELIVERY_PROMISE_TEXT,
  FORBIDDEN_RANKING_TEXT,
  FORBIDDEN_REVIEW_SHAPES,
  type HonestyPattern,
} from "./listing-honesty.ts";

/** Ranking, delivery-timing and cutoff promises, and spec 007 AC-19's review-shaped claims. */
export const HEAD_PATTERNS: readonly HonestyPattern[] = [
  ...FORBIDDEN_RANKING_TEXT,
  ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
  ...FORBIDDEN_REVIEW_SHAPES,
];

/** The `<meta>` tags that carry copy, as `[attribute, value]` selectors. */
export const HEAD_META: readonly (readonly [string, string])[] = [
  ["name", "description"],
  ["property", "og:title"],
  ["property", "og:description"],
  ["name", "twitter:title"],
  ["name", "twitter:description"],
];

/** The JSON-LD keys that hold prose. Every other key is a URL, a type or an identifier. */
export const JSON_LD_PROSE_KEYS: readonly string[] = [
  "name",
  "description",
  "headline",
  "text",
];

/** A claim planted into the live head by the sweep's own controls. */
export interface HeadPlant {
  readonly title?: string;
  readonly description?: string;
  /** Becomes a `description` inside a new JSON-LD block, as a real node's would be. */
  readonly jsonLdDescription?: string;
}

/** What one read of the head returns: raw, so the walk stays testable without a browser. */
export interface HeadRead {
  readonly title: string;
  readonly metas: readonly { readonly key: string; readonly content: string }[];
  readonly jsonLd: readonly string[];
}

/**
 * The one read, run by `page.evaluate`. **Read and plant in one synchronous call**: it sets the
 * planted values, reads, and restores before returning, so nothing interleaves and the DOM left
 * behind is the one the server sent (the `/review 135` round 1 rule; a removed server node is
 * React #418). The only node it ever removes is the JSON-LD script it created itself.
 */
export const HEAD_READ = ({
  plant,
  metas,
}: {
  plant: HeadPlant;
  metas: readonly (readonly [string, string])[];
}): HeadRead => {
  const restore: (() => void)[] = [];
  if (plant.title !== undefined) {
    const before = document.title;
    document.title = plant.title;
    restore.push(() => {
      document.title = before;
    });
  }
  if (plant.description !== undefined) {
    const tag = document.querySelector('meta[name="description"]');
    if (tag === null) throw new Error("no meta description to plant into");
    const before = tag.getAttribute("content");
    tag.setAttribute("content", plant.description);
    restore.push(() => {
      if (before === null) tag.removeAttribute("content");
      else tag.setAttribute("content", before);
    });
  }
  if (plant.jsonLdDescription !== undefined) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      description: plant.jsonLdDescription,
    });
    document.head.append(script);
    restore.push(() => script.remove());
  }
  const read: HeadRead = {
    title: document.title,
    metas: metas.flatMap(([attribute, value]) =>
      [...document.head.querySelectorAll(`meta[${attribute}="${value}"]`)].map(
        (tag) => ({ key: value, content: tag.getAttribute("content") ?? "" }),
      ),
    ),
    jsonLd: [
      ...document.head.querySelectorAll('script[type="application/ld+json"]'),
    ].map((script) => script.textContent ?? ""),
  };
  for (const undo of restore) undo();
  return read;
};

/** Every prose string under a parsed JSON-LD value, by the path it sits at. */
function proseIn(
  value: unknown,
  path: string,
  out: { source: string; text: string }[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => proseIn(item, `${path}[${index}]`, out));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      if (JSON_LD_PROSE_KEYS.includes(key)) {
        out.push({ source: `${path}.${key}`, text: child });
      }
    } else proseIn(child, `${path}.${key}`, out);
  }
}

/** Every head string a claim could sit in, each with the place it was read from. */
export function headStrings(
  read: HeadRead,
): readonly { readonly source: string; readonly text: string }[] {
  const out: { source: string; text: string }[] = [
    { source: "title", text: read.title },
    ...read.metas.map(({ key, content }) => ({ source: key, text: content })),
  ];
  read.jsonLd.forEach((block, index) => {
    // A block that is not JSON is a defect the scan must not hide behind a silent skip.
    proseIn(JSON.parse(block) as unknown, `json-ld[${index}]`, out);
  });
  return out.map(({ source, text }) => ({
    source,
    text: text.replaceAll(/\s+/gu, " ").trim(),
  }));
}

/** `"<source>: <pattern name>"` for every pattern that matches a head string; `[]` when clean. */
export function headOffences(read: HeadRead): readonly string[] {
  return headStrings(read).flatMap(({ source, text }) =>
    HEAD_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
      ({ name }) => `${source}: ${name}`,
    ),
  );
}
