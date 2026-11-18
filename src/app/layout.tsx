import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Every route renders from live stock and settings, so nothing here may be prerendered.
 * A statically cached catalogue that shows sold-out items is worse than a slightly slower page.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: {
      default: `${s.shopName} — discounted snacks & essentials`,
      template: `%s · ${s.shopName}`,
    },
    description:
      "A small buying club pooling quick-commerce discounts. Reserve what you want, collect it at cost-plus.",
    openGraph: { type: "website", siteName: s.shopName },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSettings();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader storeName={s.shopName} />
        <main className="flex-1">{children}</main>
        <SiteFooter
          storeName={s.shopName}
          supportPhone={s.supportPhone}
          supportEmail={s.supportEmail}
        />
      </body>
    </html>
  );
}
