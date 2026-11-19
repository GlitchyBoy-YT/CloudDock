-- CloudDock operational recovery and lifecycle safeguards.
-- Reclaims abandoned worker jobs and marks stale workers offline.
create or replace function public.clouddock_reconcile_stale_jobs()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  recovered integer := 0;
  item record;
begin
  update public.hosting_workers
    set status='offline'
    where status='online'
      and (last_heartbeat_at is null or last_heartbeat_at < now() - interval '90 seconds');

  for item in
    select id,service_id,owner_id,worker_id,attempts
    from public.hosting_jobs
    where status in ('claimed','running')
      and claimed_at < now() - interval '10 minutes'
    for update skip locked
  loop
    if item.attempts < 3 then
      update public.hosting_jobs
        set status='queued',worker_id=null,claimed_at=null,
            error='Worker lease expired; job returned to the queue.'
        where id=item.id;
      update public.hosting_services
        set status='queued',worker_id=null,updated_at=now(),
            last_error='Worker connection was interrupted; retry queued.'
        where id=item.service_id and status not in ('suspended');
    else
      update public.hosting_jobs
        set status='failed',completed_at=now(),
            error='Worker lease expired too many times; operator review is required.'
        where id=item.id;
      update public.hosting_services
        set status='failed',worker_id=null,updated_at=now(),
            last_error='Deployment worker was unavailable after multiple attempts.'
        where id=item.service_id and status not in ('suspended');
      insert into public.hosting_service_events(service_id,owner_id,level,message)
        values(item.service_id,item.owner_id,'error','A hosting operation stopped retrying after repeated worker timeouts.');
    end if;
    recovered := recovered + 1;
  end loop;
  return recovered;
end;
$$;
revoke all on function public.clouddock_reconcile_stale_jobs() from public,anon,authenticated;
grant execute on function public.clouddock_reconcile_stale_jobs() to service_role;

-- Deletion is a worker operation so running containers are stopped before records disappear.
alter table public.hosting_jobs drop constraint if exists hosting_jobs_action_check;
alter table public.hosting_jobs add constraint hosting_jobs_action_check
  check (action in ('start','stop','restart','deploy','delete'));

create or replace function public.clouddock_enqueue_job(p_service_id uuid,p_owner_id uuid,p_action text)
returns public.hosting_jobs
language plpgsql
security definer
set search_path=''
as $$
declare svc public.hosting_services;
declare job public.hosting_jobs;
begin
  if p_action not in ('start','stop','restart','deploy','delete') then raise exception 'Unsupported action'; end if;
  select * into svc from public.hosting_services where id=p_service_id and owner_id=p_owner_id for update;
  if not found then raise exception 'Service not found'; end if;
  if svc.status = 'suspended' and p_action in ('start','restart','deploy') then raise exception 'Service is suspended'; end if;
  if exists(select 1 from public.hosting_jobs where service_id=p_service_id and status in ('queued','claimed','running')) then
    raise exception 'A service operation is already in progress';
  end if;
  insert into public.hosting_jobs(service_id,owner_id,worker_id,action,payload)
    values(p_service_id,p_owner_id,svc.worker_id,p_action,jsonb_build_object('service_type',svc.service_type,'runtime',svc.runtime,'region',svc.region))
    returning * into job;
  update public.hosting_services set status='queued',desired_state=case when p_action in ('start','restart','deploy') then 'running' else 'stopped' end,updated_at=now()
    where id=p_service_id;
  return job;
end;
$$;
revoke all on function public.clouddock_enqueue_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.clouddock_enqueue_job(uuid,uuid,text) to service_role;
