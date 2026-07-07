import { NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2048), pageGoal: z.enum(["get-leads", "book-demos", "sell", "signups", "inform"]) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(body.url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid website URL." }, { status: 400 });
  }

  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal);
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Supabase is not configured")) return NextResponse.json({ error: "Live audits are not configured yet. Open the sample report instead." }, { status: 503 });
    console.error("[api/audits] createAudit failed", error);
    return NextResponse.json({ error: "Could not create the audit. Please try again." }, { status: 500 });
  }
}
