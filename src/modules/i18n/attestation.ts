/**
 * The review ledger's pure half: subjects, their hash, the review state, the input schemas and
 * the provider seam (spec 012b §2.4, §5.2 `src/modules/i18n`, AC-11, AC-12, AC-13; proposed
 * ADR-0022; TASK-293).
 *
 * A subject is **reviewed** exactly when its latest ledger decision is `approved` and that row's
 * `valueHash` equals the hash of what is served now. Two subject kinds in slice A:
 *
 *  - `product_translation` — one (product, locale), referenced by the product's SKU. Its hash
 *    covers the name, slug, description, SEO title and SEO description, and the alt text in that
 *    locale of every image attached to the product (`productCopyHash`). Changing any one of them
 *    makes that locale unreviewed (AC-12).
 *  - `media_asset` — one photo, referenced by and hashed as its `checksum_sha256`: a photo is its
 *    bytes, so the reference is the same in every database the ledger is replayed into.
 *
 * `productCopyHash` is the TypeScript twin of `public.review_product_copy_hash()` (migration
 * `0019`): the same canonical text — a version tag, then each field as `|~` (absent) or
 * `|{UTF-8 byte length}:{value}`, then `|alts` and one `|alt|…|…` per image ordered by checksum
 * and alt in byte order — hashed with SHA-256 to 64 lower-case hex digits. The integration suite
 * holds the two equal; a change to either is a new version tag, never an edit.
 *
 * No database here (`pnpm check:no-db` scans this module): the ledger reads and the one writer,
 * `attest()`, are in `./db/ledger.ts`.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

/** The subject kinds slice A reviews (the ledger's CHECK admits slice B's six as well). */
export const SLICE_A_SUBJECT_KINDS = [
  "product_translation",
  "media_asset",
] as const;
export type SubjectKind = (typeof SLICE_A_SUBJECT_KINDS)[number];

export const REVIEW_DECISIONS = [
  "approved",
  "changes_requested",
  "rejected",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type ReviewChannel = "admin" | "import";

/** The English source every other locale's copy is reviewed against (§2.4 `source_hash`). */
export const SOURCE_LOCALE = "en";

const HashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u, "a lower-case SHA-256 hex digest");
const SkuSchema = z.string().trim().min(1).max(64);
const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2}(?:-[a-z]{2})?$/u, "a locale code such as pl or en-gb");

/** One subject: what a ledger row is about. */
export const SubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("product_translation"),
      ref: SkuSchema,
      locale: LocaleSchema,
    })
    .strict(),
  z.object({ kind: z.literal("media_asset"), ref: HashSchema }).strict(),
]);
export type Subject = z.infer<typeof SubjectSchema>;

/** The subject's locale, or `null` for a photo. */
export function subjectLocale(subject: Subject): string | null {
  return subject.kind === "product_translation" ? subject.locale : null;
}

/** A stable map key for a subject. */
export function subjectKey(subject: Subject): string {
  return `${subject.kind}|${subject.ref}|${subjectLocale(subject) ?? ""}`;
}

/**
 * What a signed-in reviewer submits (§5.2 `AttestInputSchema`): who, about what, the decision,
 * and the hash of the exact text or image they read — so an approval of text that changed
 * between reading and clicking is refused as stale (AC-11). `note` is required for a change
 * request; that rule is `attest()`'s refusal, not a parse error, so it writes nothing and says so.
 */
export const AttestInputSchema = z
  .object({
    userId: z.uuid(),
    subject: SubjectSchema,
    decision: z.enum(REVIEW_DECISIONS),
    valueHash: HashSchema,
    note: z.string().trim().max(2000).optional(),
    suggestedText: z.string().max(20_000).optional(),
    requestId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9.:_-]+$/u)
      .optional(),
  })
  .strict();
export type AttestInput = z.input<typeof AttestInputSchema>;

/** A change request (§5.2 `RequestChangeInputSchema`): an attestation with a required note. */
export const RequestChangeInputSchema = AttestInputSchema.omit({
  decision: true,
}).extend({ note: z.string().trim().max(2000) });
export type RequestChangeInput = z.input<typeof RequestChangeInputSchema>;

