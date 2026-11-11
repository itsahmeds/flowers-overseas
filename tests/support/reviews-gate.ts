/**
 * Spec 022a AC-28's gate (TASK-373): review words are admitted only inside a `[data-fo-reviews]`
 * region and in the two footer links, and only while the data condition holds. A region on a page
 * whose scope has zero published reviews is itself a finding (a planted block is red), and a review
 * word anywhere outside a region is a finding, as `FORBIDDEN_REVIEW_SHAPES` always made it.
 *
 * No DOM here (the component tests run in Node): a region is the element that carries the
 * attribute, to its balanced closing tag.
 */
import { FORBIDDEN_REVIEW_SHAPES, textOf } from "./listing-honesty.ts";

/** Every `[data-fo-reviews]` element's outer HTML, outermost first. */
export function reviewRegions(html: string): string[] {
  const regions: string[] = [];
  const opening =
    /<([a-z][a-z0-9]*)\b[^>]*\sdata-fo-reviews(?:=(?:""|"[^"]*"))?[^>]*>/giu;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(html)) !== null) {
    const tag = match[1] ?? "";
    const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "giu");
    tags.lastIndex = match.index;
    let depth = 0;
    let end = html.length;
    let inner: RegExpExecArray | null;
    while ((inner = tags.exec(html)) !== null) {
      depth += inner[1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = inner.index + inner[0].length;
        break;
      }
    }
    regions.push(html.slice(match.index, end));
    opening.lastIndex = end;
  }
  return regions;
}

export interface ReviewsGateInput {
  readonly html: string;
  /** Published reviews of the page's scope (the data condition). */
  readonly published: number;
  /** The footer link texts admitted while their page exists ("Reviews", "Review policy"). */
  readonly footerLinks?: readonly string[];
}

/** What the gate finds; empty is green. */
export function reviewsGateFindings({
  html,
  published,
  footerLinks = [],
}: ReviewsGateInput): string[] {
  const regions = reviewRegions(html);
  const findings: string[] = [];
  if (regions.length > 0 && published === 0) {
    findings.push("a [data-fo-reviews] region with zero published reviews");
  }
  let outside = html;
  for (const region of regions) outside = outside.replace(region, " ");
  if (published > 0) {
    for (const label of footerLinks) {
      outside = outside.replace(new RegExp(`>\\s*${label}\\s*<`, "gu"), "> <");
    }
  }
  const text = textOf(outside);
  for (const { name, pattern } of FORBIDDEN_REVIEW_SHAPES) {
    if (pattern.test(text)) findings.push(`${name} outside [data-fo-reviews]`);
  }
  return findings;
}
