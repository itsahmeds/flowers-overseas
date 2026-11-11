-- 0049_product_origin (spec 030b §14.3 `NNNN_product_origin`, AC-51, AC-57; TASK-443).
--
-- Which florist a bouquet **belongs to** (whose design it is), distinct from every florist who can
-- make it (`partner_catalog_mapping`). Kept off `product` so no public or build read can ever
-- reach a partner id (spec 012b AC-17).
--
--   1. `product_origin`: at most one florist per product; `set_by` names the admin for every
--      source but `backfill`; `set_updated_at()`; index `(partner_id)`.
--   2. Audit trigger (ids only, so no masked column).
--   3. RLS: `admin` and `system` only (`app_is_staff()`); no grant to `app_build`.
--   4. Index `partner_catalog_mapping (product_id, tier_key)`: the Made by tab and the Supply
--      matrix read mappings by product, and the existing unique index leads with the partner.
--   5. Backfill: each `source = 'real'` product whose non-demo mappings all belong to one florist
--      (one row per size is still one florist) gets one `backfill` row naming that florist; every
--      other product gets none.

SET LOCAL ROLE app_owner;

/* 1. the table */
CREATE TABLE public.product_origin (
  product_id uuid PRIMARY KEY REFERENCES public.product (id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  source text NOT NULL,
  set_by uuid NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_origin_source_check
    CHECK (source IN ('backfill', 'supplier_save', 'import', 'admin')),
  CONSTRAINT product_origin_set_by_check CHECK (source = 'backfill' OR set_by IS NOT NULL)
);
CREATE INDEX product_origin_partner_id_idx ON public.product_origin (partner_id);
CREATE TRIGGER product_origin_set_updated_at BEFORE UPDATE ON public.product_origin
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* 2. audit */
CREATE TRIGGER product_origin_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_origin
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_id');

/* 3. RLS: staff only, no build grant */
ALTER TABLE public.product_origin ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_origin_staff ON public.product_origin FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
REVOKE ALL ON public.product_origin FROM app_build;

/* 4. mappings by product */
CREATE INDEX partner_catalog_mapping_product_tier_idx
  ON public.partner_catalog_mapping (product_id, tier_key);

/* 5. backfill: one non-demo florist maps the product (any number of its sizes), so no guess */
INSERT INTO public.product_origin (product_id, partner_id, source)
SELECT m.product_id, (array_agg(DISTINCT m.partner_id))[1], 'backfill'
  FROM public.partner_catalog_mapping m
  JOIN public.product p ON p.id = m.product_id AND p.source = 'real'
  JOIN public.fulfillment_partner fp ON fp.id = m.partner_id AND fp.status <> 'demo'
 GROUP BY m.product_id
HAVING count(DISTINCT m.partner_id) = 1;

RESET ROLE;
