import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/StructuredData";
import PixelTracker from "@/components/PixelTracker";
import MajorDrawTestControls from "@/components/dev/MajorDrawTestControls";
import TopLoadingBar from "@/components/ui/TopLoadingBar";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// Import console log silencer for production - must be imported early
import "@/utils/common/silence-logs";
import { getNonce } from "@/utils/security/getNonce";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"),
  title: "Tools Australia",
  description:
    "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways. Professional tools for every need.",
  keywords: "tools, australia, giveaways, professional tools, power tools, hand tools",
  authors: [{ name: "Tools Australia" }],
  icons: {
    icon: [{ url: "/Social%20Media%20Profile_Primary.png", type: "image/png", sizes: "192x192" }, { url: "/icon.ico" }],
    shortcut: "/Social%20Media%20Profile_Primary.png",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Tools Australia",
    description:
      "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways.",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "/Social Media Profile_Black Background.png",
        width: 1200,
        height: 630,
        alt: "Tools Australia Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tools Australia - Your Go-To for Tools and Giveaways",
    description:
      "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways.",
    images: ["/Social Media Profile_Black Background.png"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const googleVerify = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const bingVerify = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;

  // Get CSP nonce from request headers (set by middleware in production)
  // This allows JSON-LD scripts to execute under strict CSP without 'unsafe-inline'
  const nonce = await getNonce();

  return (
    <html lang="en-AU" className={`${inter.variable} ${poppins.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        {googleVerify ? <meta name="google-site-verification" content={googleVerify} /> : null}
        {bingVerify ? <meta name="msvalidate.01" content={bingVerify} /> : null}
        {/** Facebook domain verification meta tag so Meta can confirm ownership for ads */}
        <meta name="facebook-domain-verification" content="jed8ml25qbnzev5ifwhx9tcgov6x7z" />
        {/** Organization & Website JSON-LD for brand signals */}
        <OrganizationJsonLd
          name="Tools Australia"
          url={siteUrl}
          logo={`${siteUrl}/Social%20Media%20Profile_Black%20Background.png`}
          // Listing social profiles here helps search engines connect verified brand entities.
          sameAs={["https://www.facebook.com/toolsaustralia", "https://www.instagram.com/toolsaustralia"]}
          nonce={nonce}
        />
        <WebSiteJsonLd name="Tools Australia" url={siteUrl} nonce={nonce} />
      </head>
      <body className={`${inter.className} antialiased`}>
        <TopLoadingBar />
        <PixelTracker
          facebookPixelId={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}
          tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
        />
        <Providers>{children}</Providers>
        <MajorDrawTestControls />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
