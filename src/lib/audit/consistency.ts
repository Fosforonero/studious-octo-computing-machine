import type { AuditRecord } from "@/lib/audit/types";

// A completed audit whose report or metrics never landed is a server-side data problem,
// not "still processing" — the atomic complete_audit RPC should prevent this, but the
// report page must not treat it as pending: GET /api/audits/{id} would keep reporting
// status "completed" regardless, and AuditPending's own polling refreshes on
// status === "completed", producing an infinite refresh loop instead of a real wait.
export function auditDataIsInconsistent(full: AuditRecord | null): boolean {
  return !full || !full.report || !full.metrics;
}
