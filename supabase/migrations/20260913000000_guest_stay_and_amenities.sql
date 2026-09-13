-- AirClean: guest stay portal (no login) + amenity/inventory verification.
--
-- Ported from the Air product line and adapted to the AirAUM organisation
-- model (organizations / org_members / properties). Guests never touch the
-- database directly: every write goes through a server function that
-- re-validates the stay session with the service role, so no anon grants and
-- no anon policies are created here.

-- ------------------------------------------------------------- thresholds
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS complaint_star_threshold INTEGER NOT NULL DEFAULT 4;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_complaint_star_threshold_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_complaint_star_threshold_check
      CHECK (complaint_star_threshold BETWEEN 1 AND 5);
  END IF;
END $$;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS complaint_star_threshold INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_complaint_star_threshold_check') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_complaint_star_threshold_check
      CHECK (complaint_star_threshold IS NULL OR complaint_star_threshold BETWEEN 1 AND 5);
  END IF;
END $$;

-- ------------------------------------------------------------- guest code
-- Short, shareable code used in the guest URL (/g/<code>). It only identifies
-- the property; the guest still proves the stay with the door access code.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_code TEXT;

UPDATE public.properties
   SET guest_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 WHERE guest_code IS NULL;

ALTER TABLE public.properties
  ALTER COLUMN guest_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
ALTER TABLE public.properties ALTER COLUMN guest_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS properties_guest_code_idx ON public.properties (guest_code);

-- ---------------------------------------------------------- guest sessions
CREATE TABLE IF NOT EXISTS public.guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name TEXT,
  party_size INTEGER CHECK (party_size IS NULL OR party_size BETWEEN 1 AND 30),
  contact_number_enc TEXT,
  check_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_sessions TO authenticated;
GRANT ALL ON public.guest_sessions TO service_role;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest sessions" ON public.guest_sessions;
CREATE POLICY "Members read guest sessions"
  ON public.guest_sessions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS guest_sessions_property_idx ON public.guest_sessions (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_sessions_org_idx ON public.guest_sessions (org_id, created_at DESC);

-- ------------------------------------------------------ amenity definitions
CREATE TABLE IF NOT EXISTS public.amenity_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  expected_qty INTEGER NOT NULL DEFAULT 1 CHECK (expected_qty >= 0),
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, name)
);

GRANT SELECT ON public.amenity_definitions TO authenticated;
GRANT ALL ON public.amenity_definitions TO service_role;
ALTER TABLE public.amenity_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read amenity definitions" ON public.amenity_definitions;
CREATE POLICY "Members read amenity definitions"
  ON public.amenity_definitions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS amenity_definitions_property_idx
  ON public.amenity_definitions (property_id, sort_order, name);

-- ---------------------------------------------------------- amenity checks
CREATE TABLE IF NOT EXISTS public.amenity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  amenity_id UUID NOT NULL REFERENCES public.amenity_definitions(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.guest_sessions(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'guest' CHECK (source IN ('guest', 'cleaner')),
  found_qty INTEGER NOT NULL CHECK (found_qty >= 0),
  note TEXT,
  checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.amenity_checks TO authenticated;
GRANT ALL ON public.amenity_checks TO service_role;
ALTER TABLE public.amenity_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read amenity checks" ON public.amenity_checks;
CREATE POLICY "Members read amenity checks"
  ON public.amenity_checks FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- One row per amenity per stay, so a guest can correct a count.
CREATE UNIQUE INDEX IF NOT EXISTS amenity_checks_session_amenity_idx
  ON public.amenity_checks (session_id, amenity_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS amenity_checks_property_idx
  ON public.amenity_checks (property_id, created_at DESC);

-- ------------------------------------------------------------ guest reports
CREATE TABLE IF NOT EXISTS public.guest_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.guest_sessions(id) ON DELETE CASCADE,
  overall_rating INTEGER CHECK (overall_rating IS NULL OR overall_rating BETWEEN 1 AND 5),
  notes TEXT,
  complaint TEXT,
  kind TEXT NOT NULL DEFAULT 'feedback' CHECK (kind IN ('feedback', 'low_rating', 'complaint')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_reports TO authenticated;
GRANT ALL ON public.guest_reports TO service_role;
ALTER TABLE public.guest_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest reports" ON public.guest_reports;
CREATE POLICY "Members read guest reports"
  ON public.guest_reports FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS guest_reports_org_idx ON public.guest_reports (org_id, status, created_at DESC);

-- ------------------------------------------------------ guest report photos
CREATE TABLE IF NOT EXISTS public.guest_report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.guest_reports(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_report_photos TO authenticated;
GRANT ALL ON public.guest_report_photos TO service_role;
ALTER TABLE public.guest_report_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest report photos" ON public.guest_report_photos;
CREATE POLICY "Members read guest report photos"
  ON public.guest_report_photos FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS guest_report_photos_report_idx ON public.guest_report_photos (report_id);
