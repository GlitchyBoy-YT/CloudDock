-- Automatically create a profile when Supabase Auth creates a user.
create or replace function public.handle_new_clouddock_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_clouddock_auth_user_created on auth.users;
create trigger on_clouddock_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_clouddock_user();
revoke all on function public.handle_new_clouddock_user() from public, anon, authenticated;
