import { NextResponse } from "next/server";
import { resolveAuditAccess } from "@/lib/audit/access";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  try {
    const access = await resolveAuditAccess(id);
    if (access.kind === "unauthenticated") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (access.kind === "not-found") return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    const { audit } = access;
    return NextResponse.json({ id: audit.id, status: audit.status, paid: audit.paid, errorMessage: audit.errorMessage });
  } catch (error) {
    console.error(`[api/audits/${id}] access check failed`, error);
    return NextResponse.json({ error: "Could not load the audit." }, { status: 500 });
  }
}
