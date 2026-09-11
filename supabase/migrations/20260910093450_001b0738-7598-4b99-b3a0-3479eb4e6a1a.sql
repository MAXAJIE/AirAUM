-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner','manager','supervisor','cleaner','technician');
CREATE TYPE public.member_status AS ENUM ('pending','active','suspended');
CREATE TYPE public.task_type AS ENUM ('turnover_clean','deep_clean','inspection','maintenance','restock');
CREATE TYPE public.task_status AS ENUM ('unassigned','assigned','in_progress','submitted','needs_review','completed','cancelled');
CREATE TYPE public.qc_status AS ENUM ('pending','pass','needs_review','fail','skipped');
CREATE TYPE public.photo_ai_status AS ENUM ('pending','processing','pass','needs_review','fail','error');
CREATE TYPE public.booking_source AS ENUM ('manual','csv','airbnb','booking_com','agoda','direct','other');
CREATE TYPE public.maint_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.maint_status AS ENUM ('open','triaged','assigned','resolved','dismissed');
CREATE TYPE public.notify_channel AS ENUM ('in_app','email','whatsapp');
CREATE TYPE public.notify_status AS ENUM ('queued','sent','failed','skipped','read');

-- ============ SHARED TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ CORE TABLES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  phone_enc TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  currency TEXT NOT NULL DEFAULT 'MYR',
  qc_auto_threshold NUMERIC NOT NULL DEFAULT 0.90,
  qc_review_threshold NUMERIC NOT NULL DEFAULT 0.70,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'cleaner',
  status public.member_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX org_members_user_idx ON public.org_members(user_id, status);

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org AND m.user_id = auth.uid() AND m.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org, ARRAY['owner','manager']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.is_org_staff(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org, ARRAY['owner','manager','supervisor']::public.app_role[]);
$$;

-- ============ OPERATIONAL TABLES ============
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_label TEXT,
  city TEXT,
  address_enc TEXT,
  access_code_enc TEXT,
  bedrooms INT NOT NULL DEFAULT 1,
  bathrooms INT NOT NULL DEFAULT 1,
  notes TEXT,
  turnover_minutes INT NOT NULL DEFAULT 180,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX properties_org_idx ON public.properties(org_id);

CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task_type public.task_type NOT NULL DEFAULT 'turnover_clean',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checklists_org_idx ON public.checklists(org_id);

CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT 'general',
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX checklist_items_list_idx ON public.checklist_items(checklist_id, position);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  external_ref TEXT,
  guest_name TEXT,
  guests INT NOT NULL DEFAULT 1,
  source public.booking_source NOT NULL DEFAULT 'manual',
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  check_out_time TIME NOT NULL DEFAULT '11:00',
  next_check_in_time TIME NOT NULL DEFAULT '15:00',
  cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bookings_org_idx ON public.bookings(org_id, check_out);
CREATE UNIQUE INDEX bookings_dedupe_idx ON public.bookings(org_id, property_id, check_in, check_out, COALESCE(external_ref,''));

CREATE TABLE public.cleaner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_city TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  max_daily_tasks INT NOT NULL DEFAULT 4,
  quality_score NUMERIC NOT NULL DEFAULT 4.0,
  reliability NUMERIC NOT NULL DEFAULT 0.85,
  cancellations_30d INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00'
);
CREATE INDEX availability_rules_idx ON public.availability_rules(org_id, user_id, weekday);

CREATE TABLE public.time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT
);
CREATE INDEX time_off_idx ON public.time_off(org_id, user_id, starts_at);

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  checklist_id UUID REFERENCES public.checklists(id) ON DELETE SET NULL,
  type public.task_type NOT NULL DEFAULT 'turnover_clean',
  status public.task_status NOT NULL DEFAULT 'unassigned',
  title TEXT NOT NULL DEFAULT 'Turnover clean',
  scheduled_start TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  qc_status public.qc_status NOT NULL DEFAULT 'pending',
  qc_score NUMERIC,
  qc_summary TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_org_due_idx ON public.tasks(org_id, due_at);
