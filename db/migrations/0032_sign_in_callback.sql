-- 0032_sign_in_callback — the page an emailed sign-in link opens, stored beside its hashed token
-- (spec 016 §5.2 "One-tap florist link", §12's request on spec 012: `createSignInLink(surface,
-- userId, { callbackPath })`; AC-23; TASK-331).
--
-- A florist order email carries the sign-in core's link `{base}/sign-in/confirm?t={token}`, with no
-- address and no path in it. Where the confirmed sign-in lands (`{FLORIST_BASE_PATH}/orders/{id}`)
-- is kept on the server, on the token's own row, so the URL stays free of personal data and of any
-- open-redirect parameter. The core accepts only the surface's own pattern (the florist surface:
-- one order of the inbox) before it writes the column and again before it redirects; this check is
-- the database's floor: a site path of plain path characters, no `//`, no query.
--
-- The row is deleted when the token is used (the adapter's `useVerificationToken`), so the path
-- lives exactly as long as the token: one hour at most, single use.
--
-- Rollback: `0032_sign_in_callback.down.sql`.

SET LOCAL ROLE app_owner;

ALTER TABLE public.verification_tokens ADD COLUMN callback_path text NULL;
ALTER TABLE public.verification_tokens ADD CONSTRAINT verification_tokens_callback_path_check CHECK (
  callback_path ~ '^/[A-Za-z0-9/_-]{1,255}$' AND position('//' IN callback_path) = 0
);

COMMENT ON COLUMN public.verification_tokens.callback_path IS
  'spec 016 §5.2: where a confirmed sign-in from this link lands (a florist order page); never an address or a query.';

RESET ROLE;
