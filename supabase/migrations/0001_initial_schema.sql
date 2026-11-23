-- CloudDock initial database foundation
-- Apply through the Supabase SQL editor or migrations workflow after reviewing.
-- This schema stores customer-owned service requests only; it does NOT provision infrastructure.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  product_type text not null check (product_type in (
    'minecraft', 'discord_bot', 'website', 'game_server', 'vps', 'database'
  )),
  region text,
  status text not null default 'requested' check (status in (
    'requested', 'reviewing', 'approved', 'rejected', 'cancelled'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_owner_created_idx
  on public.service_requests (owner_id, created_at desc);

create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 60),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists service_events_request_created_idx
  on public.service_events (service_request_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_events enable row level security;

-- A signed-in user may only read and edit their own profile.
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Customers can submit and view their own requests. They cannot approve or
-- change request status; trusted backend/admin workflows handle that later.
drop policy if exists "Users can read their own service requests" on public.service_requests;
create policy "Users can read their own service requests"
  on public.service_requests for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Users can submit service requests" on public.service_requests;
create policy "Users can submit service requests"
  on public.service_requests for insert to authenticated
  with check (auth.uid() = owner_id and status = 'requested');

-- Events are read-only to customers and visible only for their own requests.
drop policy if exists "Users can read events for their own requests" on public.service_events;
create policy "Users can read events for their own requests"
  on public.service_events for select to authenticated
  using (
    exists (
      select 1
      from public.service_requests sr
      where sr.id = service_events.service_request_id
        and sr.owner_id = auth.uid()
    )
  );

-- Intentionally no public/anon policies and no customer write policy for events.
-- Do not expose the service-role key in the browser. Add server-side admin
-- authorization before building staff workflows or real provisioning.
