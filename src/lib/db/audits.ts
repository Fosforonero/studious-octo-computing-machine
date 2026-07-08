import { getSupabaseAdmin } from "@/lib/db/client";
import type { AuditMetrics, AuditRecord, ExtractedPage, FinalReport } from "@/lib/audit/types";

function mapAudit(row: Record<string, unknown>): AuditRecord {
  return { id: String(row.id), url: String(row.url), normalizedUrl: String(row.normalized_url), pageGoal: String(row.page_goal ?? "Not specified"), status: row.status as AuditRecord["status"], paid: Boolean(row.paid), stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null, overallScore: row.overall_score as number | null, createdAt: String(row.created_at), completedAt: row.completed_at as string | null, errorMessage: row.error_message as string | null };
}

export async function createAudit(url: string, normalizedUrl: string, pageGoal: string) {
  const { data, error } = await getSupabaseAdmin().from("audits").insert({ url, normalized_url: normalizedUrl, page_goal: pageGoal, status: "pending" }).select("*").single();
  if (error) throw error;
  return mapAudit(data);
}

export async function getAudit(id: string): Promise<AuditRecord | null> {
  const db = getSupabaseAdmin();
  const [{ data: audit, error }, { data: page }, { data: metrics }, { data: report }] = await Promise.all([
    db.from("audits").select("*").eq("id", id).maybeSingle(),
    db.from("audit_pages").select("*").eq("audit_id", id).maybeSingle(),
    db.from("audit_metrics").select("*").eq("audit_id", id).maybeSingle(),
    db.from("audit_reports").select("*").eq("audit_id", id).maybeSingle(),
  ]);
  if (error) throw error;
  if (!audit) return null;
  const result = mapAudit(audit);
  if (page) result.page = { ...(page.extracted_json as ExtractedPage), desktopScreenshotPath: page.desktop_screenshot_url, mobileScreenshotPath: page.mobile_screenshot_url };
  if (metrics) result.metrics = { performanceScore: metrics.performance_score, accessibilityScore: metrics.accessibility_score, seoScore: metrics.seo_score, bestPracticesScore: metrics.best_practices_score, lcp: metrics.lcp, cls: metrics.cls, inpOrTbt: metrics.inp_or_tbt, ttfb: metrics.ttfb, imageIssues: metrics.image_issues ?? [], renderBlockingResources: metrics.render_blocking_resources ?? 0, scriptWeightBytes: metrics.script_weight_bytes ?? 0 };
  if (report) result.report = report.report_json as FinalReport;
  return result;
}

export async function claimNextAudit() {
  const { data, error } = await getSupabaseAdmin().rpc("claim_next_audit");
  if (error) throw error;
  return data?.[0] ? mapAudit(data[0]) : null;
}

export async function saveScan(auditId: string, page: ExtractedPage, metrics: AuditMetrics, screenshots: { desktop: string; mobile: string }) {
  const db = getSupabaseAdmin();
  const results = await Promise.all([
    db.from("audit_pages").upsert({ audit_id: auditId, url: page.url, title: page.title, meta_description: page.metaDescription, h1: page.headings.find((h) => h.level === 1)?.text ?? null, visible_text: page.visibleText, desktop_screenshot_url: screenshots.desktop, mobile_screenshot_url: screenshots.mobile, extracted_json: page }, { onConflict: "audit_id" }),
    db.from("audit_metrics").upsert({ audit_id: auditId, performance_score: metrics.performanceScore, accessibility_score: metrics.accessibilityScore, seo_score: metrics.seoScore, best_practices_score: metrics.bestPracticesScore, lcp: metrics.lcp, cls: metrics.cls, inp_or_tbt: metrics.inpOrTbt, ttfb: metrics.ttfb, image_issues: metrics.imageIssues, render_blocking_resources: metrics.renderBlockingResources, script_weight_bytes: metrics.scriptWeightBytes, raw_lighthouse_json: metrics.raw }, { onConflict: "audit_id" }),
  ]);
  const failed = results.find(({ error }) => error);
  if (failed?.error) throw failed.error;
}

export async function completeAudit(auditId: string, report: FinalReport) {
  const { error } = await getSupabaseAdmin().rpc("complete_audit", { p_audit_id: auditId, p_report: report, p_executive_summary: report.executiveSummary, p_overall_score: report.overallScore });
  if (error) throw error;
}

export async function markAuditPaid(auditId: string, stripeCheckoutSessionId: string) {
  const { error } = await getSupabaseAdmin().from("audits").update({ paid: true, stripe_checkout_session_id: stripeCheckoutSessionId }).eq("id", auditId);
  if (error) throw error;
}

// Conditional claim: only succeeds if no session was recorded yet, so two concurrent
// requests creating a session for the same unpaid audit can't both "win" and leave two
// payable sessions open — the loser re-fetches and reuses whichever session won.
export async function claimCheckoutSession(auditId: string, stripeCheckoutSessionId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("audits").update({ stripe_checkout_session_id: stripeCheckoutSessionId }).eq("id", auditId).is("stripe_checkout_session_id", null).select("id");
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

export async function failAudit(auditId: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Unknown audit error";
  const { error } = await getSupabaseAdmin().from("audits").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", auditId);
  if (error) console.error(`[audits] failAudit could not mark ${auditId} as failed (cause: ${message})`, error);
}
