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
 *  - {@link headStrings}, {@link headStructure} and {@link headOffences} are pure Node: they walk
 *    the JSON-LD and apply the **same patterns** the body sweep uses, never a second list, plus
 *    two head-only checks the body has no use for: partner marks, and review/rating *structure*
 *    (the keys and types of a rating node, whose values are numbers no text pattern reads).
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

/**
 * **Partner marks**, head only. Spec 007 AC-19 forbids a partner name; the body sweep
 * (`tests/e2e/honesty.spec.ts`) also lists `blumen`, `fleurs` and `kwiaciarnia`, which are ordinary
 * German, French and Polish words and would ban a legitimate title. A competitor *brand* is never
 * an ordinary word, so these are checked in every head. `kwiaciarnia` (Polish "florist's shop")
 * is here at the coordinator's instruction: no `<title>`, meta description or JSON-LD string of the
 * committed corpus uses it (its only uses are body copy: `messages/pl.json` `floristCount` and the
 * `pl` guide's body), so it is a ban nothing trips today.
 */
export const HEAD_PARTNER_NAMES: readonly HonestyPattern[] = [
  {
    name: "partner name",
    pattern: /\b(?:kwiaciarnia|interflora|euroflorist|fleurop)\b/iu,
  },
];

/** Ranking, delivery-timing and cutoff promises, AC-19's review-shaped claims, partner marks. */
export const HEAD_PATTERNS: readonly HonestyPattern[] = [
  ...FORBIDDEN_RANKING_TEXT,
  ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
  ...FORBIDDEN_REVIEW_SHAPES,
  ...HEAD_PARTNER_NAMES,
];

/** The `<meta>` tags that carry copy, as `[attribute, value]` selectors. */
export const HEAD_META: readonly (readonly [string, string])[] = [
  ["name", "description"],
  ["name", "keywords"],
  ["property", "og:title"],
  ["property", "og:description"],
  ["property", "og:site_name"],
  ["property", "og:image:alt"],
  ["name", "twitter:title"],
  ["name", "twitter:description"],
  ["name", "twitter:image:alt"],
];

/**
 * A review or rating by the *name* of a JSON-LD key, wherever it sits: its value is a number or a
 * node, which no text pattern reads (AC-19: review, rating, review count). Matched by shape, not
 * by a list of names, so `aggregateRating`, `reviewRating`, `ratingValue`, `bestRating`,
 * `reviewCount`, `ratingCount`, `reviewBody`, `UserReviews` and `interactionStatistic` are all
 * caught and the next one schema.org coins is too. `operatingSystem` is not: it has no capital
 * `R` and does not start with the word.
 */
export function isClaimKey(key: string): boolean {
  return (
    /^(?:review|rating)/iu.test(key) ||
    /[a-z](?:Review|Rating)/u.test(key) ||
    /^(?:interactionStatistic|userInteractionCount)$/iu.test(key)
  );
}

/**
 * A JSON-LD `@type` that is a review, a rating or an interaction count by itself: `Review`,
 * `CriticReview`, `UserReview`, `Rating`, `AggregateRating`, `EmployerAggregateRating`,
 * `InteractionCounter`.
 */
export function isClaimType(type: string): boolean {
  return isClaimKey(type) || /^InteractionCounter$/iu.test(type);
}

/** A claim planted into the live document by the sweep's own controls. */
export interface HeadPlant {
  readonly title?: string;
  readonly description?: string;
  /**
   * Becomes the whole of a new JSON-LD block, appended to `<body>` **as the app renders it**
   * (`JsonLd` sits in the page, not in `<head>`; a read of `document.head` alone saw none).
   */
  readonly jsonLd?: Record<string, unknown>;
  /** Becomes a new `<meta property="og:title">`, which a page without one never had. */
  readonly ogTitle?: string;
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
 * React #418). The only nodes it ever removes are the ones it created itself.
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
  if (plant.jsonLd !== undefined) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      ...plant.jsonLd,
    });
    document.body.append(script);
    restore.push(() => script.remove());
  }
  if (plant.ogTitle !== undefined) {
    const tag = document.createElement("meta");
    tag.setAttribute("property", "og:title");
    tag.setAttribute("content", plant.ogTitle);
    document.head.append(tag);
    restore.push(() => tag.remove());
  }
  const read: HeadRead = {
    title: document.title,
    metas: metas.flatMap(([attribute, value]) =>
      [...document.querySelectorAll(`meta[${attribute}="${value}"]`)].map(
        (tag) => ({ key: value, content: tag.getAttribute("content") ?? "" }),
      ),
    ),
    jsonLd: [
      ...document.querySelectorAll('script[type="application/ld+json"]'),
    ].map((script) => script.textContent ?? ""),
  };
  for (const undo of restore) undo();
  return read;
};

