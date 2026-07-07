alter table public.audits add column paid boolean not null default false;
alter table public.audits add column stripe_checkout_session_id text;

create or replace function public.claim_next_audit()
returns setof public.audits
language plpgsql
security definer
set search_path = public
as $$
declare selected public.audits;
begin
  select * into selected
  from public.audits
  where status = 'pending' and paid = true
  order by created_at
  for update skip locked
  limit 1;

  if selected.id is null then return; end if;

  update public.audits
  set status = 'running', error_message = null
  where id = selected.id
  returning * into selected;

  return next selected;
end;
$$;

revoke all on function public.claim_next_audit() from public, anon, authenticated;
grant execute on function public.claim_next_audit() to service_role;
