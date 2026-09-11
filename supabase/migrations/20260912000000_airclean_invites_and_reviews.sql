-- AirClean: team invitation codes + customer reviews.

-- ---------------------------------------------------------------- invitations
create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  role public.app_role not null default 'cleaner',
  label text,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select on public.invite_codes to authenticated;
grant all on public.invite_codes to service_role;

alter table public.invite_codes enable row level security;

-- Staff can see the codes for their own workspace. Redemption runs server-side
-- with the service role, so no anon access is needed here.
create policy "Staff read invite codes"
  on public.invite_codes for select to authenticated
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = invite_codes.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'manager', 'supervisor')
    )
  );

create index invite_codes_org_idx on public.invite_codes (org_id, created_at desc);
create index invite_codes_code_idx on public.invite_codes (code);

-- -------------------------------------------------------------------- reviews
create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  cleanliness integer check (cleanliness between 1 and 5),
  communication integer check (communication between 1 and 5),
  customer_name text,
  customer_email text,
  comment text,
  source text not null default 'public_link',
  status text not null default 'new' check (status in ('new', 'published', 'archived')),
  reply text,
  replied_by uuid references auth.users(id) on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.customer_reviews to authenticated;
grant all on public.customer_reviews to service_role;

alter table public.customer_reviews enable row level security;

-- Guests submit through a server function using the service role, so writes are
-- validated in code rather than opened up to anon here.
create policy "Members read their workspace reviews"
  on public.customer_reviews for select to authenticated
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = customer_reviews.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "Admins update their workspace reviews"
  on public.customer_reviews for update to authenticated
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = customer_reviews.org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'manager')
    )
  );

create index customer_reviews_org_idx on public.customer_reviews (org_id, created_at desc);
create index customer_reviews_status_idx on public.customer_reviews (status);

create trigger t_customer_reviews_upd
  before update on public.customer_reviews
  for each row execute function public.set_updated_at();
