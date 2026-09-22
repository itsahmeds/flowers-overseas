/**
 * `FAQPage`, built from the **same `faq` array the FAQ block renders** (spec 007 §2 "Schema",
 * §5.2 L65, AC-15; T-16; `plan/02` §9; TASK-093).
 *
 * `corridorView()` carries the authored Q&A once; `CorridorFaq` renders it as visible `<h3>` +
 * text with no accordion and nothing hidden; this builder copies the same strings into
 * `Question`/`Answer` nodes **untouched** — no trimming, no punctuation fix, no summary. That is
 * what makes AC-15's "character for character" assertion possible, and it is the whole reason the
 * FAQ has one source: Google's FAQ guidelines require the marked-up content to be visible on the
 * page, and a second copy of the copy is how sites drift out of that.
 *
 * **The 8–12 band is a gate, not a trim** (§2, AC-2): `pnpm corridor:check` already fails a file
 * outside it, so a view model outside the band means something upstream is wrong, and the honest
 * answer here is to emit **nothing** rather than to mark up a FAQ the page does not really have.
 * A blank question or answer is treated the same way: an `Answer` with no text describes no
 * visible answer.
 */
import type { JsonLdNode } from "./JsonLd.tsx";

/** One authored question and its answer (`FaqItem` in `modules/geo`, structurally). */
export interface FaqEntry {
  readonly q: string;
  readonly a: string;
}

/** The band `plan/02` §5.2 authorises and `corridor:check` enforces. */
export const FAQ_MIN_ITEMS = 8;
export const FAQ_MAX_ITEMS = 12;

export function faqPage(faq: readonly FaqEntry[]): JsonLdNode | undefined {
  if (faq.length < FAQ_MIN_ITEMS || faq.length > FAQ_MAX_ITEMS)
    return undefined;
  if (faq.some((item) => item.q.trim() === "" || item.a.trim() === "")) {
    return undefined;
  }

  return {
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
