import type { Metadata } from "next";
import { Suspense } from "react";
import { CookieConsent } from "@/components/analytics/cookie-consent";
import "./globals.css";

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site"),
  title: { default: "Lensiq — See what your website is costing you", template: "%s · Lensiq" },
  description: "An AI website expert that finds what is hurting clarity, trust and conversions — then shows you exactly how to fix it.",
  openGraph: { title: "Lensiq", description: "Your website, seen clearly.", type: "website" },
  icons: {
    icon: [
      { url: "/lensiq-favicon.webp", type: "image/webp" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Suspense fallback={null}>
          <CookieConsent measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        </Suspense>
      </body>
    </html>
  );
}
