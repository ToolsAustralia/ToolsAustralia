import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
// Shared ".ta-results" design system (draw-results / winners). All selectors are
// scoped under .ta-results, so importing globally is safe and lets portable
// sections (e.g. the winners testimony) render correctly on any page.
import "./(site)/draw-results/draw-results.css";
import { Providers } from "./providers";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/StructuredData";
import ConversionPixels from "@/components/tracking/ConversionPixels";
import KlaviyoScriptLoader from "@/components/KlaviyoScriptLoader";
import KlaviyoPageTracker from "@/components/KlaviyoPageTracker";
import GoogleTagManager from "@/components/GoogleTagManager";
import TopLoadingBar from "@/components/ui/TopLoadingBar";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsightsClient } from "@/components/tracking/SpeedInsightsClient";
import Script from "next/script";
// Import console log silencer for production - must be imported early
import "@/utils/common/silence-logs";
import { getNonce } from "@/utils/security/getNonce";
import { cn } from "@/utils/cn";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
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
    icon: [
      {
        url: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Primary.webp",
        type: "image/webp",
        sizes: "192x192",
      },
      { url: "/icon.ico" },
    ],
    shortcut: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Primary.webp",
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
        url: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp",
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
    images: ["/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp"],
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const googleVerify = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const bingVerify = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;

  // Get CSP nonce from request headers (set by middleware in production)
  // This allows JSON-LD scripts to execute under strict CSP without 'unsafe-inline'
  const nonce = await getNonce();

  return (
    <html lang="en-AU" className={cn(inter.variable, poppins.variable)} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Single theme-color updated client-side by ThemeMetaSync; avoids duplicate meta tags */}
        <meta name="theme-color" content="#ffffff" />
        {/* Light is the default. Apply dark before React hydrates only when the user chose it
            (persisted `ta-theme`), so a dark-mode user never flashes light. Legacy v0 auto-dark
            (userManualOverride === false) is ignored — it resolves to the light default. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=localStorage.getItem("ta-theme");var t=null,o;if(r){var p=JSON.parse(r);if(p&&p.state){t=p.state.theme;o=p.state.userManualOverride}}if(t==="dark"&&o!==false){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#0a0a0a");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`,
          }}
        />
        {/* Set data-tier on <html> before paint so CSS tokens (--ta-blur etc.) match the device on first frame.
            Otherwise DeviceTierProvider's useEffect runs post-hydration, flipping tokens and flashing backdrop-blur'd UI. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var w=window.innerWidth;var t=w<768?"mobile":w<1024?"tablet":"desktop";document.documentElement.dataset.tier=t;document.documentElement.dataset.viewportTier=t;}catch(e){}})();`,
          }}
        />
        {googleVerify ? <meta name="google-site-verification" content={googleVerify} /> : null}
        {bingVerify ? <meta name="msvalidate.01" content={bingVerify} /> : null}
        {/** Facebook domain verification meta tag so Meta can confirm ownership for ads */}
        <meta name="facebook-domain-verification" content="jed8ml25qbnzev5ifwhx9tcgov6x7z" />
        {/** Organization & Website JSON-LD for brand signals */}
        <OrganizationJsonLd
          name="Tools Australia"
          url={siteUrl}
          logo={`${siteUrl}/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp`}
          // Listing social profiles here helps search engines connect verified brand entities.
          sameAs={["https://www.facebook.com/toolsaust", "https://www.instagram.com/toolsaustralia/"]}
          nonce={nonce}
        />
        <WebSiteJsonLd name="Tools Australia" url={siteUrl} nonce={nonce} />
        {/* Contentsquare UX analytics — afterInteractive defers until Next is hydrated, removing it from the critical render path */}
        <Script
          src="https://t.contentsquare.net/uxa/80b94ffdd640f.js"
          strategy="afterInteractive"
          nonce={nonce}
          data-tracking-pixel="true"
        />
      </head>
      <body
        className={cn(inter.className, "antialiased bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100")}
      >
        <GoogleTagManager
          gtmId={process.env.NEXT_PUBLIC_GTM_ID}
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_GTM_TESTING}
          nonce={nonce}
        />
        <TopLoadingBar />
        <ConversionPixels
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
          nonce={nonce}
        />
        <KlaviyoScriptLoader
          companyId={process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID}
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
          nonce={nonce}
        />
        <KlaviyoPageTracker />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsightsClient />
      </body>
    </html>
  );
}
