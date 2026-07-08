import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCheckoutSession } from "@/lib/stripe/checkout";

const requestSchema = z.object({ auditId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await getOrCreateCheckoutSession(body.auditId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Audit not found.") return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    console.error("[api/checkout] getOrCreateCheckoutSession failed", error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
