create or replace function public.complete_audit(p_audit_id uuid, p_report jsonb, p_executive_summary text, p_overall_score smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_reports (audit_id, report_json, executive_summary)
  values (p_audit_id, p_report, p_executive_summary)
  on conflict (audit_id) do update set report_json = excluded.report_json, executive_summary = excluded.executive_summary;

  update public.audits
  set status = 'completed', overall_score = p_overall_score, completed_at = now(), error_message = null
  where id = p_audit_id;
end;
$$;

revoke all on function public.complete_audit(uuid, jsonb, text, smallint) from public, anon, authenticated;
grant execute on function public.complete_audit(uuid, jsonb, text, smallint) to service_role;
