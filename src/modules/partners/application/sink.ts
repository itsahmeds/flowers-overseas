/**
 * `dbApplicationSink`: one `partner_application` row per application (spec 011 §2 "The write",
 * §5.1, §5.2; AC-11, AC-14; TASK-213).
 *
 * Under `withDbContext({ role: "public" })`, the visitor's role: `0022`'s
 * `partner_application_public_insert` lets it add a row with `status = 'new'`, no converted partner
 * and no decision time, and read nothing back, so the insert carries **no `RETURNING`** (the public
 * role has no `SELECT` on the table, and a `RETURNING` would need one). The country is resolved by
 * its ISO code inside the same statement (`country` is readable by every role, `0011`
 * `country_read`); a code with no row leaves `country_id` null, which `0022`'s `NOT NULL` refuses,
 * so the sink throws and the form shows the send-failed state.
 *
 * The one "Instagram or website" answer is stored in `instagram_url` when its host is Instagram's
 * and in `website_url` otherwise.
 *
 * The database client is imported when the first application is stored, not when this module
 * loads, so the apply page's import graph holds no driver.
 */
import { sql } from "drizzle-orm";

import type { DbTransaction } from "@/lib/db";

import { partnerApplication } from "../../../../db/schema/partners";

import type { ApplicationSink, FloristApplication } from "./submit.ts";

/** Runs `fn` in one public-role transaction. */
export type PublicRunner = <T>(
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

export const publicRunner: PublicRunner = async (fn) => {
  const { withDbContext } = await import("@/lib/db");
  return withDbContext(
    { role: "public", partnerIds: [], requestId: crypto.randomUUID() },
    fn,
  );
};

/** True when the URL's host is Instagram's (with or without `www.`). */
export function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

/** The row's columns for one application. */
export function applicationRow(application: FloristApplication) {
  const website = application.website;
  const instagram = website !== undefined && isInstagramUrl(website);
  return {
    businessName: application.businessName,
    contactName: application.contactName,
    contactEmail: application.email,
    contactPhone: application.phone,
    countryId: sql<string>`(SELECT c.id FROM public.country c WHERE c.iso2 = ${application.country})`,
    city: application.town,
    coverageNote: application.deliveryArea,
    capacityPerDay: application.capacityPerDay,
    weekendDelivery: application.weekendDelivery,
    registrationNumber: application.registrationNumber ?? null,
    instagramUrl: instagram ? website : null,
    websiteUrl: instagram ? null : (website ?? null),
    preferredChannel: application.contactPreference,
    languageCode: application.language,
    privacyNoticeVersion: application.privacyNoticeVersion,
  };
}

export function dbApplicationSink(
  run: PublicRunner = publicRunner,
): ApplicationSink {
  return {
    async accept(application) {
      await run(async (db) => {
        await db.insert(partnerApplication).values(applicationRow(application));
      });
    },
  };
}
