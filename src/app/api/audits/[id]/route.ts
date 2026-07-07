import { NextResponse } from "next/server";
import { getAudit } from "@/lib/db/audits";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  try {
    const audit = await getAudit(id);
    if (!audit) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    return NextResponse.json(audit);
  } catch (error) {
    console.error(`[api/audits/${id}] getAudit failed`, error);
    return NextResponse.json({ error: "Could not load the audit." }, { status: 500 });
  }
}