/**
 * A string that is a link, not prose: `url`, `sameAs`, `image`, `logo`, `@id` and the like. Only a
 * string with **no whitespace at all** that is an absolute `http(s)` URL, a protocol-relative one,
 * a `mailto:` address or a `tel:` number. "Tel: same-day delivery" is a sentence, and is read.
 */
export function isUriValue(text: string): boolean {
  if (/\s/u.test(text)) return false;
  if (/^\/\/[^/]\S*$/u.test(text)) return true;
  if (/^mailto:[^@]+@[^@]+$/iu.test(text)) return true;
  if (/^tel:\+?[\d().-]+$/iu.test(text)) return true;
  if (!/^https?:\/\//iu.test(text)) return false;
  try {
    return new URL(text).hostname !== "";
  } catch {
    return false;
  }
}

interface Walk {
  readonly strings: { source: string; text: string }[];
  readonly structure: string[];
}

/**
 * Every string under a parsed JSON-LD value, by the path it sits at, except URL-valued ones and
 * the `@`-keywords; and every review/rating key or type, wherever it sits.
 */
function walkJsonLd(value: unknown, path: string, out: Walk): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const at = `${path}[${index}]`;
      if (typeof item === "string") {
        if (!isUriValue(item)) out.strings.push({ source: at, text: item });
      } else walkJsonLd(item, at, out);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (key === "@type") {
      const types = Array.isArray(child) ? child : [child];
      if (types.some((type) => typeof type === "string" && isClaimType(type))) {
        out.structure.push(`${at}: review/rating type`);
      }
      continue;
    }
    // `@context`, `@id`, `@language`: keywords whose strings are not prose. `@value` is prose
    // (`{"@value": "...", "@language": "en"}`), and `@graph` and `@list` hold nodes, which are
    // walked like any other.
    if (key.startsWith("@") && key !== "@value" && typeof child === "string") {
      continue;
    }
    if (isClaimKey(key)) {
      out.structure.push(`${at}: review/rating key`);
    }
    if (typeof child === "string") {
      if (!isUriValue(child)) out.strings.push({ source: at, text: child });
    } else walkJsonLd(child, at, out);
  }
}

function walked(read: HeadRead): Walk {
  const out: Walk = { strings: [], structure: [] };
  read.jsonLd.forEach((block, index) => {
    // A block that is not JSON is a defect the scan must not hide behind a silent skip.
    walkJsonLd(JSON.parse(block) as unknown, `json-ld[${index}]`, out);
  });
  return out;
}

/**
 * What a reader sees, not what the bytes are: composed (NFC) so a decomposed `ś` is one letter,
 * every dash-like character folded to `-` so "same\u2011day" is "same-day", the soft hyphen and
 * the zero-width characters dropped, and whitespace (a no-break space included) collapsed to one
 * space.
 */
export function normaliseHeadText(text: string): string {
  return text
    .normalize("NFC")
    .replaceAll(/[\u00AD\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replaceAll(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** Every head string a claim could sit in, each with the place it was read from. */
export function headStrings(
  read: HeadRead,
): readonly { readonly source: string; readonly text: string }[] {
  return [
    { source: "title", text: read.title },
    ...read.metas.map(({ key, content }) => ({ source: key, text: content })),
    ...walked(read).strings,
  ].map(({ source, text }) => ({ source, text: normaliseHeadText(text) }));
}

/** Review and rating keys and types in the JSON-LD, each with the path it sits at. */
export function headStructure(read: HeadRead): readonly string[] {
  return walked(read).structure;
}

/** `"<source>: <pattern name>"` for every pattern that matches a head string; `[]` when clean. */
export function headOffences(read: HeadRead): readonly string[] {
  return [
    ...headStrings(read).flatMap(({ source, text }) =>
      HEAD_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
        ({ name }) => `${source}: ${name}`,
      ),
    ),
    ...headStructure(read),
  ];
}
