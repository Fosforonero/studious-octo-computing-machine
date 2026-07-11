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

// Each screenshot is uploaded and reported independently — one failed upload (e.g. a
// transient Storage error) must not discard the evidenceIds that succeeded alongside it,
// which a single Promise.all/throw would otherwise do.
export async function uploadCtaScreenshots(auditId: string, screenshots: { evidenceId: string; buffer: Buffer }[]) {
  if (!screenshots.length) return { uploaded: [] as { evidenceId: string; path: string }[], failedEvidenceIds: [] as string[] };
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const settled = await Promise.allSettled(screenshots.map(async ({ evidenceId, buffer }) => {
    const path = `${auditId}/cta-${evidenceId.replace(/[^a-z0-9-]/gi, "_")}.jpg`;
    const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return { evidenceId, path: data.publicUrl };
  }));
  const uploaded: { evidenceId: string; path: string }[] = [];
  const failedEvidenceIds: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") uploaded.push(result.value);
    else failedEvidenceIds.push(screenshots[index].evidenceId);
  });
  return { uploaded, failedEvidenceIds };
}

export async function uploadCookieBannerScreenshots(auditId: string, buffers: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } }) {
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const jobs: { key: "desktop.before" | "desktop.after" | "mobile.before" | "mobile.after"; buffer: Buffer; path: string }[] = [];
  if (buffers.desktop.before) jobs.push({ key: "desktop.before", buffer: buffers.desktop.before, path: `${auditId}/cookie-banner-desktop-before.jpg` });
  if (buffers.desktop.after) jobs.push({ key: "desktop.after", buffer: buffers.desktop.after, path: `${auditId}/cookie-banner-desktop-after.jpg` });
  if (buffers.mobile.before) jobs.push({ key: "mobile.before", buffer: buffers.mobile.before, path: `${auditId}/cookie-banner-mobile-before.jpg` });
  if (buffers.mobile.after) jobs.push({ key: "mobile.after", buffer: buffers.mobile.after, path: `${auditId}/cookie-banner-mobile-after.jpg` });

  const results: { desktop: { before?: string; after?: string }; mobile: { before?: string; after?: string } } = { desktop: {}, mobile: {} };
  const failedStages: string[] = [];
  await Promise.all(jobs.map(async (job) => {
    const { error } = await db.storage.from(bucket).upload(job.path, job.buffer, { contentType: "image/jpeg", upsert: true });
    if (error) { failedStages.push(job.key); return; }
    const { data } = db.storage.from(bucket).getPublicUrl(job.path);
    const [viewport, phase] = job.key.split(".") as ["desktop" | "mobile", "before" | "after"];
    results[viewport][phase] = data.publicUrl;
  }));
  return { ...results, failedStages };
}