/**
 * One ledger row in its database-independent form: the shape of `seed/data/attestations.json`
 * and of an imported approval. No user id: an imported row has none, and a replayed admin row
 * could not keep one across databases.
 */
export const LedgerEntrySchema = z
  .object({
    subjectKind: z.enum(SLICE_A_SUBJECT_KINDS),
    subjectRef: z.string().trim().min(1),
    localeCode: LocaleSchema.nullable(),
    valueHash: HashSchema,
    sourceHash: HashSchema.nullable(),
    decision: z.enum(REVIEW_DECISIONS),
    attesterName: z.string().trim().min(1),
    attestedAt: z.iso.datetime({ offset: true }),
    channel: z.literal("import"),
  })
  .strict()
  .refine(
    (entry) =>
      (entry.subjectKind === "media_asset") === (entry.localeCode === null),
    {
      message: "a photo has no locale; product copy has one",
      path: ["localeCode"],
    },
  );
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const AttestationsFileSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("import"),
    entity: z.literal("review_attestation"),
    rows: z.array(LedgerEntrySchema),
  })
  .strict();
export type AttestationsFile = z.infer<typeof AttestationsFileSchema>;

/** The subject of a ledger entry. */
export function entrySubject(entry: LedgerEntry): Subject {
  return entry.subjectKind === "media_asset"
    ? { kind: "media_asset", ref: entry.subjectRef }
    : {
        kind: "product_translation",
        ref: entry.subjectRef,
        locale: entry.localeCode ?? "",
      };
}

/* -------------------------------------------------------------------------- */
/* The hash.                                                                   */
/* -------------------------------------------------------------------------- */

/** The alt text of one attached image, keyed by the image's checksum. */
export interface AttachedAlt {
  readonly checksum: string;
  readonly alt: string;
}

/** The six hashed parts of one product copy subject (§2.4). */
export interface ProductCopyContent {
  readonly name: string;
  readonly slug: string;
  readonly descriptionMd: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly alts: readonly AttachedAlt[];
}

/** What a subject's hash is computed from. */
export type SubjectContent =
  | ({ readonly kind: "product_translation" } & ProductCopyContent)
  | { readonly kind: "media_asset"; readonly checksum: string };

const PRODUCT_COPY_TAG = "fo.review.product_translation.v1";

function part(value: string | null): string {
  return value === null
    ? "|~"
    : `|${String(Buffer.byteLength(value, "utf8"))}:${value}`;
}

