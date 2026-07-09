import { cookies } from "next/headers";
import { createAudit, claimAuditOwnership, getAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";

const COOKIE_NAME = "lensiq_pending_audit";
const COOKIE_MAX_AGE = 60 * 60 * 2;

export const PAGE_GOALS = ["get-leads", "book-demos", "sell", "signups", "inform"] as const;
export type PageGoal = (typeof PAGE_GOALS)[number];

interface PendingAudit {
  auditId: string;
  url: string;
  pageGoal: PageGoal;
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge, path: "/" };
}

export async function setPendingAuditCookie(pending: PendingAudit) {
  const store = await cookies();
  const value = Buffer.from(JSON.stringify(pending)).toString("base64url");
  store.set(COOKIE_NAME, value, cookieOptions(COOKIE_MAX_AGE));
}

export async function clearPendingAuditCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", cookieOptions(0));
}

function parsePendingAuditCookie(raw: string): PendingAudit | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<PendingAudit>;
    if (typeof parsed.auditId !== "string" || !UUID_V4_RE.test(parsed.auditId)) return null;
    if (typeof parsed.url !== "string" || parsed.url.length === 0) return null;
    if (typeof parsed.pageGoal !== "string" || !PAGE_GOALS.includes(parsed.pageGoal as PageGoal)) return null;
    return { auditId: parsed.auditId, url: parsed.url, pageGoal: parsed.pageGoal as PageGoal };
  } catch {
    return null;
  }
}

export type ClaimResult = { status: "claimed"; auditId: string } | { status: "invalid-url" } | { status: "none" };

export async function claimPendingAudit(userId: string): Promise<ClaimResult> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return { status: "none" };

  const pending = parsePendingAuditCookie(raw);
  if (!pending) {
    await clearPendingAuditCookie();
    return { status: "none" };
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(pending.url);
  } catch {
    await clearPendingAuditCookie();
    return { status: "invalid-url" };
  }

  const audit = await createAudit(pending.url, normalizedUrl, pending.pageGoal, userId, pending.auditId);

  if (audit.userId === userId) {
    await clearPendingAuditCookie();
    return { status: "claimed", auditId: audit.id };
  }

  if (audit.userId === null) {
    const won = await claimAuditOwnership(audit.id, userId);
    if (won) {
      await clearPendingAuditCookie();
      return { status: "claimed", auditId: audit.id };
    }
    const refetched = await getAudit(audit.id);
    await clearPendingAuditCookie();
    if (refetched?.userId === userId) return { status: "claimed", auditId: audit.id };
    return { status: "none" };
  }

  await clearPendingAuditCookie();
  return { status: "none" };
}
