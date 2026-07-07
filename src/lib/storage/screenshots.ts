import { getSupabaseAdmin } from "@/lib/db/client";

export async function uploadScreenshots(auditId: string, desktop: Buffer, mobile: Buffer) {
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const desktopPath = `${auditId}/desktop.jpg`;
  const mobilePath = `${auditId}/mobile.jpg`;
  const [{ error: desktopError }, { error: mobileError }] = await Promise.all([
    db.storage.from(bucket).upload(desktopPath, desktop, { contentType: "image/jpeg", upsert: true }),
    db.storage.from(bucket).upload(mobilePath, mobile, { contentType: "image/jpeg", upsert: true }),
  ]);
  if (desktopError || mobileError) throw desktopError ?? mobileError;
  const { data: desktopUrl } = db.storage.from(bucket).getPublicUrl(desktopPath);
  const { data: mobileUrl } = db.storage.from(bucket).getPublicUrl(mobilePath);
  return { desktop: desktopUrl.publicUrl, mobile: mobileUrl.publicUrl };
}

export async function uploadCtaScreenshots(auditId: string, screenshots: { index: number; buffer: Buffer }[]) {
  if (!screenshots.length) return [];
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const results = await Promise.all(screenshots.map(async ({ index, buffer }) => {
    const path = `${auditId}/cta-${index}.jpg`;
    const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return { index, path: data.publicUrl };
  }));
  return results;
}
