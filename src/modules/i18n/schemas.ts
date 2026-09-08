/**
 * Catalogue and review-metadata schemas (spec 003 §2 "Messages", §5.1, §5.2, AC-4; TASK-038).
 *
 * Two boundaries are parsed here, both of them repo JSON that a human or a script writes:
 *
 *  - `MessagesSchema` — `messages/{locale}.json`: a namespaced tree whose leaves are ICU message
 *    strings. Shape only. ICU *parsing*, placeholder-set agreement between a key and its
 *    translations, missing and unused keys and redundant `en-gb` overrides are `pnpm i18n:check`
 *    (TASK-040): they are cross-file properties and a per-file schema cannot see them.
 *  - `MessageMetaSchema` — `messages/{locale}.meta.json`: the per-key review record of
 *    `plan/03` §5, keyed by the flattened dot path of the message it describes.
 *
 * **`MessageMetaSchema` is pinned to spec 002 §5.1's `message_catalog` review columns**
 * (`source`, `reviewed`, `reviewed_by`, `reviewed_at`, `source_hash`) through
 * `MESSAGE_META_COLUMNS`, which is the whole point of AC-4's third clause: spec 012 mirrors this
 * manifest into the table rather than translating field names, so the two cannot drift and a
 * rename on either side fails `tests/unit/i18n-messages-schema.test.ts`.
 *
 * `retained` is the one field with **no** column: it is the repo-only escape that lets
 * `i18n:check` accept a key `en.json` no longer uses (`plan/03` §5, spec 003 §2 "Lint, checks,
 * CI"), a question about this repository's catalogue rather than about a stored translation.
 * `REPO_ONLY_META_FIELDS` names it explicitly so "1:1 onto the review columns" stays a testable
 * statement instead of an approximate one.
 */
import { z } from "zod";

/**
 * A message tree: `{ errors: { notFound: { heading: "…" } } }`. Recursive, so nesting depth is
 * the author's choice (`plan/03` §5 uses `checkout.address.postcode`), and leaves are non-empty
 * strings — an empty translation is a missing translation, and it would render as nothing at all
 * rather than falling back.
 */
export type MessageTree = { readonly [key: string]: string | MessageTree };

const MessageKeySchema = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9]*$/,
    "message key segments are camelCase identifiers; the dot is the namespace separator",
  );

export const MessagesSchema: z.ZodType<MessageTree> = z.lazy(() =>
  z.record(
    MessageKeySchema,
    z.union([
      z.string().min(1, "an empty message is a missing message"),
      MessagesSchema,
    ]),
  ),
);

/** Who authored a value: `human` is founder/reviewer copy, `machine` is an `i18n:draft` output. */
export const MESSAGE_SOURCES = ["human", "machine"] as const;
export type MessageSourceKind = (typeof MESSAGE_SOURCES)[number];

/** sha256 of the English source value, lowercase hex: the drift record of §7. */
const SourceHashSchema = z
  .string()
  .regex(
    /^[0-9a-f]{64}$/,
    "sourceHash is a lowercase hex sha256 of the `en` value",
  );

/**
 * One key's review record. `.strict()` on purpose: an unknown field here is either a typo or a
 * field somebody added without giving spec 012 a column to mirror it into.
 */
export const MessageMetaSchema = z
  .object({
    source: z.enum(MESSAGE_SOURCES),
    reviewed: z.boolean(),
    reviewedBy: z.string().min(1).optional(),
    reviewedAt: z.iso.datetime().optional(),
    sourceHash: SourceHashSchema,
    retained: z.boolean().optional(),
  })
  .strict()
  .refine(
    (meta) =>
      !meta.reviewed ||
      (meta.reviewedBy !== undefined && meta.reviewedAt !== undefined),
    {
      error:
        "`reviewed: true` needs `reviewedBy` and `reviewedAt`: a review with no reviewer and no date is not an audit trail (plan/03 §5)",
    },
  );

export type MessageMeta = z.infer<typeof MessageMetaSchema>;

/** A whole `messages/{locale}.meta.json`: flattened message key -> review record. */
export const MessageMetaManifestSchema = z.record(
  z
    .string()
    .regex(
      /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/,
      "a manifest key is the flattened dot path of the message it describes",
    ),
  MessageMetaSchema,
);

export type MessageMetaManifest = z.infer<typeof MessageMetaManifestSchema>;

/**
 * `MessageMetaSchema` field -> spec 002 §5.1 `message_catalog` review column. Spec 012 mirrors
 * the manifest through this map; AC-4 pins both sides.
 */
export const MESSAGE_META_COLUMNS = {
  source: "source",
  reviewed: "reviewed",
  reviewedBy: "reviewed_by",
  reviewedAt: "reviewed_at",
  sourceHash: "source_hash",
} as const;

export type MessageMetaColumn =
  (typeof MESSAGE_META_COLUMNS)[keyof typeof MESSAGE_META_COLUMNS];

/** Manifest fields that deliberately have no `message_catalog` column (see the header). */
export const REPO_ONLY_META_FIELDS = ["retained"] as const;
