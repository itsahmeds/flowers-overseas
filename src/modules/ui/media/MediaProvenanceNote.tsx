/**
 * `MediaProvenanceNote` — the honesty label (spec 006 §2.5 "Honesty label", §8, §14 **A2**,
 * **AC-17**; ADR-0014's standing condition; `plan/07` §2.1/§2.2; `plan/10` §3; TASK-079).
 *
 * "Example arrangement · **our** florist hand-makes each one" (§14 A2 — the pronoun is spec 004
 * §14 A5's first person; the disclosure is unchanged), from the message key
 * `media.provenance.aiExample`, rendered whenever a page displays at least one asset whose
 * `source` is `ai`.
 *
 * Four properties, each of them a requirement rather than a preference:
 *
 *  - **It cannot be switched off.** The prop type admits **no** suppression flag, no `variant`
 *    that hides it and no `className` that could be given `hidden` — ADR-0014 accepted
 *    AI-generated catalogue imagery *conditional on honest labelling*, and a label a template can
 *    disable is not a condition. Product images a florist will not literally reproduce are a
 *    misleading action under the UCPD (2005/29) and the CRD's "main characteristics" duty, and
 *    under the UK DMCC 2024's equivalents (`plan/07` §2.1/§2.2).
 *  - **It follows the assets the page actually *displays*.** It asks the same `isDisplayable()`
 *    the `<picture>` asked, so a page whose assets all degraded to placeholders renders no label —
 *    correctly, because it is showing no generated image — and a page that displays one renders
 *    one label. That is also what keeps the structured data and the visible page in agreement
 *    (`plan/02` §15): both read one view model.
 *  - **It is server-rendered text.** No island, no client JavaScript, present in the HTML before
 *    hydration in all four locales, and therefore crawlable (AC-17).
 *  - **It is never mirrored.** It is text, and `@utility mirror-in-rtl` is for direction-carrying
 *    icons only (spec 006 §7); under `dir="rtl"` it reads in the reading order of its own locale.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Text } from "../primitives/typography.tsx";

import { type MediaManifest, assetById } from "./manifest.ts";
import { isDisplayable } from "./resolve.ts";

/**
 * The props, and the whole of them: the assets the page is displaying and the locale it is
 * displaying them in. Adding a boolean here is the change a reviewer must refuse.
 */
export interface MediaProvenanceNoteProps {
  /** Every asset id the page renders — in any slot, in any order. */
  readonly assetIds: readonly string[];
  readonly locale: string;
  /**
   * The manifest the page resolved its images against, where that is not the committed one
   * (`/dev/components`; see `./manifest.ts`). It changes *which* assets are displayed, never
   * whether a displayed generated image is labelled.
   */
  readonly manifest?: MediaManifest;
}

/**
 * Does this page owe the label? Exported because spec 009's PDP and spec 008's grids need the
 * same answer for their own layout decisions, and because a test can ask it directly.
 */
export function needsAiProvenanceNote(
  assetIds: readonly string[],
  locale: string,
  manifest?: MediaManifest,
): boolean {
  return assetIds.some(
    (assetId) =>
      (manifest === undefined
        ? assetById(assetId)
        : assetById(assetId, manifest)
      )?.source === "ai" && isDisplayable(assetId, locale, manifest),
  );
}

export function MediaProvenanceNote({
  assetIds,
  locale,
  manifest,
}: MediaProvenanceNoteProps): ReactElement | null {
  const t = useTranslations("media");
  if (!needsAiProvenanceNote(assetIds, locale, manifest)) return null;
  return (
    // The marker is on a wrapper because `Text` takes no `data-*` attributes (it is a type
    // primitive, not an attribute pass-through) and this label needs to be findable by a
    // reviewer, an e2e assertion and TASK-080's honesty grep without matching translated copy.
    <div data-fo-media-provenance="ai">
      <Text size="sm" tone="muted">
        {t("provenance.aiExample")}
      </Text>
    </div>
  );
}
