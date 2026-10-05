/**
 * Migrations `0005` and `0006` as the database actually holds them (spec 002 §5.1 "`partners`"
 * and "`customers`", §8, AC-5, AC-10, AC-27; spec 010 §5.1 A; `plan/07` §1.3, §5; TASK-018).
 *
 *  - **catalogue**: the fourteen tables exist and belong to `app_owner`; **AC-27's connected
 *    half** — `recipientEmailViolations` over `information_schema.columns` finds nothing, and finds
 *    the column the moment one is added (in a rolled-back transaction); the only address-typed
 *    column is `consent_log.source_ip_truncated`, a `cidr`; the email index is unique on
 *    `lower(email_normalised)` where not redacted; the media guards are `SECURITY DEFINER` with a
 *    pinned `search_path`; still no extension but `plpgsql`.
 *  - **behaviour**, in one transaction that is always rolled back (Phase 0 has one shared
 *    database, spec 002 §13 Q5): each constraint refuses the row it exists to refuse, recorded
 *    with the constraint (or the not-null column, or the trigger's error code) that refused it,
 *    and the valid rows next to them are accepted.
 *
 * Skips itself when no real database is reachable — `DATABASE_URL_UNPOOLED` unset, a placeholder,
 * or the CI service container that has no migrations applied — exactly as
 * `schema-media.test.ts` does.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { recipientEmailViolations } from "../../scripts/db-check.ts";
import { FOREIGN_KEYS } from "../fixtures/schema-foreign-keys.ts";

function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const entries: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    entries[trimmed.slice(0, separator).replace(/^export\s+/, "")] = trimmed
      .slice(separator + 1)
      .trim();
  }
  return entries;
}

function liveDatabaseUrl(): string | undefined {
  const local = readDotEnv(join(process.cwd(), ".env.local"));
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    local.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL ??
    local.DATABASE_URL;
  if (url === undefined || url === "") return undefined;
  return /localhost|127\.0\.0\.1/.test(url) ? undefined : url;
}

const databaseUrl = liveDatabaseUrl();
const sql =
  databaseUrl === undefined ? undefined : postgres(databaseUrl, { max: 1 });

afterAll(async () => {
  await sql?.end();
});

const TABLES = [
  "address",
  "consent_log",
  "customer",
  "fulfillment_partner",
  "partner_application",
  "partner_blackout",
  "partner_catalog_mapping",
  "partner_coverage",
  "partner_member",
  "partner_translation",
  "payout",
  "payout_line",
  "recipient",
  "recipient_address",
] as const;

/** What refused a statement: the constraint, the not-null column, or the trigger's error code. */
function rejectedBy(error: unknown): string {
  if (error === null || typeof error !== "object")
    return "(not a database error)";
  const record = error as {
    code?: unknown;
    constraint_name?: unknown;
    column_name?: unknown;
    message?: unknown;
  };
  if (record.code === "23502" && typeof record.column_name === "string") {
    return `not-null ${record.column_name}`;
  }
  if (record.code === "42703") return "undefined column";
  if (typeof record.constraint_name === "string") return record.constraint_name;
  const raised =
    typeof record.message === "string"
      ? /^([A-Z][A-Z_]+):/.exec(record.message)?.[1]
      : undefined;
  return raised === undefined
    ? "(no constraint name)"
    : `${raised} (${String(record.code)})`;
}

const ROLLBACK = "rollback: this test leaves the shared database untouched";
const SHA = "e".repeat(64);
const MEDIA_GUARD = "PARTNER_APPLICATION_MEDIA_ASSET (23503)";

