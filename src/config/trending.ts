/**
 * The florists' picks the "Most sent this week" row shows until real orders rank it (spec 004
 * §13's 2026-09-08 resolution note "'Most sent this week' row gated on real orders (florists'
 * picks until then, labelled)", §3, AC-14, AC-15; TASK-054;
 * `docs/design/homepage-v1/homepage-desktop.dc.html`).
 *
 * **This file is a list of five SKUs and nothing else, and that is deliberate.** Spec 004 §3 says
 * 004 ships "nothing that knows what a product is": no price, no facet, no product type, no
 * description, no link, no `Offer`. So the row's data is *five references* into the committed
 * catalogue (`src/config/catalogue/products.data.ts`, spec 005's authored dataset), and the only
 * thing the UI reads through them is the pick's **name** — which is content the founder's dataset
 * already carries and this file therefore cannot invent, mistype or let drift.
 *
 * Two consequences worth reading before editing:
 *
 *  - **A pick is never a link.** Spec 008 owns the shop, so nothing here carries a slug or a
 *    published flag; the row renders text, and the home keeps zero internal links to a non-200
 *    URL (AC-14). When 008 publishes product pages it replaces the *provider*
 *    (`src/modules/ui/home/trending-provider.ts`) rather than this file.
 *  - **Emptying this array hides the row.** `TrendingRow` renders nothing when the provider
 *    answers with no picks, which is the whole point of the seam: the founder (or the reviewer)
 *    can withdraw the claim "our florists picked these" without a code change, and spec 008/016
 *    swaps in a provider backed by real orders in the last seven days with no call-site change.
 *
 * Unknown SKUs fail at module load (`productBySku` throws), so a pick that the catalogue does not
 * contain is a failed build rather than an empty card.
 */
import { z } from "zod";

/** `plan/10` §4's natural key, as `products.data.ts` writes it (`FO-BQ-001`). */
const SkuSchema = z
  .string()
  .regex(
    /^FO-[A-Z]{2}-\d{3}$/u,
    "must be a catalogue SKU of the form `FO-BQ-001` (plan/10 §4)",
  );

const TrendingPickSchema = z
  .object({
    /** Stable id for the DOM hook and the tests; the SKU is not a public identifier. */
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "must be a lowercase slug"),
    sku: SkuSchema,
  })
  .strict();

export const TrendingRegistrySchema = z
  .array(TrendingPickSchema)
  .max(5, "the artboard's row is five cards wide; a sixth would wrap")
  .superRefine((picks, ctx) => {
    const seen = new Set<string>();
    picks.forEach((pick, index) => {
      if (seen.has(pick.sku)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "sku"],
          message: `duplicate pick \`${pick.sku}\``,
        });
      }
      seen.add(pick.sku);
    });
  });

export type TrendingPickConfig = z.infer<typeof TrendingRegistrySchema>[number];

/**
 * The five picks, in the order the desktop artboard draws its row. They are the catalogue's
 * classic bouquets rather than its funeral pieces or gift sets, because the row's sentence is
 * "most sent" and a merchandising row that leads with a wreath is a different page.
 */
const picks = [
  { id: "amber-hour", sku: "FO-BQ-001" },
  { id: "vistula-red", sku: "FO-BQ-002" },
  { id: "baltic-dawn", sku: "FO-BQ-003" },
  { id: "quiet-blush", sku: "FO-BQ-004" },
  { id: "northern-light", sku: "FO-BQ-005" },
] as const;

/** Parsed at module load: a malformed list throws on first import, never at request time. */
export const TRENDING_PICKS: readonly TrendingPickConfig[] =
  TrendingRegistrySchema.parse(picks);
