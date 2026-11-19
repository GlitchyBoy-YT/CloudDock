-- CloudDock hosting control plane: customer services, plans, jobs, worker registry.
create extension if not exists pgcrypto;

create table if not exists public.hosting_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  max_services integer not null check (max_services >= 0),
  max_memory_mb integer not null check (max_memory_mb >= 128),
  max_storage_mb integer not null check (max_storage_mb >= 128),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.hosting_plans(id,name,description,monthly_price_cents,max_services,max_memory_mb,max_storage_mb,enabled)
values ('free','Free','Development plan; service creation is enabled, but deployments require an available worker.',0,2,512,1024,true)
on conflict(id) do nothing;

create table if not exists public.hosting_services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null default 'free' references public.hosting_plans(id),
  name text not null check (char_length(name) between 1 and 48),
  service_type text not null check (service_type in ('bot','minecraft','website')),
  platform text check (platform in ('discord','nerimity','fluxer','stoat') or platform is null),
  runtime text not null check (runtime in ('nodejs','python','minecraft-java','static-site')),
  region text not null default 'auto',
  status text not null default 'created' check (status in ('created','queued','starting','running','stopping','stopped','failed','suspended')),
  desired_state text not null default 'stopped' check (desired_state in ('running','stopped')),
  worker_id uuid,
  container_id text,
  source_object text,
  memory_mb integer not null default 256 check (memory_mb between 128 and 16384),
  storage_mb integer not null default 512 check (storage_mb between 128 and 102400),
  cpu_millicores integer not null default 500 check (cpu_millicores between 100 and 8000),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hosting_services_owner_idx on public.hosting_services(owner_id,created_at desc);
create index if not exists hosting_services_worker_idx on public.hosting_services(worker_id,status);

create table if not exists public.hosting_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  region text not null,
  status text not null default 'offline' check (status in ('online','offline','draining')),
  capacity_memory_mb integer not null check (capacity_memory_mb >= 0),
  used_memory_mb integer not null default 0 check (used_memory_mb >= 0),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.hosting_services add constraint hosting_services_worker_fk
  foreign key(worker_id) references public.hosting_workers(id) on delete set null;

create table if not exists public.hosting_jobs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.hosting_services(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid references public.hosting_workers(id) on delete set null,
  action text not null check (action in ('start','stop','restart','deploy')),
  status text not null default 'queued' check (status in ('queued','claimed','running','succeeded','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);
create index if not exists hosting_jobs_queue_idx on public.hosting_jobs(status,created_at) where status='queued';
create index if not exists hosting_jobs_owner_idx on public.hosting_jobs(owner_id,created_at desc);

create table if not exists public.hosting_service_secrets (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.hosting_services(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  secret_name text not null check (secret_name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  encrypted_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_id,secret_name)
);

create table if not exists public.hosting_service_events (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.hosting_services(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists hosting_events_service_idx on public.hosting_service_events(service_id,created_at desc);

alter table public.hosting_services enable row level security;
alter table public.hosting_jobs enable row level security;
alter table public.hosting_workers enable row level security;
alter table public.hosting_plans enable row level security;
alter table public.hosting_service_secrets enable row level security;
alter table public.hosting_service_events enable row level security;

drop policy if exists "Customers read enabled plans" on public.hosting_plans;
create policy "Customers read enabled plans" on public.hosting_plans for select to authenticated using (enabled=true);
drop policy if exists "Customers manage their services" on public.hosting_services;
create policy "Customers manage their services" on public.hosting_services for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists "Customers read their jobs" on public.hosting_jobs;
create policy "Customers read their jobs" on public.hosting_jobs for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists "Customers read their service events" on public.hosting_service_events;
create policy "Customers read their service events" on public.hosting_service_events for select to authenticated using(owner_id=(select auth.uid()));

revoke all on public.hosting_workers,public.hosting_service_secrets from anon,authenticated;
revoke all on public.hosting_services,public.hosting_jobs,public.hosting_service_events,public.hosting_plans from anon;
grant select on public.hosting_services,public.hosting_jobs,public.hosting_service_events,public.hosting_plans to authenticated;
grant all on public.hosting_services,public.hosting_jobs,public.hosting_workers,public.hosting_plans,public.hosting_service_secrets,public.hosting_service_events to service_role;

create or replace function public.clouddock_claim_job(p_worker_id uuid)
returns setof public.hosting_jobs
language plpgsql
security definer
set search_path=''
as $$
declare claimed public.hosting_jobs;
begin
  update public.hosting_workers set last_heartbeat_at=now(),status='online'
    where id=p_worker_id and status <> 'draining';
  if not found then return; end if;
  select * into claimed from public.hosting_jobs
    where status='queued' and (worker_id is null or worker_id=p_worker_id)
    order by created_at
    for update skip locked limit 1;
  if not found then return; end if;
  update public.hosting_jobs set status='claimed',worker_id=p_worker_id,claimed_at=now(),attempts=attempts+1
    where id=claimed.id returning * into claimed;
  return next claimed;
end;
$$;
revoke all on function public.clouddock_claim_job(uuid) from public,anon,authenticated;
grant execute on function public.clouddock_claim_job(uuid) to service_role;

create or replace function public.clouddock_enqueue_job(p_service_id uuid,p_owner_id uuid,p_action text)
returns public.hosting_jobs
language plpgsql
security definer
set search_path=''
as $$
declare svc public.hosting_services;
declare job public.hosting_jobs;
begin
  if p_action not in ('start','stop','restart','deploy') then raise exception 'Unsupported action'; end if;
  select * into svc from public.hosting_services where id=p_service_id and owner_id=p_owner_id for update;
  if not found then raise exception 'Service not found'; end if;
  if svc.status in ('suspended','failed') and p_action in ('start','restart','deploy') then raise exception 'Service is not eligible for this action'; end if;
  if exists(select 1 from public.hosting_jobs where service_id=p_service_id and status in ('queued','claimed','running')) then
    raise exception 'A service operation is already in progress';
  end if;
  insert into public.hosting_jobs(service_id,owner_id,action,payload)
    values(p_service_id,p_owner_id,p_action,jsonb_build_object('service_type',svc.service_type,'runtime',svc.runtime,'region',svc.region))
    returning * into job;
  update public.hosting_services set status='queued',desired_state=case when p_action in ('start','restart','deploy') then 'running' else 'stopped' end,updated_at=now()
    where id=p_service_id;
  return job;
end;
$$;
revoke all on function public.clouddock_enqueue_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.clouddock_enqueue_job(uuid,uuid,text) to service_role;


-- Private object storage for customer source ZIPs. Only the control plane signs upload/download URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('service-source','service-source',false,104857600,array['application/zip','application/x-zip-compressed'])
on conflict(id) do update set public=false,file_size_limit=104857600,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "No direct customer access to service source" on storage.objects;
create policy "No direct customer access to service source" on storage.objects
  for all to authenticated using (false) with check (false);
