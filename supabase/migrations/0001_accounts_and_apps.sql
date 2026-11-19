-- CloudDock account-owned application records.
-- Run this migration in the Supabase SQL Editor before enabling the dashboard.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  platform text not null check (platform in ('Discord','Nerimity','Fluxer','Stoat')),
  runtime text not null check (runtime in ('Node.js','Python','Docker image (planned)')),
  status text not null default 'stopped' check (status in ('stopped','queued','running','failed')),
  version text not null default 'Not deployed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apps_owner_created_idx on public.apps(owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.apps enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can manage their own apps" on public.apps;
create policy "Users can manage their own apps" on public.apps
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.profiles from anon;
revoke all on public.apps from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.apps to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
