-- Rollback of 0046_placeholder_window (spec 012b §12; TASK-295): the flag row and its scope rows.

SET LOCAL ROLE app_owner;

DELETE FROM public.feature_flag_scope WHERE flag_key = 'catalogue.placeholder_window';
DELETE FROM public.feature_flag WHERE key = 'catalogue.placeholder_window';

RESET ROLE;
