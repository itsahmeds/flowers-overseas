/**
 * The review ledger's pure half (spec 012b §2.4, AC-11, AC-12, AC-13; TASK-293): the product
 * copy hash, the review state, the snapshot provider and the input schemas. The database half —
 * the guard, `attest()`, and the SQL hash agreeing with this one — is
 * `tests/integration/review-ledger.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  ATTEST_REFUSALS,
  AttestInputSchema,
  type LedgerEntry,
  LedgerEntrySchema,
  type LedgerHead,
  productCopyHash,
  type ProductCopyContent,
  RequestChangeInputSchema,
  reviewStateOf,
  snapshotAttestationProvider,
  subjectHash,
  subjectKey,
} from "../../src/modules/i18n/attestation.ts";

const COPY: ProductCopyContent = {
  name: "Bursztynowa godzina",
  slug: "bursztynowa-godzina",
  descriptionMd: "Pomarańczowe róże 🌹",
  seoTitle: "Bursztynowa godzina: róże",
  seoDescription: null,
  alts: [
    { checksum: "b".repeat(64), alt: "Róże w papierze" },
    { checksum: "a".repeat(64), alt: "Bukiet z bliska" },
  ],
};

describe("productCopyHash (AC-12)", () => {
  it("is 64 lower-case hex digits and pinned for a fixed input (a format change is a new version tag)", () => {
    const hash = productCopyHash(COPY);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(productCopyHash(COPY)).toBe(hash);
    expect(
      productCopyHash({
        name: "a",
        slug: "b",
        descriptionMd: null,
        seoTitle: null,
        seoDescription: null,
        alts: [],
      }),
    ).toBe(
      // sha256("fo.review.product_translation.v1|1:a|1:b|~|~|~|alts"), computed outside Node.
      "4628a0636c3c5568adea3154b2cbcf557cf827c6b6da6d0c2ef3396892f85d5c",
    );
  });

  it("changes when each of the six parts changes, and the six changes are six different hashes", () => {
    const base = productCopyHash(COPY);
    const variants: ProductCopyContent[] = [
      { ...COPY, name: `${COPY.name}!` },
      { ...COPY, slug: `${COPY.slug}-2` },
      { ...COPY, descriptionMd: `${COPY.descriptionMd ?? ""}.` },
      { ...COPY, seoTitle: `${COPY.seoTitle ?? ""}.` },
      { ...COPY, seoDescription: "nowy opis" },
      {
        ...COPY,
        alts: [
          COPY.alts[0] ?? { checksum: "", alt: "" },
          {
            checksum: "a".repeat(64),
            alt: "Bukiet z bliska.",
          },
        ],
      },
    ];
    const hashes = variants.map(productCopyHash);
    for (const hash of hashes) expect(hash).not.toBe(base);
    expect(new Set(hashes).size).toBe(6);
  });

  it("an added or removed attached image changes it; the order images are listed in does not", () => {
    const base = productCopyHash(COPY);
    expect(productCopyHash({ ...COPY, alts: [...COPY.alts].reverse() })).toBe(
      base,
    );
    expect(productCopyHash({ ...COPY, alts: COPY.alts.slice(1) })).not.toBe(
      base,
    );
    expect(
      productCopyHash({
        ...COPY,
        alts: [...COPY.alts, { checksum: "c".repeat(64), alt: "Trzecie" }],
      }),
    ).not.toBe(base);
  });

  it("an absent field, an empty field and a moved boundary are three different texts", () => {
    const blank = { ...COPY, seoDescription: "" };
    expect(productCopyHash(blank)).not.toBe(productCopyHash(COPY));
    expect(productCopyHash({ ...COPY, name: "ab", slug: "c" })).not.toBe(
      productCopyHash({ ...COPY, name: "a", slug: "bc" }),
    );
    // A field cannot forge the separator of the next one.
    expect(productCopyHash({ ...COPY, name: "a|1:b", slug: "c" })).not.toBe(
      productCopyHash({ ...COPY, name: "a", slug: "b|1:c" }),
    );
  });

  it("subjectHash: a photo is its checksum; copy is productCopyHash", () => {
    expect(subjectHash({ kind: "media_asset", checksum: "e".repeat(64) })).toBe(
      "e".repeat(64),
    );
    expect(() =>
      subjectHash({ kind: "media_asset", checksum: "E".repeat(64) }),
    ).toThrow();
    expect(subjectHash({ kind: "product_translation", ...COPY })).toBe(
      productCopyHash(COPY),
    );
  });
});

describe("reviewStateOf (AC-12, AC-13)", () => {
  const head = (over: Partial<LedgerHead> = {}): LedgerHead => ({
    decision: "approved",
    valueHash: "1".repeat(64),
    sourceHash: "2".repeat(64),
    channel: "admin",
    ...over,
  });

  it("reviewed exactly when the latest decision is approved for the hash served now", () => {
    expect(reviewStateOf(head(), "1".repeat(64), "2".repeat(64))).toEqual({
      reviewed: true,
      decision: "approved",
      edited: false,
      stale: false,
      importedNotReRead: false,
    });
    expect(reviewStateOf(head(), "3".repeat(64), "2".repeat(64))).toEqual({
      reviewed: false,
      decision: "approved",
      edited: true,
      stale: false,
      importedNotReRead: false,
    });
    expect(reviewStateOf(undefined, "1".repeat(64))).toEqual({
      reviewed: false,
      decision: null,
      edited: false,
      stale: false,
      importedNotReRead: false,
    });
    for (const decision of ["rejected", "changes_requested"] as const) {
      expect(reviewStateOf(head({ decision }), "1".repeat(64)).reviewed).toBe(
        false,
      );
    }
    expect(reviewStateOf(head(), null).reviewed).toBe(false);
  });

  it("stale when the English source moved since, and still reviewed", () => {
    expect(reviewStateOf(head(), "1".repeat(64), "9".repeat(64))).toMatchObject(
      { reviewed: true, stale: true },
    );
    expect(
      reviewStateOf(head({ sourceHash: null }), "1".repeat(64), "9".repeat(64))
        .stale,
    ).toBe(false);
  });

  it("imported, not re-read: reviewed through the import, until a signed-in approval is the latest", () => {
    expect(
      reviewStateOf(head({ channel: "import" }), "1".repeat(64))
        .importedNotReRead,
    ).toBe(true);
    expect(
      reviewStateOf(head({ channel: "admin" }), "1".repeat(64))
        .importedNotReRead,
    ).toBe(false);
  });
});

describe("snapshotAttestationProvider", () => {
  const entry = (over: Partial<LedgerEntry>): LedgerEntry =>
    LedgerEntrySchema.parse({
      subjectKind: "media_asset",
      subjectRef: "a".repeat(64),
      localeCode: null,
      valueHash: "a".repeat(64),
      sourceHash: null,
      decision: "approved",
      attesterName: "founder",
      attestedAt: "2026-09-18T07:30:00.000Z",
      channel: "import",
      ...over,
    });

  it("gives each subject its newest entry and nothing for a subject with none", async () => {
    const provider = snapshotAttestationProvider([
      entry({ decision: "rejected", attestedAt: "2026-09-19T00:00:00.000Z" }),
      entry({}),
    ]);
    const photo = { kind: "media_asset", ref: "a".repeat(64) } as const;
    const other = { kind: "media_asset", ref: "b".repeat(64) } as const;
    const heads = await provider.heads([photo, other]);
    expect(heads.get(subjectKey(photo))?.decision).toBe("rejected");
    expect(heads.has(subjectKey(other))).toBe(false);
  });

  it("a ledger entry is a photo without a locale or copy with one", () => {
    expect(() => entry({ localeCode: "pl" })).toThrow();
    expect(() =>
      entry({ subjectKind: "product_translation", subjectRef: "FO-BQ-001" }),
    ).toThrow();
  });
});

describe("the input schemas and the refusals (AC-11)", () => {
  const valid = {
    userId: "8f0c2d4e-0000-4000-8000-000000000001",
    subject: { kind: "product_translation", ref: "FO-BQ-001", locale: "pl" },
    decision: "approved",
    valueHash: "a".repeat(64),
  };

  it("parses a decision, and refuses a malformed hash, subject or extra key", () => {
    expect(AttestInputSchema.parse(valid)).toMatchObject(valid);
    for (const bad of [
      { ...valid, valueHash: "A".repeat(64) },
      { ...valid, valueHash: "a".repeat(63) },
      { ...valid, subject: { kind: "media_asset", ref: "x" } },
      { ...valid, subject: { kind: "message", ref: "x", locale: "pl" } },
      { ...valid, decision: "maybe" },
      { ...valid, attesterName: "someone else" },
    ]) {
      expect(AttestInputSchema.safeParse(bad).success).toBe(false);
    }
    const change = {
      userId: valid.userId,
      subject: valid.subject,
      valueHash: valid.valueHash,
    };
    expect(RequestChangeInputSchema.safeParse(change).success).toBe(false);
    expect(
      RequestChangeInputSchema.safeParse({ ...change, note: "Użyj: bukiet" })
        .success,
    ).toBe(true);
  });

  it("answers a locale, name or permission refusal 403, a stale hash 409, a missing note 422", () => {
    expect(ATTEST_REFUSALS).toEqual({
      not_a_reviewer: 403,
      no_display_name: 403,
      locale_not_granted: 403,
      permission_denied: 403,
      unknown_subject: 404,
      stale_hash: 409,
      note_required: 422,
    });
  });
});
