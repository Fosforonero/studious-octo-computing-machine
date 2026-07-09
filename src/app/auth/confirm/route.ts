import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimPendingAudit } from "@/lib/audit/pending-claim";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error && data.user) {
      const claim = await claimPendingAudit(data.user.id);
      if (claim.status === "claimed") {
        redirectTo.pathname = `/audits/${claim.auditId}`;
        return NextResponse.redirect(redirectTo);
      }
      redirectTo.pathname = "/dashboard";
      if (claim.status === "invalid-url") redirectTo.searchParams.set("error", "We couldn't start an audit for that website. Please try again.");
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "This confirmation link is invalid or has expired.");
  return NextResponse.redirect(redirectTo);
}
