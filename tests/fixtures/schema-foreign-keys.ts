/**
 * The foreign keys of migrations `0005` and `0006` (spec 002 §5.1; TASK-018, round 1 of PR 200,
 * breaker hole 3): name, columns, parent table, parent columns, delete rule.
 *
 * One list, asserted three ways: against the SQL text and the Drizzle mirror
 * (`tests/unit/schema-partners-customers.test.ts`) and against the live catalogue's `confdeltype`
 * (`tests/integration/schema-partners-customers.test.ts`). Changing a delete rule means changing
 * this file, which the reviewer sees.
 */

/**
 * §5.1: deletes `RESTRICT`, and `CASCADE` only from a parent to its own translation rows, so the
 * one `CASCADE` is `partner_translation`. A buyer's recipients and addresses never go with the
 * buyer.
 */
export const FOREIGN_KEYS: readonly (readonly [
  string,
  string,
  string,
  string,
  string,
])[] = [
  [
    "fulfillment_partner_country_id_country_id_fk",
    "country_id",
    "country",
    "id",
    "RESTRICT",
  ],
  [
    "fulfillment_partner_payout_currency_code_currency_code_fk",
    "payout_currency_code",
    "currency",
    "code",
    "RESTRICT",
  ],
  [
    "partner_translation_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "CASCADE",
  ],
  [
    "partner_translation_locale_code_locale_code_fk",
    "locale_code",
    "locale",
    "code",
    "RESTRICT",
  ],
  [
    "partner_member_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  [
    "partner_coverage_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  ["partner_coverage_city_id_city_id_fk", "city_id", "city", "id", "RESTRICT"],
  [
    "partner_coverage_postcode_zone_id_postcode_zone_id_fk",
    "postcode_zone_id",
    "postcode_zone",
    "id",
    "RESTRICT",
  ],
  [
    "partner_coverage_zone_city_fkey",
    "postcode_zone_id, city_id",
    "postcode_zone",
    "id, city_id",
    "RESTRICT",
  ],
  [
    "partner_blackout_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  [
    "partner_catalog_mapping_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  [
    "partner_catalog_mapping_product_id_product_id_fk",
    "product_id",
    "product",
    "id",
    "RESTRICT",
  ],
  [
    "partner_catalog_mapping_tier_fkey",
    "product_id, tier_key",
    "product_tier",
    "product_id, tier_key",
    "RESTRICT",
  ],
  [
    "partner_catalog_mapping_currency_code_currency_code_fk",
    "currency_code",
    "currency",
    "code",
    "RESTRICT",
  ],
  [
    "partner_catalog_mapping_partner_currency_fkey",
    "partner_id, currency_code",
    "fulfillment_partner",
    "id, payout_currency_code",
    "RESTRICT",
  ],
  [
    "partner_application_country_id_country_id_fk",
    "country_id",
    "country",
    "id",
    "RESTRICT",
  ],
  [
    "partner_application_language_code_locale_code_fk",
    "language_code",
    "locale",
    "code",
    "RESTRICT",
  ],
  [
    "partner_application_converted_partner_fkey",
    "converted_partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  [
    "payout_partner_id_fulfillment_partner_id_fk",
    "partner_id",
    "fulfillment_partner",
    "id",
    "RESTRICT",
  ],
  [
    "payout_currency_code_currency_code_fk",
    "currency_code",
    "currency",
    "code",
    "RESTRICT",
  ],
  [
    "payout_statement_media_asset_id_media_asset_id_fk",
    "statement_media_asset_id",
    "media_asset",
    "id",
    "RESTRICT",
  ],
  [
    "payout_line_payout_fkey",
    "payout_id, currency_code",
    "payout",
    "id, currency_code",
    "RESTRICT",
  ],
  [
    "payout_line_currency_code_currency_code_fk",
    "currency_code",
    "currency",
    "code",
    "RESTRICT",
  ],
  [
    "address_customer_id_customer_id_fk",
    "customer_id",
    "customer",
    "id",
    "RESTRICT",
  ],
  [
    "recipient_customer_id_customer_id_fk",
    "customer_id",
    "customer",
    "id",
    "RESTRICT",
  ],
  [
    "recipient_linked_customer_id_customer_id_fk",
    "linked_customer_id",
    "customer",
    "id",
    "RESTRICT",
  ],
  [
    "recipient_address_recipient_id_recipient_id_fk",
    "recipient_id",
    "recipient",
    "id",
    "RESTRICT",
  ],
  [
    "recipient_address_country_id_country_id_fk",
    "country_id",
    "country",
    "id",
    "RESTRICT",
  ],
  [
    "recipient_address_postcode_zone_fkey",
    "postcode_zone_id, country_id",
    "postcode_zone",
    "id, country_id",
    "RESTRICT",
  ],
];