/** Byte order of the UTF-8 encodings: Postgres's `COLLATE "C"`. */
function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** The product copy hash: `public.review_product_copy_hash()`'s twin (see the header). */
export function productCopyHash(content: ProductCopyContent): string {
  const alts = [...content.alts]
    .sort(
      (a, b) => byteOrder(a.checksum, b.checksum) || byteOrder(a.alt, b.alt),
    )
    .map((entry) => `|alt${part(entry.checksum)}${part(entry.alt)}`)
    .join("");
  const text =
    PRODUCT_COPY_TAG +
    part(content.name) +
    part(content.slug) +
    part(content.descriptionMd) +
    part(content.seoTitle) +
    part(content.seoDescription) +
    "|alts" +
    alts;
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The hash of what a subject serves now (§5.2 `subjectHash`). */
export function subjectHash(content: SubjectContent): string {
  if (content.kind === "media_asset") return HashSchema.parse(content.checksum);
  return productCopyHash(content);
}

/* -------------------------------------------------------------------------- */
/* The review state.                                                           */
/* -------------------------------------------------------------------------- */

/** The newest ledger row of a subject, as the runtime reads it: never the attester's name. */
export interface LedgerHead {
  readonly decision: ReviewDecision;
  readonly valueHash: string;
  readonly sourceHash: string | null;
  readonly channel: ReviewChannel;
}

export interface ReviewState {
  /** The latest decision is `approved` and it is for the hash served now. */
  readonly reviewed: boolean;
  /** The latest decision, or `null` when the subject was never reviewed. */
  readonly decision: ReviewDecision | null;
  /** Approved once, but what is served now is not what was approved (an edit reopened it). */
  readonly edited: boolean;
  /** Reviewed, but the English source changed since (`plan/03` §6 step 5: stays indexable). */
  readonly stale: boolean;
  /** Reviewed through the one-time import and not yet re-read by a signed-in reviewer (§2.0.4). */
  readonly importedNotReRead: boolean;
}

/**
 * The review state of a subject from its newest ledger row, the hash it serves now (`null` when
 * it does not exist) and, for non-English copy, the current English source hash.
 */
export function reviewStateOf(
  head: LedgerHead | undefined,
  currentHash: string | null,
  currentSourceHash: string | null = null,
): ReviewState {
  const approved = head?.decision === "approved";
  const reviewed =
    approved && currentHash !== null && head.valueHash === currentHash;
  return {
    reviewed,
    decision: head?.decision ?? null,
    edited: approved && !reviewed,
    stale:
      reviewed &&
      head.sourceHash !== null &&
      currentSourceHash !== null &&
      head.sourceHash !== currentSourceHash,
    importedNotReRead: reviewed && head.channel === "import",
  };
}

/* -------------------------------------------------------------------------- */
/* The provider seam.                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Where ledger heads come from (§5.2 `AttestationProvider`): the database in production
 * (`dbAttestationProvider`, `./db/ledger.ts`) and a snapshot of ledger entries in tests and in
 * any reader that has no database (`snapshotAttestationProvider`).
 */
export interface AttestationProvider {
  /** The newest ledger row of each subject that has one, keyed by `subjectKey`. */
  heads(subjects: readonly Subject[]): Promise<ReadonlyMap<string, LedgerHead>>;
}

/** The newest entry wins; on a tie, the later entry in the list. */
export function snapshotAttestationProvider(
  entries: readonly LedgerEntry[],
): AttestationProvider {
  const newest = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    const key = subjectKey(entrySubject(entry));
    const seen = newest.get(key);
    if (
      seen === undefined ||
      Date.parse(entry.attestedAt) >= Date.parse(seen.attestedAt)
    ) {
      newest.set(key, entry);
    }
  }
  return {
    heads(subjects) {
      const out = new Map<string, LedgerHead>();
      for (const subject of subjects) {
        const key = subjectKey(subject);
        const entry = newest.get(key);
        if (entry !== undefined) {
          out.set(key, {
            decision: entry.decision,
            valueHash: entry.valueHash,
            sourceHash: entry.sourceHash,
            channel: entry.channel,
          });
        }
      }
      return Promise.resolve(out);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Refusals.                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Why `attest()` wrote nothing (AC-11), with the HTTP status an admin action answers it with.
 * Every refusal writes no row at all.
 */
export const ATTEST_REFUSALS = {
  /** No active admin profile with a role: not a signed-in reviewer. */
  not_a_reviewer: 403,
  /** The profile's `display_name` is blank: a decision must carry a name. */
  no_display_name: 403,
  /** Product copy in a locale the user does not hold in `reviewer_locale`. */
  locale_not_granted: 403,
  /** A photo, and the user's roles lack `media.review`. */
  permission_denied: 403,
  /** No such subject. */
  unknown_subject: 404,
  /** The submitted hash is not the hash served now: the text changed after it was read. */
  stale_hash: 409,
  /** A change request without a note. */
  note_required: 422,
} as const;
export type AttestRefusal = keyof typeof ATTEST_REFUSALS;

export type AttestOutcome =
  | {
      readonly ok: true;
      /** The ledger row, or the existing one an identical import matched. */
      readonly id: string;
      readonly attestedAt: string;
      /** False only for an import entry that was already in the ledger. */
      readonly created: boolean;
      /** The §5.4 tags of a review decision ("the same as a copy change"). */
      readonly tags: readonly string[];
    }
  | {
      readonly ok: false;
      readonly refusal: AttestRefusal;
      readonly status: (typeof ATTEST_REFUSALS)[AttestRefusal];
    };

export function refused(refusal: AttestRefusal): AttestOutcome {
  return { ok: false, refusal, status: ATTEST_REFUSALS[refusal] };
}
