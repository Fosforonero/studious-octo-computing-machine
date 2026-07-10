import { notFound, redirect } from "next/navigation";
import { demoAudit } from "@/lib/audit/demo";
import { getOwnedAuditFull } from "@/lib/db/audits";
import { resolveAuditAccess, type AuditAccessResult } from "@/lib/audit/access";
import { auditDataIsInconsistent } from "@/lib/audit/consistency";
import { AuditPending } from "@/components/report/audit-pending";
import { ReportView } from "@/components/report/report-view";
import type { AuditRecord } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pendingStatusFor(audit: AuditRecord) {
  return audit.status === "failed" ? "failed" : audit.status === "running" ? "running" : audit.paid ? "pending" : "unpaid";
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "demo") {
    if (auditDataIsInconsistent(demoAudit) && demoAudit.status === "completed") {
      console.error(`[audits/demo] status is completed but report/metrics are missing`);
      throw new Error("Audit data is inconsistent.");
    }
    if (demoAudit.status !== "completed") return <AuditPending id={demoAudit.id} initialStatus={pendingStatusFor(demoAudit)} errorMessage={demoAudit.errorMessage} />;
    return <ReportView audit={demoAudit} />;
  }

  if (!uuidPattern.test(id)) notFound();

  let access: AuditAccessResult;
  try {
    access = await resolveAuditAccess(id);
  } catch (error) {
    console.error(`[audits/${id}] access check failed`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (access.kind === "unauthenticated") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { audit, userId } = access;
  if (audit.status !== "completed") {
    return <AuditPending id={audit.id} initialStatus={pendingStatusFor(audit)} errorMessage={audit.errorMessage} />;
  }

  let full: AuditRecord | null;
  try {
    full = await getOwnedAuditFull(id, userId);
  } catch (error) {
    console.error(`[audits/${id}] full load failed`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (!auditDataIsInconsistent(full)) return <ReportView audit={full as AuditRecord} />;

  console.error(`[audits/${id}] status is completed but report/metrics are missing`);
  throw new Error("Audit data is inconsistent.");
}
