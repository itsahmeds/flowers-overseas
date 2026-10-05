-- 0006_customers — buyers, their billing addresses, the people they send flowers to, where those
-- people are, and the consent records (spec 002 §5.1 "`customers`", §7, §8, AC-27; `plan/07` §1.2,
-- §1.3, §1.5, §5; `plan/11` §1, §3; TASK-018).
--
-- Five tables — `customer`, `address`, `recipient`, `recipient_address`, `consent_log` — their
-- `updated_at` triggers, and one supporting key on `0002`'s `postcode_zone`. No policy (RLS is
-- `0011`, TASK-023: customer-scoped tables key on `app.user_id` through `customer.user_id`), no
-- seed row (there are no seeded people), no writer (spec 010's `modules/customers` and the consent
-- sink of spec 004 are the writers).
--
-- The four properties this migration is measured on
-- --------------------------------------------------
--
--   1. **No recipient email, by design and by gate** (`plan/07` §1.3 "no recipient email at all",
--      §8, AC-27). `recipient` and `recipient_address` have no column whose name matches
--      `/e[-_]?mail/i`, and `pnpm db:check` fails the pull request that adds one, citing
--      `plan/07` §1.3 (`scripts/db-check.ts`, `checkRecipientEmail`). Recipient contact is a name,
--      a phone, an address and a delivery note; nothing else.
--   2. **A recipient's phone is required until the contact is redacted** (`plan/07` §1.3: "phone
--      required"; §8 retention). `recipient_phone_check` admits a missing phone only on a row
--      the 90-day sweep (TASK-025) has pseudonymised, and `contact_redacted` and
--      `contact_redacted_at` are set together or not at all; `customer.redacted` and
--      `redacted_at` likewise (`plan/07` §1.5: "pseudonymise, keep the invoice, flag it").
--   3. **One live customer per email, case-insensitively, without `citext`** (§2: no extension).
--      `customer_email_normalised_idx` is a unique index on `lower(email_normalised)` where the
--      row is not redacted, so a pseudonymised buyer frees the address and a returning buyer who
--      types `Anna@X.pl` finds the row `anna@x.pl` made.
--   4. **A truncated IP at most** (`plan/07` §5, §8). `consent_log.source_ip_truncated` is `cidr`,
--      which cannot carry host bits, and its check admits an IPv4 network of /24 or wider or an
--      IPv6 one of /48 or wider. No other column in this migration can hold an address, and no
--      table has a full-IP or device-fingerprint column.
--
-- Column sets are §5.1's, in §5.1's order, then `created_at` / `updated_at` (`consent_log` has no
-- `updated_at`: a consent record is written once and never updated, §5.1 "where it is ever
-- updated"). The value lists are the tuples in `db/schema/customers.ts`, pinned against this file
-- by `tests/unit/schema-partners-customers.test.ts`.
--
-- **Deviations from §5.1's text, declared rather than silent**
--
--   - *`customer.user_id` has no foreign key yet.* `users` is `0010` (TASK-022), which adds the
--     constraint and drops it in its rollback (carried forward in its brief).
--   - *`postcode_zone_id_country_key`.* `recipient_address` carries `country_id` and a nullable
--     `postcode_zone_id`; the composite reference `(postcode_zone_id, country_id) → postcode_zone
--     (id, country_id)` (`MATCH SIMPLE`, so a null zone skips it) keeps a Polish address from
--     pointing at a German routing zone. `0002` gives `city` and `region` the same redundant
--     `(id, country_id)` key for the same reason; `postcode_zone` gains it here, and the rollback
--     drops it.
--   - *Not-null choices.* §5.1 marks only some columns `NULL`. Required: a customer's email, a
--     recipient's buyer and name, an address's lines, city and country, a consent record's kind,
--     choices, policy version and time. Nullable: a customer's name, phone and country (a buyer
--     may be known by email alone), a postal code (not every country has one, `plan/03` §8), a
--     consent record's `subject_ref` for a visitor (who is an `anonymous_id`, spec 004's `cid`).
--   - *Types.* `consent_log.subject_ref` and `anonymous_id` are `uuid` (a customer or recipient
--     id; spec 004's `cid`), without a foreign key: the proof of consent outlives the row it is
--     about (5 years after withdrawal, §8). `policy_version` is an `integer`, as
--     `CONSENT_POLICY_VERSION` in `src/lib/consent.ts` is.
--   - *Primary keys.* `address` (§5.1 gives it one), `recipient_address` and `consent_log` have a
--     surrogate `id`.
--   - *Shape checks* beyond §5.1, each one line: an email is one `@` with no whitespace, phones
--     are E.164, `country_iso2` is two upper-case letters (no foreign key: a buyer may live in a
--     country we do not deliver to), `lines` holds no null element, a name is not blank.
--
-- **Indexes, measured rather than copied.** Beyond primary keys and the email index, exactly four,
-- one per foreign key that a customer-scoped read starts from (`plan/11` §1: a signed-in buyer
-- reads their own rows) and that a pseudonymisation or erasure walks: `customer (user_id)`,
-- `address (customer_id)`, `recipient (customer_id)`, `recipient_address (recipient_id)`.
-- Deliberately not indexed: `recipient (linked_customer_id)` (customers are pseudonymised, never
-- deleted, so its `RESTRICT` check never runs in practice), `consent_log` by subject (a 5-year
-- sweep over a table of thousands; measure again when it is not).
--
-- Rollback: `0006_customers.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * customer — a buyer, guest or signed in
 * ------------------------------------------------------------------------ */

-- `user_id` will reference `users (id)` from `0010` (TASK-022), which adds the constraint. A guest
-- buyer has a `customer` row and no `users` row (`plan/11` §1).
CREATE TABLE public.customer (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NULL,
  email_normalised  text        NOT NULL,
  name              text        NULL,
  phone_e164        text        NULL,
  country_iso2      text        NULL,
  marketing_consent boolean     NOT NULL DEFAULT false,
  redacted          boolean     NOT NULL DEFAULT false,
  redacted_at       timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_email_normalised_check CHECK (email_normalised ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  CONSTRAINT customer_phone_e164_check CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT customer_country_iso2_check CHECK (country_iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT customer_redacted_check CHECK (redacted = (redacted_at IS NOT NULL))
);

-- §5.1, verbatim: case-insensitive uniqueness by `lower()`, never `citext` (no extension, §2).
CREATE UNIQUE INDEX customer_email_normalised_idx
  ON public.customer USING btree (lower(email_normalised)) WHERE redacted = false;

CREATE INDEX customer_user_id_idx ON public.customer USING btree (user_id);

COMMENT ON COLUMN public.customer.country_iso2 IS
  'For invoicing and payment-method availability only, never access control (ADR-0006, EU 2018/302).';

/* ---------------------------------------------------------------------------
 * address — a buyer's billing address
 * ------------------------------------------------------------------------ */

CREATE TABLE public.address (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid        NOT NULL,
  kind         text        NOT NULL,
  lines        text[]      NOT NULL,
  postal_code  text        NULL,
  city         text        NOT NULL,
  country_iso2 text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT address_kind_check CHECK (kind IN ('billing')),
  CONSTRAINT address_lines_check CHECK (array_position(lines, NULL) IS NULL),
  CONSTRAINT address_country_iso2_check CHECK (country_iso2 ~ '^[A-Z]{2}$')
);

CREATE INDEX address_customer_id_idx ON public.address USING btree (customer_id);

/* ---------------------------------------------------------------------------
 * recipient — the person who receives the flowers. There is no email column (AC-27).
 * ------------------------------------------------------------------------ */

CREATE TABLE public.recipient (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid        NOT NULL,
  full_name           text        NOT NULL,
  phone_e164          text        NULL,
  is_self             boolean     NOT NULL DEFAULT false,
  linked_customer_id  uuid        NULL,
  contact_redacted    boolean     NOT NULL DEFAULT false,
  contact_redacted_at timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipient_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT recipient_linked_customer_id_customer_id_fk FOREIGN KEY (linked_customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT recipient_full_name_check CHECK (btrim(full_name) <> ''),
  CONSTRAINT recipient_phone_e164_check CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT recipient_phone_check CHECK (contact_redacted OR phone_e164 IS NOT NULL),
  CONSTRAINT recipient_contact_redacted_check CHECK (
    contact_redacted = (contact_redacted_at IS NOT NULL)
  )
);

CREATE INDEX recipient_customer_id_idx ON public.recipient USING btree (customer_id);

COMMENT ON TABLE public.recipient IS
  'plan/07 §1.3: no recipient email at all. db:check fails any /e[-_]?mail/i column on recipient or recipient_address (AC-27).';

/* ---------------------------------------------------------------------------
 * recipient_address — where the flowers go
 * ------------------------------------------------------------------------ */

-- The supporting key for the composite reference below (header: "postcode_zone_id_country_key").
ALTER TABLE public.postcode_zone
  ADD CONSTRAINT postcode_zone_id_country_key UNIQUE (id, country_id);

CREATE TABLE public.recipient_address (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id     uuid        NOT NULL,
  lines            text[]      NOT NULL,
  postal_code      text        NULL,
  city             text        NOT NULL,
  country_id       uuid        NOT NULL,
  postcode_zone_id uuid        NULL,
  delivery_note    text        NULL,
  place_kind       text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipient_address_recipient_id_recipient_id_fk FOREIGN KEY (recipient_id)
    REFERENCES public.recipient (id) ON DELETE RESTRICT,
  CONSTRAINT recipient_address_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  -- MATCH SIMPLE (the default): a null zone skips the check; a zone must be in the address's country.
  CONSTRAINT recipient_address_postcode_zone_fkey FOREIGN KEY (postcode_zone_id, country_id)
    REFERENCES public.postcode_zone (id, country_id) ON DELETE RESTRICT,
  CONSTRAINT recipient_address_lines_check CHECK (array_position(lines, NULL) IS NULL),
  CONSTRAINT recipient_address_place_kind_check CHECK (place_kind IN (
    'home', 'work', 'hospital', 'funeral_home', 'hotel', 'cemetery', 'church'
  ))
);

CREATE INDEX recipient_address_recipient_id_idx
  ON public.recipient_address USING btree (recipient_id);

/* ---------------------------------------------------------------------------
 * consent_log — proof of a consent choice (GDPR Art. 7(1)), never a profile
 * ------------------------------------------------------------------------ */

CREATE TABLE public.consent_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind        text        NOT NULL,
  subject_ref         uuid        NULL,
  anonymous_id        uuid        NULL,
  choices             jsonb       NOT NULL,
  policy_version      integer     NOT NULL,
  occurred_at         timestamptz NOT NULL,
  source_ip_truncated cidr        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_log_subject_kind_check CHECK (subject_kind IN (
    'visitor', 'customer', 'recipient'
  )),
  CONSTRAINT consent_log_subject_check CHECK (
    CASE subject_kind
      WHEN 'visitor' THEN anonymous_id IS NOT NULL AND subject_ref IS NULL
      ELSE subject_ref IS NOT NULL
    END
  ),
  CONSTRAINT consent_log_choices_check CHECK (jsonb_typeof(choices) = 'object'),
  CONSTRAINT consent_log_policy_version_check CHECK (policy_version > 0),
  -- A network, never a host: cidr refuses host bits, and the prefix is at most /24 or /48.
  CONSTRAINT consent_log_source_ip_truncated_check CHECK (
    (family(source_ip_truncated) = 4 AND masklen(source_ip_truncated) <= 24)
    OR (family(source_ip_truncated) = 6 AND masklen(source_ip_truncated) <= 48)
  )
);

COMMENT ON COLUMN public.consent_log.source_ip_truncated IS
  'plan/07 §5: a truncated IP at most — an IPv4 /24 or an IPv6 /48 network, never a host address.';

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10): one per updated table, all on `0001`'s shared function
 * ------------------------------------------------------------------------ */

CREATE TRIGGER customer_set_updated_at BEFORE UPDATE ON public.customer
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER address_set_updated_at BEFORE UPDATE ON public.address
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER recipient_set_updated_at BEFORE UPDATE ON public.recipient
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER recipient_address_set_updated_at BEFORE UPDATE ON public.recipient_address
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
