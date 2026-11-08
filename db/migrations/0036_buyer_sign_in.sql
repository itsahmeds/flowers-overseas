-- 0036_buyer_sign_in — when a buyer last signed in to their account (spec 018 §14
-- A-founder-2026-10-22 C.4, C.11; AC-49; TASK-344).
--
-- Each confirmed buyer sign-in sets `customer.last_signed_in_at` (the `afterSignIn` hook of
-- `src/lib/auth/buyer.ts`, one transaction with the link or creation of the customer). C.11 lists
-- the column among the five `customer` columns of `NNNN_buyer_account` (TASK-352); it ships here
-- because the sign-in that writes it ships here, and TASK-352's migration adds the other four.
-- C.9's inactive-account sweep (TASK-345) reads it.
--
-- No backfill: a customer who never signed in keeps NULL. No RLS change: the column sits on a
-- table whose policies already scope it, and only the `system` hook writes it.
--
-- Rollback: `0036_buyer_sign_in.down.sql`.

SET LOCAL ROLE app_owner;

ALTER TABLE public.customer ADD COLUMN last_signed_in_at timestamptz NULL;

COMMENT ON COLUMN public.customer.last_signed_in_at IS
  'spec 018 C.4: set by every confirmed buyer sign-in; the inactive-account sweep (C.9) reads it.';

RESET ROLE;
