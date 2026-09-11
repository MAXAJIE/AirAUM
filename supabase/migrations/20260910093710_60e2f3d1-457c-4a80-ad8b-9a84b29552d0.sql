CREATE OR REPLACE FUNCTION public.try_uuid(_t TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN _t::uuid; EXCEPTION WHEN others THEN RETURN NULL; END; $$;
REVOKE EXECUTE ON FUNCTION public.try_uuid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_uuid(text) TO authenticated, service_role;

CREATE POLICY "task photos readable by org members"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-photos' AND public.is_org_member(public.try_uuid((storage.foldername(name))[1])));

CREATE POLICY "task photos uploadable by org members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-photos' AND public.is_org_member(public.try_uuid((storage.foldername(name))[1])));

CREATE POLICY "task photos removable by org admins"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-photos' AND public.is_org_admin(public.try_uuid((storage.foldername(name))[1])));

CREATE POLICY "backups readable by org admins"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'org-backups' AND public.is_org_admin(public.try_uuid((storage.foldername(name))[1])));