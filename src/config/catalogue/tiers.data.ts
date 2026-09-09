/**
 * The tier structure of the 84 seeded products (spec 005 §2 "Tiers and add-ons", §13 Q4/Q6;
 * `plan/10` §2.2; TASK-061).
 *
 * One group per product, so that "exactly one default tier" and "sort 0…n-1" are **parse errors**
 * rather than a CLI's later opinion (`ProductTierGroupSchema`): the one-per-product partial unique
 * index spec 002 §14 A1 (b) adds exists for the same reason, and the two now agree by
 * construction. The **middle** tier is the preselected one (spec 005 §13 Q6, `plan/04` §16's
 * anchor-pricing baseline); a single-tier plant defaults to its only tier.
 *
 * Tier shapes, per spec 005 §13 Q4:
 *
 * | Product type | Tiers | Example |
 * |---|---|---|
 * | bouquet, gift_set | stem counts, three of them | roses 12/18/24, tulips 15/25/35 (`plan/10` §2.2) |
 * | arrangement, funeral | `size_s` / `size_m` / `size_l` | a box, a wreath — a stem count would misdescribe it |
 * | plant | `single` | one orchid is one orchid |
 *
 * Stem counts per flower are the plausible florist quantities behind `plan/10` §2.2's two worked
 * examples: roses 12/18/24 and tulips 15/25/35 are that section's own; lilies (5/8/12), peonies
 * (9/15/21), sunflowers (5/9/13), gerberas (10/15/21), hydrangeas (3/5/7) and the rest follow the
 * same "a bunch, a generous bunch, a statement" progression at that flower's stem size.
 *
 * **There is no price here and no percentage anywhere.** `plan/10` §2.3's ~+30%/+60% steps are
 * authored `country_price` rows (TASK-062), because a percentage applied at render is a float and
 * a rounding bug (spec 005 §5.2) — and a stepped amount that no row carries could not be
 * superseded, which the Omnibus 30-day history needs.
 */
import {
  type ProductTierGroup,
  type ProductTierRecord,
  ProductTierRegistrySchema,
} from "./schemas.ts";

const tierGroups = [
  {
    sku: "FO-BQ-001",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-002",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-003",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-004",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-005",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-006",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-007",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-008",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-009",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-010",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-011",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-012",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-013",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-014",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-015",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_8",
        labelKey: "catalog.tier.stems",
        stems: 8,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-016",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_8",
        labelKey: "catalog.tier.stems",
        stems: 8,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-017",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_8",
        labelKey: "catalog.tier.stems",
        stems: 8,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-018",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_8",
        labelKey: "catalog.tier.stems",
        stems: 8,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-019",
    tiers: [
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-020",
    tiers: [
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-021",
    tiers: [
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-022",
    tiers: [
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-023",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_13",
        labelKey: "catalog.tier.stems",
        stems: 13,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-024",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_13",
        labelKey: "catalog.tier.stems",
        stems: 13,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-025",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_13",
        labelKey: "catalog.tier.stems",
        stems: 13,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-026",
    tiers: [
      {
        tierKey: "stems_10",
        labelKey: "catalog.tier.stems",
        stems: 10,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-027",
    tiers: [
      {
        tierKey: "stems_10",
        labelKey: "catalog.tier.stems",
        stems: 10,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-028",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-029",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-030",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-031",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-032",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-033",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-034",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-035",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-036",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-037",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-038",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-039",
    tiers: [
      {
        tierKey: "stems_3",
        labelKey: "catalog.tier.stems",
        stems: 3,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_7",
        labelKey: "catalog.tier.stems",
        stems: 7,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-BQ-040",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-001",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-002",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-003",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-004",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-005",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-006",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-007",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-008",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-009",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-010",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-011",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-012",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-013",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-AR-014",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-PT-001",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-002",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-003",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-004",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-005",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-006",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-007",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-PT-008",
    tiers: [
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ],
  },
  {
    sku: "FO-FN-001",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-002",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-003",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-004",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-005",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-006",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-007",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-008",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-009",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-FN-010",
    tiers: [
      {
        tierKey: "size_s",
        labelKey: "catalog.tier.size.s",
        stems: null,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "size_m",
        labelKey: "catalog.tier.size.m",
        stems: null,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "size_l",
        labelKey: "catalog.tier.size.l",
        stems: null,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-001",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-002",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-003",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-004",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-005",
    tiers: [
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_25",
        labelKey: "catalog.tier.stems",
        stems: 25,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_35",
        labelKey: "catalog.tier.stems",
        stems: 35,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-006",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-007",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_13",
        labelKey: "catalog.tier.stems",
        stems: 13,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-008",
    tiers: [
      {
        tierKey: "stems_9",
        labelKey: "catalog.tier.stems",
        stems: 9,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-009",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-010",
    tiers: [
      {
        tierKey: "stems_10",
        labelKey: "catalog.tier.stems",
        stems: 10,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_15",
        labelKey: "catalog.tier.stems",
        stems: 15,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_21",
        labelKey: "catalog.tier.stems",
        stems: 21,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-011",
    tiers: [
      {
        tierKey: "stems_5",
        labelKey: "catalog.tier.stems",
        stems: 5,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_8",
        labelKey: "catalog.tier.stems",
        stems: 8,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 2,
        isDefault: false,
      },
    ],
  },
  {
    sku: "FO-GS-012",
    tiers: [
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ],
  },
] as const;

/** Parsed at module load, one group per product. */
export const PRODUCT_TIER_GROUPS: readonly ProductTierGroup[] =
  ProductTierRegistrySchema.parse(tierGroups);

/**
 * The same tiers as flat `product_tier` records — each tier plus the SKU of the product it belongs
 * to. This is what the static provider hands over and what `toProductTierRow()` projects; the
 * grouped form above is what a human edits.
 */
export const PRODUCT_TIERS: readonly ProductTierRecord[] =
  PRODUCT_TIER_GROUPS.flatMap((group) =>
    group.tiers.map((tier) => ({ sku: group.sku, ...tier })),
  );

/** The tiers of one product, in `sort` order. Throws on an unknown SKU: the set is closed data. */
export function tiersForSku(sku: string): readonly ProductTierRecord[] {
  const tiers = PRODUCT_TIERS.filter((tier) => tier.sku === sku);
  if (tiers.length === 0) {
    throw new Error(`no tiers for product sku: ${sku}`);
  }
  return tiers;
}

/** The preselected tier of one product (spec 002 §14 A1 (b)'s `product_tier.is_default`). */
export function defaultTierForSku(sku: string): ProductTierRecord {
  const tier = tiersForSku(sku).find((candidate) => candidate.isDefault);
  if (tier === undefined) {
    throw new Error(`no default tier for product sku: ${sku}`);
  }
  return tier;
}
