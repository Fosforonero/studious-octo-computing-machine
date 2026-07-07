export function GET() {
  return new Response(`# Lensiq\n\nLensiq is an AI website auditor for clarity, trust, conversion, UX, SEO, performance, accessibility and mobile experience.\n\n- Website: https://lensiq.site\n- Sample report: https://lensiq.site/audits/demo\n- Contact: hello@lensiq.site\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
