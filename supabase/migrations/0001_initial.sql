create extension if not exists pgcrypto;

create type public.audit_status as enum ('pending', 'running', 'completed', 'failed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  url text not null,
  normalized_url text not null,
  page_goal text not null,
  status public.audit_status not null default 'pending',
  overall_score smallint check (overall_score between 0 and 100),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table public.audit_pages (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null unique references public.audits(id) on delete cascade,
  url text not null,
  title text,
  meta_description text,
  h1 text,
  visible_text text,
  desktop_screenshot_url text,
  mobile_screenshot_url text,
  extracted_json jsonb not null default '{}'::jsonb
);

create table public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null unique references public.audits(id) on delete cascade,
  report_json jsonb not null,
  executive_summary text not null,
  created_at timestamptz not null default now()
);

create table public.audit_metrics (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null unique references public.audits(id) on delete cascade,
  performance_score smallint,
  accessibility_score smallint,
  seo_score smallint,
  best_practices_score smallint,
  lcp numeric,
  cls numeric,
  inp_or_tbt numeric,
  ttfb numeric,
  image_issues jsonb not null default '[]'::jsonb,
  render_blocking_resources integer not null default 0,
  script_weight_bytes bigint not null default 0,
  raw_lighthouse_json jsonb
);

create index audits_status_created_at_idx on public.audits(status, created_at);
create index audits_user_id_idx on public.audits(user_id);

alter table public.users enable row level security;
alter table public.audits enable row level security;
alter table public.audit_pages enable row level security;
alter table public.audit_reports enable row level security;
alter table public.audit_metrics enable row level security;

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
  where status = 'pending'
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

insert into storage.buckets (id, name, public)
values ('audit-screenshots', 'audit-screenshots', true)
on conflict (id) do update set public = excluded.public;
