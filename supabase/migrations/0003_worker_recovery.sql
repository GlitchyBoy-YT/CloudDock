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
