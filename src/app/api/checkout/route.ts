import { NextResponse } from "next/server";
import { z } from "zod";
import { getAudit } from "@/lib/db/audits";
import { createCheckoutSession } from "@/lib/stripe/checkout";

const requestSchema = z.object({ auditId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const audit = await getAudit(body.auditId);
    if (!audit) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    if (audit.paid) return NextResponse.json({ url: null, alreadyPaid: true });
    const session = await createCheckoutSession(audit.id);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[api/checkout] createCheckoutSession failed", error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
