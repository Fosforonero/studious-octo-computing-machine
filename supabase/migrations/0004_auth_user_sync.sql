create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- handle_new_user is returns-trigger only (Postgres refuses to invoke it outside
-- a trigger context), but SECURITY DEFINER functions in `public` are still
-- EXECUTE-granted to PUBLIC by default, which the security advisor flags as a
-- public RPC endpoint (/rest/v1/rpc/handle_new_user). Revoke it — the trigger
-- system invokes the function directly and does not need this grant.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
