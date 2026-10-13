-- 0010_auth — identity: the Auth.js v5 Drizzle-adapter tables, the admin sub-roles, and the three
-- keys that waited for `users` (spec 002 §5.1 "`auth`", §13 Q1, AC-4, T-35; `plan/11` §1;
-- ADR-0015; TASK-022).
--
-- Q1 resolved: Auth.js v5 with the Drizzle adapter. The adapter is handed our tables
-- (`DrizzleAdapter(db, { usersTable, accountsTable, sessionsTable, verificationTokensTable })`),
-- so it binds to the Drizzle *property* names in `db/schema/auth.ts` (`id`, `email`,
-- `emailVerified`, `userId`, `providerAccountId`, `sessionToken`, `refresh_token` …), which are
-- exactly the adapter's, while the SQL columns follow this schema's snake case. T-35
-- (`tests/integration/auth-adapter.test.ts`) runs the adapter's own round trip — create user,
-- create session, get session and user, delete session — against these tables unmodified.
--
--   `users`               one row per person who signs in: the founder and admins (`user_role`),
--                         florists (`partner_member`), and buyers who choose an account
--                         (`customer.user_id`). Guest buyers have a `customer` row and no `users`
--                         row (`plan/11` §1); recipients never authenticate (spec 029). The id is
--                         a `uuid`, because every key that points here is one. The email is
--                         unique and stored lower-case (Auth.js normalises it before every call).
--   `accounts`, `sessions`, `verification_tokens`   the adapter's; `ON DELETE CASCADE` from
--                         `users`, because the adapter deletes a user by its row alone.
--   `user_role`           the admin sub-roles of `plan/11` §1 (`admin`, `ops`, `finance`,
--                         `content`).
--
-- The three deferred keys (TASK-018 and TASK-021): `partner_member.user_id` CASCADE (a deleted
-- user's memberships go with them), `customer.user_id` SET NULL (the buyer's row stays for the
-- invoice and loses its login), `audit_log.actor_user_id` SET NULL (the record outlives the
-- account; `actor_label` says who it was).
--
-- No policy (RLS is `0011`). Rollback: `0010_auth.down.sql`.

SET LOCAL ROLE app_owner;

CREATE TABLE public.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NULL,
  email          text        NOT NULL,
  email_verified timestamptz NULL,
  image          text        NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_check CHECK (
    email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  )
);

CREATE TABLE public.accounts (
  user_id             uuid        NOT NULL,
  type                text        NOT NULL,
  provider            text        NOT NULL,
  provider_account_id text        NOT NULL,
  refresh_token       text        NULL,
  access_token        text        NULL,
  expires_at          integer     NULL,
  token_type          text        NULL,
  scope               text        NULL,
  id_token            text        NULL,
  session_state       text        NULL,
  CONSTRAINT accounts_pkey PRIMARY KEY (provider, provider_account_id),
  CONSTRAINT accounts_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE INDEX accounts_user_id_idx ON public.accounts USING btree (user_id);

CREATE TABLE public.sessions (
  session_token text PRIMARY KEY,
  user_id       uuid        NOT NULL,
  expires       timestamptz NOT NULL,
  CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

CREATE TABLE public.verification_tokens (
  identifier text        NOT NULL,
  token      text        NOT NULL,
  expires    timestamptz NOT NULL,
  CONSTRAINT verification_tokens_pkey PRIMARY KEY (identifier, token)
);

CREATE TABLE public.user_role (
  user_id    uuid        NOT NULL,
  role       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_role_pkey PRIMARY KEY (user_id, role),
  CONSTRAINT user_role_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT user_role_role_check CHECK (role IN ('admin', 'ops', 'finance', 'content'))
);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * the keys that waited for users
 * ------------------------------------------------------------------------ */

ALTER TABLE public.partner_member
  ADD CONSTRAINT partner_member_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.customer
  ADD CONSTRAINT customer_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE SET NULL;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id)
    REFERENCES public.users (id) ON DELETE SET NULL;

RESET ROLE;
