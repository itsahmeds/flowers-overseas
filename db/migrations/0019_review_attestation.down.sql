-- Rollback of 0019_review_attestation (spec 012b §5.1 item 2; TASK-293): the guard triggers, the
-- retention row, then the tables and the functions.
--
-- The review columns of `product_translation` and `media_asset` keep whatever `attest()` wrote:
-- after the rollback they are plain columns again, which is what they were before `0019`.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS product_translation_review_write_guard ON public.product_translation;
DROP TRIGGER IF EXISTS media_asset_review_write_guard ON public.media_asset;

DELETE FROM public.retention_policy WHERE key = 'review_attestation';

DROP TABLE IF EXISTS public.review_attestation;
DROP TABLE IF EXISTS public.reviewer_locale;

DROP FUNCTION IF EXISTS public.review_write_guard();
DROP FUNCTION IF EXISTS public.review_row_is_own(xid);
DROP FUNCTION IF EXISTS public.review_subject_hash(text, text, text);
DROP FUNCTION IF EXISTS public.review_product_copy_hash(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.review_hash_part(text);
DROP FUNCTION IF EXISTS public.review_attestation_append_only();

RESET ROLE;
