import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCheckoutSession } from "@/lib/stripe/checkout";
import { resolveAuditAccess } from "@/lib/audit/access";

const requestSchema = z.object({ auditId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof resolveAuditAccess>>;
  try {
    access = await resolveAuditAccess(body.auditId);
  } catch (error) {
    console.error(`[api/checkout] access check failed for ${body.auditId}`, error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
  if (access.kind === "unauthenticated") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.kind === "not-found") return NextResponse.json({ error: "Audit not found." }, { status: 404 });

  try {
    const result = await getOrCreateCheckoutSession(access.audit.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/checkout] getOrCreateCheckoutSession failed", error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
