-- AirClean: one review QR per property.
--
-- Reviews used to arrive through a single workspace link (/r/<slug>), so every
-- property was blended into one stream and the guest had to pick the unit from
-- a dropdown. Each property now carries its own short review code used in
-- /r/p/<code>, printed as a QR in the unit, so feedback is attributed to the
-- right property automatically.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS review_code TEXT;

UPDATE public.properties
   SET review_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
 WHERE review_code IS NULL;

ALTER TABLE public.properties
  ALTER COLUMN review_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
ALTER TABLE public.properties ALTER COLUMN review_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS properties_review_code_idx ON public.properties (review_code);

-- Reviews are read per property on the workspace dashboard.
CREATE INDEX IF NOT EXISTS customer_reviews_property_idx
  ON public.customer_reviews (org_id, property_id, created_at DESC);