CREATE INDEX tasks_assignee_idx ON public.tasks(assigned_to, status);
CREATE UNIQUE INDEX tasks_booking_type_idx ON public.tasks(booking_id, type) WHERE booking_id IS NOT NULL;

CREATE TABLE public.task_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT 'general',
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX task_items_task_idx ON public.task_items(task_id, position);

CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_item_id UUID REFERENCES public.task_items(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT 'general',
  photo_type TEXT NOT NULL DEFAULT 'proof',
  ai_status public.photo_ai_status NOT NULL DEFAULT 'pending',
  ai_result JSONB,
  ai_confidence NUMERIC,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX photos_task_idx ON public.photos(task_id);

CREATE TABLE public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  photo_key TEXT,
  category TEXT,
  severity public.maint_severity,
  status public.maint_status NOT NULL DEFAULT 'open',
  ai_confidence NUMERIC,
  ai_summary TEXT,
  requires_human_review BOOLEAN NOT NULL DEFAULT true,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_org_idx ON public.maintenance_requests(org_id, status);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.notify_channel NOT NULL DEFAULT 'in_app',
  template TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  to_address TEXT,
  status public.notify_status NOT NULL DEFAULT 'queued',
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_queue_idx ON public.notifications(status, channel);

CREATE TABLE public.ai_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  model TEXT,
  input JSONB,
  output JSONB,
  confidence NUMERIC,
  requires_human_review BOOLEAN NOT NULL DEFAULT true,
  accepted BOOLEAN,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  latency_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_decisions_org_idx ON public.ai_decisions(org_id, created_at DESC);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON public.audit_logs(org_id, created_at DESC);

CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_key TEXT,
  size_bytes BIGINT,
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX backups_org_idx ON public.backups(org_id, created_at DESC);

-- ============ UPDATED_AT TRIGGERS ============
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_org_upd BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_members_upd BEFORE UPDATE ON public.org_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_props_upd BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_checklists_upd BEFORE UPDATE ON public.checklists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_bookings_upd BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cleaners_upd BEFORE UPDATE ON public.cleaner_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_tasks_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_maint_upd BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.organizations, public.org_members,
  public.properties, public.checklists, public.checklist_items, public.bookings,
  public.cleaner_profiles, public.availability_rules, public.time_off, public.tasks,
  public.task_items, public.photos, public.maintenance_requests, public.notifications,
  public.ai_decisions, public.audit_logs, public.backups TO authenticated;
GRANT ALL ON public.profiles, public.organizations, public.org_members,
  public.properties, public.checklists, public.checklist_items, public.bookings,
  public.cleaner_profiles, public.availability_rules, public.time_off, public.tasks,
  public.task_items, public.photos, public.maintenance_requests, public.notifications,
  public.ai_decisions, public.audit_logs, public.backups TO service_role;

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- profiles: self only, plus staff can read profiles of members in their org
CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_org_read ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = profiles.id AND public.is_org_member(m.org_id))
);
CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- organizations
CREATE POLICY orgs_read ON public.organizations FOR SELECT TO authenticated USING (
  public.is_org_member(id) OR EXISTS (
    SELECT 1 FROM public.org_members m WHERE m.org_id = organizations.id AND m.user_id = auth.uid())
);
CREATE POLICY orgs_create ON public.organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY orgs_update ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));
CREATE POLICY orgs_delete ON public.organizations FOR DELETE TO authenticated USING (public.has_org_role(id, ARRAY['owner']::public.app_role[]));

-- org_members
CREATE POLICY members_read_self ON public.org_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY members_read_org ON public.org_members FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY members_join ON public.org_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY members_admin_insert ON public.org_members FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY members_admin_update ON public.org_members FOR UPDATE TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY members_admin_delete ON public.org_members FOR DELETE TO authenticated USING (public.is_org_admin(org_id));