describe.skipIf(sql === undefined)(
  "migrations 0005 and 0006 applied — partners and customers",
  () => {
    const db = sql as NonNullable<typeof sql>;

    describe("catalogue", () => {
      it("has created the fourteen tables, owned by app_owner", async () => {
        const rows = await db<{ tablename: string; tableowner: string }[]>`
          SELECT tablename, tableowner FROM pg_tables
          WHERE schemaname = 'public' AND tablename IN ${db([...TABLES])}
          ORDER BY tablename
        `;
        expect(rows.map((row) => row.tablename)).toEqual([...TABLES]);
        for (const row of rows) {
          expect(row.tableowner, row.tablename).toBe("app_owner");
        }
      });

      it("AC-27 — no recipient table has an email column, and one added is found at once", async () => {
        const columns = async (
          tx: postgres.Sql | postgres.TransactionSql,
        ): Promise<{ table: string; column: string }[]> =>
          tx<{ table: string; column: string }[]>`
            SELECT table_name AS table, column_name AS column
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('recipient', 'recipient_address')
          `;
        const live = await columns(db);
        expect(live.length).toBeGreaterThan(10);
        expect(recipientEmailViolations(live)).toEqual([]);

        let found: string[] = [];
        await db
          .begin(async (tx) => {
            await tx`ALTER TABLE recipient_address ADD COLUMN "E-Mail" text`;
            found = recipientEmailViolations(await columns(tx));
            throw new Error(ROLLBACK);
          })
          .catch((error: unknown) => {
            if (!(error instanceof Error) || error.message !== ROLLBACK)
              throw error;
          });
        expect(found).toEqual([
          expect.stringMatching(
            /^database: column `E-Mail` on `recipient_address` .*plan\/07 §1\.3/,
          ),
        ]);
      });

      it("AC-27 after a full migrate: in every schema, recipient tables are plain tables with no email-like column (B1)", async () => {
        const kinds = await db<{ where: string; relkind: string }[]>`
          SELECT n.nspname || '.' || c.relname AS where, c.relkind::text AS relkind
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname IN ('recipient', 'recipient_address')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY 1
        `;
        expect(kinds).toEqual([
          { where: "public.recipient", relkind: "r" },
          { where: "public.recipient_address", relkind: "r" },
        ]);
        const columns = await db<{ table: string; column: string }[]>`
          SELECT a.attrelid::regclass::text AS table, a.attname AS column
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname IN ('recipient', 'recipient_address') AND a.attnum > 0
            AND NOT a.attisdropped
        `;
        expect(columns.length).toBeGreaterThan(10);
        expect(
          recipientEmailViolations(
            columns.map(({ table, column }) => ({
              table: table.replace(/^public\./, "").replace(/^"|"$/g, ""),
              column,
            })),
          ),
        ).toEqual([]);
      });

      it("pins every foreign key of 0005 and 0006 with its delete rule (B3)", async () => {
        const rows = await db<{ fk: string; rule: string }[]>`
          SELECT con.conname AS fk, con.confdeltype::text AS rule
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE con.contype = 'f' AND rel.relname IN ${db([...TABLES])}
          ORDER BY con.conname
        `;
        const RULE: Record<string, string> = { RESTRICT: "r", CASCADE: "c" };
        expect(rows).toEqual(
          FOREIGN_KEYS.map(([fk, , , , rule]) => ({
            fk,
            rule: RULE[rule] ?? rule,
          })).sort((a, b) => (a.fk < b.fk ? -1 : 1)),
        );
      });

      it("holds an IP only as consent_log's truncated cidr", async () => {
        const rows = await db<{ where: string }[]>`
          SELECT table_name || '.' || column_name || ':' || data_type AS where
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (data_type IN ('inet', 'cidr') OR column_name ~ '(^|_)ip(_|$)')
          ORDER BY 1
        `;
        expect(rows.map((row) => row.where)).toEqual([
          "consent_log.source_ip_truncated:cidr",
        ]);
      });

      it("declares the buyer-email index unique on lower(email_normalised) where not redacted", async () => {
        const [row] = await db<{ indexdef: string }[]>`
          SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'customer_email_normalised_idx'
        `;
        expect(row?.indexdef).toBe(
          "CREATE UNIQUE INDEX customer_email_normalised_idx ON public.customer USING btree (lower(email_normalised)) WHERE (redacted = false)",
        );
      });

      it("runs the media guards as app_owner with a pinned search_path", async () => {
        const rows = await db<
          {
            proname: string;
            definer: boolean;
            owner: string;
            config: string[] | null;
          }[]
        >`
          SELECT p.proname, p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS owner,
                 p.proconfig AS config
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('partner_application_media_check', 'media_asset_partner_application_guard')
          ORDER BY p.proname
        `;
        expect(rows).toEqual([
          {
            proname: "media_asset_partner_application_guard",
            definer: true,
            owner: "app_owner",
            config: ["search_path=pg_catalog, public"],
          },
          {
            proname: "partner_application_media_check",
            definer: true,
            owner: "app_owner",
            config: ["search_path=pg_catalog, public"],
          },
        ]);
      });

      it("creates no extension (AC-7, §2: no citext)", async () => {
        const rows = await db<
          { extname: string }[]
        >`SELECT extname FROM pg_extension`;
        expect(rows.map((row) => row.extname)).toEqual(["plpgsql"]);
      });
    });

    /**
     * Review R1 (PR 200): the media reference must hold across two sessions, as a foreign key
     * would. These cases need committed rows a second session can see, so they write a locale,
     * two assets and the applications under distinctive keys and delete them in `finally`.
     */
    describe("media_asset_ids across two sessions (review R1)", () => {
      const KEY = "zz-two-session";
      const url = databaseUrl as string;
      const options = { max: 1, connection: { lock_timeout: 10_000 } } as const;

      /** True once `pid` is waiting on a lock; false if it never does within five seconds. */
      const waitsOnLock = async (pid: number): Promise<boolean> => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const [row] = await db<
            { wait: string | null; state: string | null }[]
          >`
            SELECT wait_event_type AS wait, state FROM pg_stat_activity WHERE pid = ${pid}
          `;
          if (row?.wait === "Lock") return true;
          if (row?.state === "idle") return false;
          await new Promise((done) => setTimeout(done, 50));
        }
        return false;
      };

      const setup = async (): Promise<string> => {
        await db`INSERT INTO locale (code, bcp47, name) VALUES ('zw', 'zw', 'Two sessions')
                 ON CONFLICT DO NOTHING`;
        const [row] = await db<{ id: string }[]>`
          INSERT INTO media_asset (
            kind, bucket, object_key, mime, bytes, checksum_sha256, visibility, source, depicts
          )
          VALUES (
            'partner', 'fo-media-test', ${`originals/partner/${KEY}-${String(Date.now())}`},
            'application/pdf', 1, ${SHA}, 'private', 'partner', 'context'
          )
          RETURNING id
        `;
        return row?.id ?? "";
      };
      const cleanup = async (): Promise<void> => {
        await db`DELETE FROM partner_application WHERE business_name = ${KEY}`;
        await db`DELETE FROM media_asset WHERE object_key LIKE ${`originals/partner/${KEY}-%`}`;
        await db`DELETE FROM locale WHERE code = 'zw'`;
      };
      const listing = (
        sql: postgres.Sql | postgres.TransactionSql,
        asset: string,
      ) =>
        sql`INSERT INTO partner_application (business_name, city, language_code, media_asset_ids)
            VALUES (${KEY}, 'Zed', 'zw', ${`{${asset}}`}::uuid[])`;

      /** Session A lists the asset and holds its transaction open while session B runs `change`. */
      const changeWhileListed = async (
        change: (b: postgres.Sql, asset: string) => Promise<unknown>,
      ): Promise<{ waited: boolean; outcome: string; listed: number }> => {
        const a = postgres(url, options);
        const b = postgres(url, options);
        try {
          const asset = await setup();
          const [pidRow] = await b<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          let waited = false;
          let pending: Promise<string> = Promise.resolve("not started");
          await a.begin(async (tx) => {
            await listing(tx, asset);
            pending = change(b, asset).then(
              () => "CHANGED",
              (error: unknown) => rejectedBy(error),
            );
            waited = await waitsOnLock(pidRow?.pid ?? 0);
          });
          const outcome = await pending;
          const [count] = await db<{ n: number }[]>`
            SELECT count(*)::int AS n FROM media_asset
            WHERE id = ${asset} AND kind = 'partner' AND visibility = 'private'
          `;
          return { waited, outcome, listed: count?.n ?? 0 };
        } finally {
          await a.end();
          await b.end();
          await cleanup();
        }
      };

      it(
        "a delete of a listed asset waits for the listing and is then refused",
        { timeout: 30_000 },
        async () => {
          expect(
            await changeWhileListed(
              (b, asset) => b`DELETE FROM media_asset WHERE id = ${asset}`,
            ),
          ).toEqual({ waited: true, outcome: MEDIA_GUARD, listed: 1 });
        },
      );

      it(
        "making a listed asset public waits for the listing and is then refused",
        { timeout: 30_000 },
        async () => {
          expect(
            await changeWhileListed(
              (b, asset) =>
                b`UPDATE media_asset SET visibility = 'public' WHERE id = ${asset}`,
            ),
          ).toEqual({ waited: true, outcome: MEDIA_GUARD, listed: 1 });
        },
      );

      it(
        "a listing written while the asset is being made public waits, re-reads and is refused",
        { timeout: 30_000 },
        async () => {
          const a = postgres(url, options);
          const b = postgres(url, options);
          try {
            const asset = await setup();
            const [pidRow] = await a<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            let waited = false;
            let pending: Promise<string> = Promise.resolve("not started");
            await b.begin(async (tx) => {
              await tx`UPDATE media_asset SET visibility = 'public' WHERE id = ${asset}`;
              pending = listing(a, asset).then(
                () => "LISTED",
                (error: unknown) => rejectedBy(error),
              );
              waited = await waitsOnLock(pidRow?.pid ?? 0);
            });
            expect({ waited, outcome: await pending }).toEqual({
              waited: true,
              outcome: MEDIA_GUARD,
            });
          } finally {
            await a.end();
            await b.end();
            await cleanup();
          }
        },
      );
    });

    it(
      "refuses what each constraint exists to refuse and accepts the valid rows",
      { timeout: 60_000 },
      async () => {
        const failures: string[] = [];
        const accepted: string[] = [];
        let advanced = false;

        await db
          .begin(async (tx) => {
            const refuse = async (
              label: string,
              statement: (sp: postgres.TransactionSql) => Promise<unknown>,
            ): Promise<void> => {
              await tx
                .savepoint(async (sp) => {
                  try {
                    await statement(sp);
                  } catch (error: unknown) {
                    failures.push(`${label}: ${rejectedBy(error)}`);
                    throw new Error("expected rejection");
                  }
                  failures.push(`${label}: ACCEPTED`);
                  throw new Error("undo the accepted statement");
                })
                .catch(() => undefined);
            };
            const accept = async (
              label: string,
              statement: () => Promise<unknown>,
            ): Promise<void> => {
              await statement();
              accepted.push(label);
            };
            const one = async (
              query: PromiseLike<readonly object[]>,
            ): Promise<string> => {
              const row = (await query)[0] as { id?: unknown } | undefined;
              return typeof row?.id === "string" ? row.id : "";
            };

            /* ------------------------------------------------------- parents */

            await tx`INSERT INTO locale (code, bcp47, name) VALUES ('zz', 'zz', 'Test locale')`;
            await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('ZZZ', 2)`;
            await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('ZZY', 2)`;
            const countryA = await one(tx`
              INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
              VALUES ('ZZ', 'ZZZ', 2300, 'Europe/Warsaw') RETURNING id
            `);
            const countryB = await one(tx`
              INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
              VALUES ('ZY', 'ZZY', 1900, 'Europe/Berlin') RETURNING id
            `);
            const cityA = await one(
              tx`INSERT INTO city (country_id) VALUES (${countryA}) RETURNING id`,
            );
            const cityB = await one(
              tx`INSERT INTO city (country_id) VALUES (${countryB}) RETURNING id`,
            );
            const zoneA = await one(tx`
              INSERT INTO postcode_zone (country_id, prefix, city_id)
              VALUES (${countryA}, 'Z0', ${cityA}) RETURNING id
            `);
            const zoneB = await one(tx`
              INSERT INTO postcode_zone (country_id, prefix, city_id)
              VALUES (${countryB}, 'Z1', ${cityB}) RETURNING id
            `);
            const product = await one(tx`
              INSERT INTO product (
                sku, product_type, primary_flower, colour_primary, style, price_tier,
                substitution_class, freshness_days
              )
              VALUES ('ZZ-018', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
              RETURNING id
            `);
            await tx`
              INSERT INTO product_tier (product_id, tier_key, label_key, sort)
              VALUES (${product}, 'm', 'catalog.tierM', 0)
            `;
            const asset = async (
              key: string,
              kind: string,
              visibility: string,
            ): Promise<string> =>
              one(tx`
                INSERT INTO media_asset (
                  kind, bucket, object_key, mime, bytes, checksum_sha256, visibility, source,
                  depicts
                )
                VALUES (
                  ${kind}, 'fo-media-test', ${key}, 'application/pdf', 1, ${SHA},
                  ${visibility}, 'partner', 'context'
                )
                RETURNING id
              `);
            const shopPhoto = await asset(
              "originals/partner/zz-shop",
              "partner",
              "private",
            );
            const publicPhoto = await asset(
              "originals/partner/zz-public",
              "partner",
              "public",
            );
            const productPhoto = await asset(
              "originals/product/zz-018",
              "product",
              "private",
            );

            /* -------------------------------------------- fulfillment_partner */

            const partnerRow = (code: string) => tx<{ id: string }[]>`
              INSERT INTO fulfillment_partner (
                code, legal_name, city_label, country_id, status, contact_email,
                payout_currency_code, capacity_per_day
              )
              VALUES (
                ${code}, 'Demo Florist', 'Zed', ${countryA}, 'demo', 'shop@example.test',
                'ZZZ', 15
              )
              RETURNING id
            `;
            const partner = await one(partnerRow("zz-demo-1"));
            accepted.push("fulfillment_partner a demo partner");
            await refuse(
              "fulfillment_partner without status",
              (sp) => sp`
                INSERT INTO fulfillment_partner (
                  code, legal_name, city_label, country_id, contact_email,
                  payout_currency_code, capacity_per_day
                )
                VALUES ('zz-nostatus', 'X', 'Zed', ${countryA}, 'a@b.test', 'ZZZ', 1)
              `,
            );
            await refuse(
              "fulfillment_partner status live",
              (sp) =>
                sp`UPDATE fulfillment_partner SET status = 'live' WHERE id = ${partner}`,
            );
            await accept(
              "fulfillment_partner flipped to active",
              () =>
                tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner duplicate code",
              (sp) =>
                sp`INSERT INTO fulfillment_partner (
                  code, legal_name, city_label, country_id, status, contact_email,
                  payout_currency_code, capacity_per_day
                ) VALUES ('zz-demo-1', 'X', 'Zed', ${countryA}, 'demo', 'a@b.test', 'ZZZ', 1)`,
            );
            await refuse(
              "fulfillment_partner upper-case code",
              (sp) =>
                sp`UPDATE fulfillment_partner SET code = 'ZZ-Demo' WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner whatsapp without phone",
              (sp) =>
                sp`UPDATE fulfillment_partner SET notification_channel = 'whatsapp' WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner phone not E.164",
              (sp) =>
                sp`UPDATE fulfillment_partner SET contact_phone = '0048 600 000 000' WHERE id = ${partner}`,
            );
            await accept(
              "fulfillment_partner whatsapp with an E.164 phone",
              () =>
                tx`UPDATE fulfillment_partner
                 SET contact_phone = '+48600000000', notification_channel = 'whatsapp'
                 WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner rating above 100%",
              (sp) =>
                sp`UPDATE fulfillment_partner SET rating_90d_bp = 10001 WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner zero capacity",
              (sp) =>
                sp`UPDATE fulfillment_partner SET capacity_per_day = 0 WHERE id = ${partner}`,
            );
            await refuse(
              "fulfillment_partner source other",
              (sp) =>
                sp`UPDATE fulfillment_partner SET source = 'import' WHERE id = ${partner}`,
            );
            const partnerB = await one(partnerRow("zz-demo-2"));

            /* ----------------------------------------- translation, member */

            await accept(
              "partner_translation one row per locale",
              () =>
                tx`INSERT INTO partner_translation (partner_id, locale_code, display_name)
                 VALUES (${partner}, 'zz', 'Demo')`,
            );
            await refuse(
              "partner_translation second row for a locale",
              (sp) =>
                sp`INSERT INTO partner_translation (partner_id, locale_code, display_name)
                 VALUES (${partner}, 'zz', 'Again')`,
            );
            const user = "00000000-0000-4000-8000-000000000018";
            await accept(
              "partner_member one user in two partners (a chain)",
              async () => {
                await tx`INSERT INTO partner_member (user_id, partner_id, role)
                       VALUES (${user}, ${partner}, 'owner')`;
                await tx`INSERT INTO partner_member (user_id, partner_id, role)
                       VALUES (${user}, ${partnerB}, 'staff')`;
              },
            );
            await refuse(
              "partner_member same user twice in one partner",
              (sp) =>
                sp`INSERT INTO partner_member (user_id, partner_id, role)
                 VALUES (${user}, ${partner}, 'staff')`,
            );
            await refuse(
              "partner_member role admin",
              (sp) =>
                sp`UPDATE partner_member SET role = 'admin' WHERE partner_id = ${partner}`,
            );
            await refuse(
              "partner_member accepted before invited",
              (sp) =>
                sp`UPDATE partner_member SET accepted_at = invited_at - interval '1 day'
                 WHERE partner_id = ${partner}`,
            );

            /* ------------------------------------------- coverage, blackout */

            await accept("partner_coverage a city and a zone", async () => {
              await tx`INSERT INTO partner_coverage (partner_id, city_id) VALUES (${partner}, ${cityA})`;
              await tx`INSERT INTO partner_coverage (partner_id, postcode_zone_id) VALUES (${partner}, ${zoneA})`;
            });
            await refuse(
              "partner_coverage neither city nor zone",
              (sp) =>
                sp`INSERT INTO partner_coverage (partner_id) VALUES (${partner})`,
            );
            await refuse(
              "partner_coverage the same city twice",
              (sp) =>
                sp`INSERT INTO partner_coverage (partner_id, city_id) VALUES (${partner}, ${cityA})`,
            );
            await refuse(
              "partner_coverage zero capacity",
              (sp) =>
                sp`INSERT INTO partner_coverage (partner_id, city_id, capacity_per_day)
                 VALUES (${partner}, ${cityB}, 0)`,
            );
            await refuse(
              "partner_coverage a zone outside its city (B6)",
              (sp) =>
                sp`INSERT INTO partner_coverage (partner_id, city_id, postcode_zone_id)
                 VALUES (${partner}, ${cityA}, ${zoneB})`,
            );
            await accept(
              "partner_coverage a city with a zone in it",
              () =>
                tx`INSERT INTO partner_coverage (partner_id, city_id, postcode_zone_id)
                 VALUES (${partner}, ${cityA}, ${zoneA})`,
            );
            await accept(
              "partner_blackout a date",
              () =>
                tx`INSERT INTO partner_blackout (partner_id, date) VALUES (${partner}, '2027-02-14')`,
            );
            await refuse(
              "partner_blackout the same date twice",
              (sp) =>
                sp`INSERT INTO partner_blackout (partner_id, date) VALUES (${partner}, '2027-02-14')`,
            );

            /* --------------------------------------------- catalogue mapping */

            const mapping = (tier: string | null, payout: number) =>
              tx`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, tier_key, partner_payout_minor, currency_code
                 ) VALUES (${partner}, ${product}, ${tier}, ${payout}, 'ZZZ')`;
            await accept(
              "partner_catalog_mapping a base row and a tier row",
              async () => {
                await mapping(null, 2500);
                await mapping("m", 3000);
              },
            );
            await refuse(
              "partner_catalog_mapping a second base row",
              (sp) =>
                sp`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, tier_key, partner_payout_minor, currency_code
                 ) VALUES (${partner}, ${product}, NULL, 2600, 'ZZZ')`,
            );
            await refuse(
              "partner_catalog_mapping a tier the product lacks",
              (sp) =>
                sp`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, tier_key, partner_payout_minor, currency_code
                 ) VALUES (${partner}, ${product}, 'xl', 4000, 'ZZZ')`,
            );
            await refuse(
              "partner_catalog_mapping negative payout",
              (sp) =>
                sp`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, partner_payout_minor, currency_code
                 ) VALUES (${partnerB}, ${product}, -1, 'ZZZ')`,
            );
            await refuse(
              "partner_catalog_mapping lower-case currency",
              (sp) =>
                sp`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, partner_payout_minor, currency_code
                 ) VALUES (${partnerB}, ${product}, 1, 'zzz')`,
            );

            await refuse(
              "partner_catalog_mapping in another currency than the partner's (B6)",
              (sp) =>
                sp`INSERT INTO partner_catalog_mapping (
                   partner_id, product_id, tier_key, partner_payout_minor, currency_code
                 ) VALUES (${partnerB}, ${product}, NULL, 2500, 'ZZY')`,
            );
            await refuse(
              "fulfillment_partner currency changed under its mappings (B6)",
              (sp) =>
                sp`UPDATE fulfillment_partner SET payout_currency_code = 'ZZY' WHERE id = ${partner}`,
            );
            await accept(
              "fulfillment_partner currency changed with no mapping in the old one",
              () =>
                tx`UPDATE fulfillment_partner SET payout_currency_code = 'ZZY' WHERE id = ${partnerB}`,
            );
            await tx`UPDATE fulfillment_partner SET payout_currency_code = 'ZZZ' WHERE id = ${partnerB}`;

            /* --------------------------------------------- application media */

            const application = (ids: string) =>
              tx`INSERT INTO partner_application (business_name, city, language_code, media_asset_ids)
                 VALUES ('Kwiaty', 'Zed', 'zz', ${ids}::uuid[]) RETURNING id`;
            const appId = await one(application(`{${shopPhoto}}`));
            accepted.push(
              "partner_application listing a private partner asset",
            );
            await refuse(
              "partner_application listing an unknown asset",
              (sp) =>
                sp`INSERT INTO partner_application (business_name, city, language_code, media_asset_ids)
                 VALUES ('X', 'Zed', 'zz', ${"{00000000-0000-4000-8000-0000000000aa}"}::uuid[])`,
            );
            await refuse(
              "partner_application listing a public asset",
              (sp) =>
                sp`UPDATE partner_application SET media_asset_ids = ${`{${publicPhoto}}`}::uuid[]
                 WHERE id = ${appId}`,
            );
            await refuse(
              "partner_application listing a product asset",
              (sp) =>
                sp`UPDATE partner_application SET media_asset_ids = ${`{${shopPhoto},${productPhoto}}`}::uuid[]
                 WHERE id = ${appId}`,
            );
            await refuse(
              "partner_application a null element",
              (sp) =>
                sp`UPDATE partner_application SET media_asset_ids = ARRAY[NULL]::uuid[]
                 WHERE id = ${appId}`,
            );
            await refuse(
              "media_asset delete while an application lists it",
              (sp) => sp`DELETE FROM media_asset WHERE id = ${shopPhoto}`,
            );
            await refuse(
              "media_asset made public while an application lists it",
              (sp) =>
                sp`UPDATE media_asset SET visibility = 'public' WHERE id = ${shopPhoto}`,
            );
            await refuse(
              "media_asset re-kinded while an application lists it",
              (sp) =>
                sp`UPDATE media_asset SET kind = 'brand' WHERE id = ${shopPhoto}`,
            );
            await accept(
              "media_asset a listed asset reviewed in place",
              () =>
                tx`UPDATE media_asset SET review_state = 'rejected' WHERE id = ${shopPhoto}`,
            );
            await accept(
              "media_asset an unlisted asset deleted",
              () => tx`DELETE FROM media_asset WHERE id = ${publicPhoto}`,
            );
            await refuse(
              "partner_application converted without a partner",
              (sp) =>
                sp`UPDATE partner_application SET status = 'converted' WHERE id = ${appId}`,
            );
            await refuse(
              "partner_application a partner while still new",
              (sp) =>
                sp`UPDATE partner_application SET converted_partner_id = ${partnerB} WHERE id = ${appId}`,
            );
            await accept(
              "partner_application converted with its partner",
              () =>
                tx`UPDATE partner_application
                 SET status = 'converted', converted_partner_id = ${partnerB} WHERE id = ${appId}`,
            );
            await refuse(
              "partner_application status approved",
              (sp) =>
                sp`UPDATE partner_application SET status = 'approved', converted_partner_id = NULL WHERE id = ${appId}`,
            );

            /* ---------------------------------------------------------- payout */

            const payoutId = await one(tx`
              INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
              VALUES (${partner}, '2026-10-01', '2026-10-31', 5500, 'ZZZ') RETURNING id
            `);
            accepted.push("payout one period");
            await refuse(
              "payout the same period twice",
              (sp) =>
                sp`INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
                 VALUES (${partner}, '2026-10-01', '2026-10-31', 1, 'ZZZ')`,
            );
            await refuse(
              "payout ends before it starts",
              (sp) =>
                sp`INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
                 VALUES (${partner}, '2026-11-30', '2026-11-01', 1, 'ZZZ')`,
            );
            await refuse(
              "payout status sent",
              (sp) =>
                sp`UPDATE payout SET status = 'sent' WHERE id = ${payoutId}`,
            );
            await refuse(
              "payout in another currency than the partner's (B6)",
              (sp) =>
                sp`INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
                 VALUES (${partner}, '2026-12-01', '2026-12-31', 1, 'ZZY')`,
            );
            await refuse(
              "payout moved to another currency (B6)",
              (sp) =>
                sp`UPDATE payout SET currency_code = 'ZZY' WHERE id = ${payoutId}`,
            );
            const order = "00000000-0000-4000-8000-0000000000bb";
            const line = (
              sp: postgres.TransactionSql,
              kind: string,
              amount: number,
              currency = "ZZZ",
              orderId: string | null = null,
            ) =>
              sp`INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind)
                 VALUES (${payoutId}, ${orderId}, ${amount}, ${currency}, ${kind})`;
            await accept(
              "payout_line an order, a negative adjustment, a goodwill",
              async () => {
                await line(tx, "order", 3000, "ZZZ", order);
                await line(tx, "adjustment", -500);
                await line(tx, "goodwill", 300);
              },
            );
            await refuse(
              "payout_line in another currency than its payout",
              (sp) => line(sp, "goodwill", 100, "ZZY"),
            );
            await refuse("payout_line the same order paid twice", (sp) =>
              line(sp, "order", 3000, "ZZZ", order),
            );
            await refuse("payout_line an order line without an order", (sp) =>
              line(sp, "order", 3000),
            );
            await refuse("payout_line a zero adjustment", (sp) =>
              line(sp, "adjustment", 0),
            );
            await refuse("payout_line a negative goodwill", (sp) =>
              line(sp, "goodwill", -1),
            );
            await refuse("payout_line kind refund", (sp) =>
              line(sp, "refund", 1),
            );
            await refuse("payout_line a zero goodwill (B5)", (sp) =>
              line(sp, "goodwill", 0),
            );
            await refuse("payout_line a zero order line (B5)", (sp) =>
              line(
                sp,
                "order",
                0,
                "ZZZ",
                "00000000-0000-4000-8000-0000000000bc",
              ),
            );
            await refuse(
              "payout delete with lines",
              (sp) => sp`DELETE FROM payout WHERE id = ${payoutId}`,
            );

            /* ------------------------------------------------------- customer */

            const customer = await one(tx`
              INSERT INTO customer (email_normalised, name, country_iso2)
              VALUES ('anna@example.test', 'Anna', 'GB') RETURNING id
            `);
            accepted.push("customer a guest buyer");
            await refuse(
              "customer the same email in another case",
              (sp) =>
                sp`INSERT INTO customer (email_normalised) VALUES ('Anna@Example.TEST')`,
            );
            await refuse(
              "customer an email with a space",
              (sp) =>
                sp`INSERT INTO customer (email_normalised) VALUES (' anna@example.test')`,
            );
            await refuse(
              "customer no email",
              (sp) => sp`INSERT INTO customer (name) VALUES ('Nobody')`,
            );
            await refuse(
              "customer redacted without a date",
              (sp) =>
                sp`UPDATE customer SET redacted = true WHERE id = ${customer}`,
            );
            await refuse(
              "customer lower-case country",
              (sp) =>
                sp`UPDATE customer SET country_iso2 = 'gb' WHERE id = ${customer}`,
            );
            await accept(
              "customer redacted, then the email reused by a new buyer",
              async () => {
                await tx`UPDATE customer SET redacted = true, redacted_at = now() WHERE id = ${customer}`;
                await tx`INSERT INTO customer (email_normalised) VALUES ('ANNA@example.test')`;
              },
            );
            await accept(
              "address a billing address",
              () =>
                tx`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                 VALUES (${customer}, 'billing', ${"{1 High Street}"}::text[], 'London', 'GB')`,
            );
            await refuse(
              "address kind shipping",
              (sp) =>
                sp`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                 VALUES (${customer}, 'shipping', ${"{x}"}::text[], 'London', 'GB')`,
            );
            await refuse(
              "address a null line",
              (sp) =>
                sp`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                 VALUES (${customer}, 'billing', ARRAY['a', NULL], 'London', 'GB')`,
            );

            /* ------------------------------------------------------ recipient */

            const recipient = await one(tx`
              INSERT INTO recipient (customer_id, full_name, phone_e164)
              VALUES (${customer}, 'Ola Nowak', '+48600000001') RETURNING id
            `);
            accepted.push("recipient with a phone");
            await refuse(
              "recipient without a phone",
              (sp) =>
                sp`INSERT INTO recipient (customer_id, full_name) VALUES (${customer}, 'X')`,
            );
            await refuse(
              "recipient a blank name",
              (sp) =>
                sp`INSERT INTO recipient (customer_id, full_name, phone_e164)
                 VALUES (${customer}, '   ', '+48600000002')`,
            );
            await refuse(
              "recipient phone not E.164",
              (sp) =>
                sp`UPDATE recipient SET phone_e164 = '600000001' WHERE id = ${recipient}`,
            );
            await refuse(
              "recipient phone dropped before redaction",
              (sp) =>
                sp`UPDATE recipient SET phone_e164 = NULL WHERE id = ${recipient}`,
            );
            await refuse(
              "recipient an email column",
              (sp) =>
                sp`UPDATE recipient SET email = 'x@y.test' WHERE id = ${recipient}`,
            );
            await accept(
              "recipient_address with a zone of its own country",
              () =>
                tx`INSERT INTO recipient_address (recipient_id, lines, city, country_id, postcode_zone_id, place_kind)
                 VALUES (${recipient}, ${"{ul. Kwiatowa 1}"}::text[], 'Zed', ${countryA}, ${zoneA}, 'hospital')`,
            );
            await refuse(
              "recipient_address a zone of another country",
              (sp) =>
                sp`INSERT INTO recipient_address (recipient_id, lines, city, country_id, postcode_zone_id)
                 VALUES (${recipient}, ${"{x}"}::text[], 'Zed', ${countryA}, ${zoneB})`,
            );
            await refuse(
              "recipient_address place_kind office",
              (sp) =>
                sp`INSERT INTO recipient_address (recipient_id, lines, city, country_id, place_kind)
                 VALUES (${recipient}, ${"{x}"}::text[], 'Zed', ${countryA}, 'office')`,
            );
            await accept(
              "recipient contact redacted: phone and street dropped",
              async () => {
                await tx`UPDATE recipient
                       SET phone_e164 = NULL, full_name = 'O.', contact_redacted = true,
                           contact_redacted_at = now()
                       WHERE id = ${recipient}`;
                await tx`UPDATE recipient_address SET lines = '{}' WHERE recipient_id = ${recipient}`;
              },
            );

            /* ------------------------------- a buyer's data never goes with them (B3) */

            const buyerWithRecipient = await one(
              tx`INSERT INTO customer (email_normalised) VALUES ('ola@example.test') RETURNING id`,
            );
            const kept = await one(tx`
              INSERT INTO recipient (customer_id, full_name, phone_e164)
              VALUES (${buyerWithRecipient}, 'Kept', '+48600000003') RETURNING id
            `);
            const buyerWithAddress = await one(
              tx`INSERT INTO customer (email_normalised) VALUES ('jan@example.test') RETURNING id`,
            );
            await tx`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                     VALUES (${buyerWithAddress}, 'billing', ${"{x}"}::text[], 'Zed', 'GB')`;
            const linked = await one(
              tx`INSERT INTO customer (email_normalised) VALUES ('linked@example.test') RETURNING id`,
            );
            await tx`UPDATE recipient SET linked_customer_id = ${linked} WHERE id = ${kept}`;
            await tx`INSERT INTO recipient_address (recipient_id, lines, city, country_id)
                     VALUES (${kept}, ${"{x}"}::text[], 'Zed', ${countryA})`;
            await refuse(
              "customer deleted while it has a recipient",
              (sp) => sp`DELETE FROM customer WHERE id = ${buyerWithRecipient}`,
            );
            await refuse(
              "customer deleted while it has an address",
              (sp) => sp`DELETE FROM customer WHERE id = ${buyerWithAddress}`,
            );
            await refuse(
              "customer deleted while a recipient is linked to it",
              (sp) => sp`DELETE FROM customer WHERE id = ${linked}`,
            );
            await refuse(
              "recipient deleted while it has an address",
              (sp) => sp`DELETE FROM recipient WHERE id = ${kept}`,
            );
            const [survivors] = await tx<{ n: number }[]>`
              SELECT (SELECT count(*) FROM recipient WHERE id = ${kept})::int
                   + (SELECT count(*) FROM address WHERE customer_id = ${buyerWithAddress})::int
                   + (SELECT count(*) FROM recipient_address WHERE recipient_id = ${kept})::int AS n
            `;
            if (survivors?.n === 3)
              accepted.push(
                "every refused delete left the buyer's rows in place",
              );

            /* ---------------------------------------------------- consent_log */

            const consent = (
              sp: postgres.TransactionSql,
              kind: string,
              ref: string | null,
              anon: string | null,
              ip: string | null,
              choices = '{"analytics":true}',
            ) =>
              sp`INSERT INTO consent_log (subject_kind, subject_ref, anonymous_id, choices, policy_version, occurred_at, source_ip_truncated)
                 VALUES (${kind}, ${ref}, ${anon}, (${choices}::text)::jsonb, 1, now(), ${ip}::cidr)`;
            const cid = "00000000-0000-4000-8000-0000000000cc";
            await accept("consent_log a visitor, a /24 and a /48", async () => {
              await consent(tx, "visitor", null, cid, "203.0.113.0/24");
              await consent(tx, "customer", customer, null, "2001:db8:1::/48");
              await consent(tx, "recipient", recipient, null, null);
            });
            await refuse("consent_log a full IPv4 address", (sp) =>
              consent(sp, "visitor", null, cid, "203.0.113.7/32"),
            );
            await refuse("consent_log an IPv4 /25", (sp) =>
              consent(sp, "visitor", null, cid, "203.0.113.0/25"),
            );
            await refuse("consent_log a full IPv6 address", (sp) =>
              consent(sp, "visitor", null, cid, "2001:db8:1::1/128"),
            );
            await refuse("consent_log an IPv4-mapped IPv6 host", (sp) =>
              consent(sp, "visitor", null, cid, "::ffff:203.0.113.7/128"),
            );
            await refuse("consent_log a visitor without anonymous_id", (sp) =>
              consent(sp, "visitor", null, null, null),
            );
            await refuse("consent_log a visitor with a subject_ref", (sp) =>
              consent(sp, "visitor", customer, cid, null),
            );
            await refuse("consent_log a customer without subject_ref", (sp) =>
              consent(sp, "customer", null, cid, null),
            );
            await refuse("consent_log choices not an object", (sp) =>
              consent(sp, "visitor", null, cid, null, "[true]"),
            );
            await refuse("consent_log subject partner", (sp) =>
              consent(sp, "partner", customer, null, null),
            );

            /* ---------------------------------------------- updated_at (AC-10) */

            // Backdated on insert: the trigger fires on UPDATE only, and now() is the transaction's
            // constant timestamp, so an advance is visible only against an inserted past value.
            const stale = await one(tx`
              INSERT INTO fulfillment_partner (
                code, legal_name, city_label, country_id, status, contact_email,
                payout_currency_code, capacity_per_day, updated_at
              )
              VALUES (
                'zz-stale', 'X', 'Zed', ${countryA}, 'demo', 'a@b.test', 'ZZZ', 1,
                now() - interval '1 day'
              )
              RETURNING id
            `);
            const staleBuyer = await one(tx`
              INSERT INTO customer (email_normalised, updated_at)
              VALUES ('stale@example.test', now() - interval '1 day') RETURNING id
            `);
            await tx`UPDATE fulfillment_partner SET code = code WHERE id = ${stale}`;
            await tx`UPDATE customer SET name = name WHERE id = ${staleBuyer}`;
            const [moved] = await tx<{ ok: boolean }[]>`
              SELECT (SELECT updated_at = now() FROM fulfillment_partner WHERE id = ${stale})
                 AND (SELECT updated_at = now() FROM customer WHERE id = ${staleBuyer}) AS ok
            `;
            advanced = moved?.ok === true;

            throw new Error(ROLLBACK);
          })
          .catch((error: unknown) => {
            if (!(error instanceof Error) || error.message !== ROLLBACK) {
              throw error;
            }
          });

        expect(failures.sort()).toEqual(
          [
            "fulfillment_partner without status: not-null status",
            "fulfillment_partner status live: fulfillment_partner_status_check",
            "fulfillment_partner duplicate code: fulfillment_partner_code_key",
            "fulfillment_partner upper-case code: fulfillment_partner_code_check",
            "fulfillment_partner whatsapp without phone: fulfillment_partner_whatsapp_phone_check",
            "fulfillment_partner phone not E.164: fulfillment_partner_contact_phone_check",
            "fulfillment_partner rating above 100%: fulfillment_partner_rating_90d_bp_check",
            "fulfillment_partner zero capacity: fulfillment_partner_capacity_per_day_check",
            "fulfillment_partner source other: fulfillment_partner_source_check",
            "partner_translation second row for a locale: partner_translation_pkey",
            "partner_member same user twice in one partner: partner_member_pkey",
            "partner_member role admin: partner_member_role_check",
            "partner_member accepted before invited: partner_member_accepted_at_check",
            "partner_coverage neither city nor zone: partner_coverage_target_check",
            "partner_coverage the same city twice: partner_coverage_partner_target_idx",
            "partner_coverage zero capacity: partner_coverage_capacity_per_day_check",
            "partner_coverage a zone outside its city (B6): partner_coverage_zone_city_fkey",
            "partner_catalog_mapping in another currency than the partner's (B6): partner_catalog_mapping_partner_currency_fkey",
            "fulfillment_partner currency changed under its mappings (B6): partner_catalog_mapping_partner_currency_fkey",
            "payout in another currency than the partner's (B6): PAYOUT_CURRENCY_MISMATCH (23514)",
            "payout moved to another currency (B6): PAYOUT_CURRENCY_MISMATCH (23514)",
            "payout_line a zero goodwill (B5): payout_line_amount_minor_check",
            "payout_line a zero order line (B5): payout_line_amount_minor_check",
            "customer deleted while it has a recipient: recipient_customer_id_customer_id_fk",
            "customer deleted while it has an address: address_customer_id_customer_id_fk",
            "customer deleted while a recipient is linked to it: recipient_linked_customer_id_customer_id_fk",
            "recipient deleted while it has an address: recipient_address_recipient_id_recipient_id_fk",
            "partner_blackout the same date twice: partner_blackout_pkey",
            "partner_catalog_mapping a second base row: partner_catalog_mapping_partner_product_tier_idx",
            "partner_catalog_mapping a tier the product lacks: partner_catalog_mapping_tier_fkey",
            "partner_catalog_mapping negative payout: partner_catalog_mapping_partner_payout_minor_check",
            "partner_catalog_mapping lower-case currency: partner_catalog_mapping_currency_code_check",
            `partner_application listing an unknown asset: ${MEDIA_GUARD}`,
            `partner_application listing a public asset: ${MEDIA_GUARD}`,
            `partner_application listing a product asset: ${MEDIA_GUARD}`,
            "partner_application a null element: partner_application_media_asset_ids_check",
            `media_asset delete while an application lists it: ${MEDIA_GUARD}`,
            `media_asset made public while an application lists it: ${MEDIA_GUARD}`,
            `media_asset re-kinded while an application lists it: ${MEDIA_GUARD}`,
            "partner_application converted without a partner: partner_application_converted_check",
            "partner_application a partner while still new: partner_application_converted_check",
            "partner_application status approved: partner_application_status_check",
            "payout the same period twice: payout_partner_period_key",
            "payout ends before it starts: payout_period_check",
            "payout status sent: payout_status_check",
            "payout_line in another currency than its payout: payout_line_payout_fkey",
            "payout_line the same order paid twice: payout_line_order_once_idx",
            "payout_line an order line without an order: payout_line_order_check",
            "payout_line a zero adjustment: payout_line_amount_minor_check",
            "payout_line a negative goodwill: payout_line_amount_minor_check",
            "payout_line kind refund: payout_line_kind_check",
            "payout delete with lines: payout_line_payout_fkey",
            "customer the same email in another case: customer_email_normalised_idx",
            "customer an email with a space: customer_email_normalised_check",
            "customer no email: not-null email_normalised",
            "customer redacted without a date: customer_redacted_check",
            "customer lower-case country: customer_country_iso2_check",
            "address kind shipping: address_kind_check",
            "address a null line: address_lines_check",
            "recipient without a phone: recipient_phone_check",
            "recipient a blank name: recipient_full_name_check",
            "recipient phone not E.164: recipient_phone_e164_check",
            "recipient phone dropped before redaction: recipient_phone_check",
            "recipient an email column: undefined column",
            "recipient_address a zone of another country: recipient_address_postcode_zone_fkey",
            "recipient_address place_kind office: recipient_address_place_kind_check",
            "consent_log a full IPv4 address: consent_log_source_ip_truncated_check",
            "consent_log an IPv4 /25: consent_log_source_ip_truncated_check",
            "consent_log a full IPv6 address: consent_log_source_ip_truncated_check",
            "consent_log an IPv4-mapped IPv6 host: consent_log_source_ip_truncated_check",
            "consent_log a visitor without anonymous_id: consent_log_subject_check",
            "consent_log a visitor with a subject_ref: consent_log_subject_check",
            "consent_log a customer without subject_ref: consent_log_subject_check",
            "consent_log choices not an object: consent_log_choices_check",
            "consent_log subject partner: consent_log_subject_kind_check",
          ].sort(),
        );
        expect(accepted.sort()).toEqual(
          [
            "fulfillment_partner a demo partner",
            "fulfillment_partner flipped to active",
            "fulfillment_partner whatsapp with an E.164 phone",
            "partner_translation one row per locale",
            "partner_member one user in two partners (a chain)",
            "partner_coverage a city and a zone",
            "partner_coverage a city with a zone in it",
            "fulfillment_partner currency changed with no mapping in the old one",
            "every refused delete left the buyer's rows in place",
            "partner_blackout a date",
            "partner_catalog_mapping a base row and a tier row",
            "partner_application listing a private partner asset",
            "media_asset a listed asset reviewed in place",
            "media_asset an unlisted asset deleted",
            "partner_application converted with its partner",
            "payout one period",
            "payout_line an order, a negative adjustment, a goodwill",
            "customer a guest buyer",
            "customer redacted, then the email reused by a new buyer",
            "address a billing address",
            "recipient with a phone",
            "recipient_address with a zone of its own country",
            "recipient contact redacted: phone and street dropped",
            "consent_log a visitor, a /24 and a /48",
          ].sort(),
        );
        expect(advanced).toBe(true);
      },
    );
  },
);
