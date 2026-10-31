/**
 * Spec 022a's review data without a database (§5.1, §5.2; AC-19 offline half, AC-33 env half,
 * T-33 env half; TASK-368):
 *
 *  - AC-33 (env): `REVIEW_TOKEN_SECRET` at least 32 characters, the development key only in
 *    development and test, refused at boot and at use in production; `TRUSTPILOT_AFS_ADDRESS`
 *    an optional email; both in `.env.example`;
 *  - `review.created` v1: registered, `{ mode, reviewId, rating }` only, actor class `buyer` only;
 *  - `src/config/reviews.ts`: §5.2's constants;
 *  - migration `0029` read as text: `review_invite` equals its Drizzle mirror, the hash is hex
 *    `text` (no `bytea`), the down file refuses before it drops anything.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as reviewsConfig from "../../src/config/reviews.ts";
import {
  reviewTokenSecret,
  trustpilotAfsAddress,
} from "../../src/lib/env.reviews.ts";
import {
  DEVELOPMENT_REVIEW_TOKEN_SECRET,
  EnvValidationError,
  serverEnvSchema,
  validateRuntimeEnv,
} from "../../src/lib/env.schema.ts";
import {
  eventSchema,
  STATUS_PRESERVING_ACTORS,
  STATUS_PRESERVING_EVENTS,
} from "../../src/modules/orders/index.ts";
import { ReviewCreatedV1 } from "../../src/modules/reviews/index.ts";
import { mirrorShape, sqlShape } from "./support/migration-sql.ts";

const REPO = resolve(import.meta.dirname, "../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const up = read("db/migrations/0029_reviews_close.sql");
const down = read("db/migrations/0029_reviews_close.down.sql");

const REAL = "f".repeat(64);
const REVIEW_ID = "4b7a0f0e-8f7c-4d7e-9a43-2a1c3e5d6f70";

describe("AC-33 (env half): REVIEW_TOKEN_SECRET", () => {
  it("is at least 32 characters, blank reads as absent", () => {
    const schema = serverEnvSchema.shape.REVIEW_TOKEN_SECRET;
    expect(schema.safeParse("x".repeat(32)).success).toBe(true);
    expect(schema.safeParse("x".repeat(31)).success).toBe(false);
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("uses the development key only in development and test", () => {
    expect(reviewTokenSecret({ NODE_ENV: "test" })).toBe(
      DEVELOPMENT_REVIEW_TOKEN_SECRET,
    );
    expect(reviewTokenSecret({ APP_ENV: "development" })).toBe(
      DEVELOPMENT_REVIEW_TOKEN_SECRET,
    );
    expect(DEVELOPMENT_REVIEW_TOKEN_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it.each(["preview", "staging", "production"])(
    "in %s: absent throws naming the key, the development key throws at use and at boot, a real key is used",
    (environment) => {
      expect(() => reviewTokenSecret({ APP_ENV: environment })).toThrow(
        EnvValidationError,
      );
      expect(() => reviewTokenSecret({ APP_ENV: environment })).toThrow(
        /REVIEW_TOKEN_SECRET/u,
      );
      expect(() =>
        reviewTokenSecret({
          APP_ENV: environment,
          REVIEW_TOKEN_SECRET: DEVELOPMENT_REVIEW_TOKEN_SECRET,
        }),
      ).toThrow(/REVIEW_TOKEN_SECRET/u);
      const { issues } = validateRuntimeEnv({
        APP_ENV: environment,
        REVIEW_TOKEN_SECRET: DEVELOPMENT_REVIEW_TOKEN_SECRET,
      });
      expect(issues.map((issue) => issue.key)).toContain("REVIEW_TOKEN_SECRET");
      expect(
        reviewTokenSecret({ APP_ENV: environment, REVIEW_TOKEN_SECRET: REAL }),
      ).toBe(REAL);
    },
  );

  it("refuses a short key everywhere, and never prints the value", () => {
    let message = "";
    try {
      reviewTokenSecret({ NODE_ENV: "test", REVIEW_TOKEN_SECRET: "short-key" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/REVIEW_TOKEN_SECRET/u);
    expect(message).not.toContain("short-key");
  });

  it("the boot check leaves an absent key alone (a use-time error, like AUTH_SECRET)", () => {
    const { issues } = validateRuntimeEnv({ APP_ENV: "production" });
    expect(issues.map((issue) => issue.key)).not.toContain(
      "REVIEW_TOKEN_SECRET",
    );
  });
});

describe("AC-33 (env half): TRUSTPILOT_AFS_ADDRESS", () => {
  it("is an optional email", () => {
    expect(trustpilotAfsAddress({})).toBeUndefined();
    expect(
      trustpilotAfsAddress({ TRUSTPILOT_AFS_ADDRESS: "" }),
    ).toBeUndefined();
    expect(
      trustpilotAfsAddress({
        TRUSTPILOT_AFS_ADDRESS:
          "flowersoverseas.com+abc123@invite.trustpilot.com",
      }),
    ).toBe("flowersoverseas.com+abc123@invite.trustpilot.com");
    expect(() =>
      trustpilotAfsAddress({ TRUSTPILOT_AFS_ADDRESS: "not an address" }),
    ).toThrow(/TRUSTPILOT_AFS_ADDRESS/u);
  });

  it("both keys are in .env.example, blank", () => {
    const example = read(".env.example");
    expect(example).toMatch(/^REVIEW_TOKEN_SECRET=$/mu);
    expect(example).toMatch(/^TRUSTPILOT_AFS_ADDRESS=$/mu);
  });
});

describe("review.created v1 (spec 022a §5.2 'Events')", () => {
  it("is status-preserving, registered at version 1 as ReviewCreatedV1, buyer only", () => {
    expect(STATUS_PRESERVING_EVENTS).toContain("review.created");
    const registered = eventSchema("review.created");
    expect(registered?.version).toBe(1);
    expect(registered?.schema).toBe(ReviewCreatedV1);
    expect(STATUS_PRESERVING_ACTORS["review.created"]).toEqual(["buyer"]);
  });

  it("carries mode, reviewId and rating only, the rating 1 to 5", () => {
    expect(Object.keys(ReviewCreatedV1.shape).sort()).toEqual([
      "mode",
      "rating",
      "reviewId",
    ]);
    const valid = { mode: "live", reviewId: REVIEW_ID, rating: 1 };
    expect(ReviewCreatedV1.safeParse(valid).success).toBe(true);
    expect(ReviewCreatedV1.safeParse({ ...valid, rating: 5 }).success).toBe(
      true,
    );
    for (const rating of [0, 6, 4.5]) {
      expect(
        ReviewCreatedV1.safeParse({ ...valid, rating }).success,
        String(rating),
      ).toBe(false);
    }
    expect(
      ReviewCreatedV1.safeParse({ ...valid, text: "Lovely" }).success,
    ).toBe(false);
  });
});

describe("src/config/reviews.ts (spec 022a §5.2 'Constants')", () => {
  it("holds §5.2's numbers", () => {
    expect({ ...reviewsConfig }).toEqual({
      REVIEW_INVITE_DELAY_HOURS: 24,
      REVIEW_INVITE_LIFE_DAYS: 30,
      REVIEW_TEXT_MAX_GRAPHEMES: 1000,
      REVIEW_TEXT_MAX_CHARACTERS: 2000,
      REVIEW_BLOCK_MINIMUM: 3,
      REVIEWS_PAGE_INDEX_MINIMUM: 10,
      RATING_WINDOW_DAYS: 90,
      RATING_MINIMUM: 3,
      ACCEPTANCE_MINIMUM: 5,
      REVIEW_PENDING_ALERT_HOURS: 72,
      RATING_BP_PER_STAR: 2000,
      REVIEW_RATING_MIN: 1,
      REVIEW_RATING_MAX: 5,
    });
  });

  it("the database's text cap is the one the config states", () => {
    expect(up).toContain(
      `char_length(text) <= ${String(reviewsConfig.REVIEW_TEXT_MAX_CHARACTERS)}`,
    );
  });
});

describe("migration 0029 read as text (spec 022a §5.1)", () => {
  it("opens with the ownership preamble and closes with RESET ROLE, both files", () => {
    for (const sql of [up, down]) {
      expect(sql.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
        true,
      );
      expect(sql.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    }
  });

  it("review_invite equals its Drizzle mirror", () => {
    expect(mirrorShape("review_invite")).toEqual(sqlShape(up, "review_invite"));
  });

  it("stores the token's hash as hex text, never bytea and never the token", () => {
    expect(up).toMatch(/^\s+token_hash\s+text\s+NOT NULL,$/mu);
    expect(up).toContain("CHECK (token_hash ~ '^[0-9a-f]{64}$')");
    const sqlOnly = up
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(sqlOnly).not.toMatch(/\bbytea\b/iu);
    expect(sqlOnly).not.toMatch(/^\s+token\s/mu);
  });

  it("the down file refuses with REVIEWS_ROLLBACK_DATA_PRESENT before it drops or deletes anything", () => {
    const guard = down.indexOf("REVIEWS_ROLLBACK_DATA_PRESENT");
    expect(guard).toBeGreaterThan(0);
    const firstWrite = down.search(/^(DROP|DELETE|ALTER|CREATE)\b/mu);
    expect(firstWrite).toBeGreaterThan(guard);
    expect(down).toMatch(
      /EXISTS \(SELECT 1 FROM public\.review WHERE source = 'internal'\)\s+OR EXISTS \(SELECT 1 FROM public\.review_invite\)/u,
    );
  });

  it("drops the public read of review and creates the view in its place; the down restores it", () => {
    expect(up).toMatch(/^DROP POLICY review_read ON public\.review;$/mu);
    expect(up).toMatch(
      /CREATE VIEW public\.public_review WITH \(security_barrier = true\) AS/u,
    );
    expect(down).toMatch(/^DROP VIEW IF EXISTS public\.public_review;$/mu);
    expect(down).toMatch(
      /CREATE POLICY review_read ON public\.review FOR SELECT TO app_web\s+USING \(moderation_status = 'published'\);/u,
    );
  });
});
