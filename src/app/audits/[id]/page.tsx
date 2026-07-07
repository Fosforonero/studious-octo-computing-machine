import { notFound } from "next/navigation";
import { getAudit } from "@/lib/db/audits";
import { demoAudit } from "@/lib/audit/demo";
import { AuditPending } from "@/components/report/audit-pending";
import { ReportView } from "@/components/report/report-view";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let audit = id === "demo" ? demoAudit : null;
  if (!audit) {
    try { audit = await getAudit(id); } catch (error) { console.error(`[audits/${id}] getAudit failed`, error); notFound(); }
  }
  if (!audit) notFound();
  if (audit.status !== "completed" || !audit.report || !audit.metrics) {
    const pendingStatus = audit.status === "failed" ? "failed" : audit.status === "running" ? "running" : audit.paid ? "pending" : "unpaid";
    return <AuditPending id={audit.id} initialStatus={pendingStatus} errorMessage={audit.errorMessage} />;
  }
  return <ReportView audit={audit} />;
}