-- properties: all active members read; admins write
CREATE POLICY props_read ON public.properties FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY props_write ON public.properties FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- checklists
CREATE POLICY cl_read ON public.checklists FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY cl_write ON public.checklists FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY cli_read ON public.checklist_items FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY cli_write ON public.checklist_items FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- bookings: staff only
CREATE POLICY bookings_read ON public.bookings FOR SELECT TO authenticated USING (public.is_org_staff(org_id));
CREATE POLICY bookings_write ON public.bookings FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- cleaner profiles: staff read all, cleaner reads own; admins write; cleaner updates own prefs
CREATE POLICY cp_read ON public.cleaner_profiles FOR SELECT TO authenticated USING (public.is_org_staff(org_id) OR user_id = auth.uid());
CREATE POLICY cp_admin_write ON public.cleaner_profiles FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY av_read ON public.availability_rules FOR SELECT TO authenticated USING (public.is_org_staff(org_id) OR user_id = auth.uid());
CREATE POLICY av_self_write ON public.availability_rules FOR ALL TO authenticated USING (user_id = auth.uid() AND public.is_org_member(org_id)) WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));
CREATE POLICY av_admin_write ON public.availability_rules FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY to_read ON public.time_off FOR SELECT TO authenticated USING (public.is_org_staff(org_id) OR user_id = auth.uid());
CREATE POLICY to_self_write ON public.time_off FOR ALL TO authenticated USING (user_id = auth.uid() AND public.is_org_member(org_id)) WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));
CREATE POLICY to_admin_write ON public.time_off FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- tasks: staff see all in org; assignee sees own
CREATE POLICY tasks_read ON public.tasks FOR SELECT TO authenticated USING (public.is_org_staff(org_id) OR (assigned_to = auth.uid() AND public.is_org_member(org_id)));
CREATE POLICY tasks_admin_write ON public.tasks FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY tasks_assignee_update ON public.tasks FOR UPDATE TO authenticated USING (assigned_to = auth.uid() AND public.is_org_member(org_id)) WITH CHECK (assigned_to = auth.uid() AND public.is_org_member(org_id));

-- task items
CREATE POLICY ti_read ON public.task_items FOR SELECT TO authenticated USING (
  public.is_org_staff(org_id) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_items.task_id AND t.assigned_to = auth.uid())
);
CREATE POLICY ti_admin_write ON public.task_items FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY ti_assignee_update ON public.task_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_items.task_id AND t.assigned_to = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_items.task_id AND t.assigned_to = auth.uid())
);

-- photos
CREATE POLICY photos_read ON public.photos FOR SELECT TO authenticated USING (
  public.is_org_staff(org_id) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = photos.task_id AND t.assigned_to = auth.uid())
);
CREATE POLICY photos_insert ON public.photos FOR INSERT TO authenticated WITH CHECK (
  public.is_org_staff(org_id) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = photos.task_id AND t.assigned_to = auth.uid())
);
CREATE POLICY photos_admin_write ON public.photos FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- maintenance
CREATE POLICY maint_read ON public.maintenance_requests FOR SELECT TO authenticated USING (
  public.is_org_staff(org_id) OR reported_by = auth.uid() OR assigned_to = auth.uid()
);
CREATE POLICY maint_insert ON public.maintenance_requests FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY maint_admin_write ON public.maintenance_requests FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY maint_assignee_update ON public.maintenance_requests FOR UPDATE TO authenticated USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

-- notifications: recipient reads own; staff read org
CREATE POLICY notif_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_staff(org_id));
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_admin_write ON public.notifications FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ai decisions & audit: staff read only, writes go through service role
CREATE POLICY ai_read ON public.ai_decisions FOR SELECT TO authenticated USING (public.is_org_staff(org_id));
CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_org_staff(org_id));
CREATE POLICY backups_read ON public.backups FOR SELECT TO authenticated USING (public.is_org_admin(org_id));