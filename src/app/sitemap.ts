import type { MetadataRoute } from "next";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
// `prize-summaries`, NOT `@/config/prizes` — the latter is ~170 KB with top-level side
// effects and we only need slugs here.
import { DEFAULT_PRIZE_SLUG, listPrizeSummaries } from "@/config/prize-summaries";
import { TOOLSET_LANDING_SLUGS } from "@/config/promo-landing-slugs";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const now = new Date();

  // Core static routes
  const staticPaths: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/mini-draws`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/membership`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/partner`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/faq`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Promo landing pages. These are the site's main organic + paid landing surfaces and were
  // absent from the sitemap entirely until 2026-09-03 — Google was never told they exist.
  //
  // They live in the STATIC section on purpose. Their slugs come from compile-time config,
  // not the database, so putting them alongside the DB-derived paths below would let a Mongo
  // blip silently drop every promo page out of the sitemap via that catch block.
  //
  // Both lists are the same sources the routes themselves use — `TOOLSET_LANDING_SLUGS` backs
  // the six `promotions/<brand>/page.tsx` routes, and `listPrizeSummaries()` is the catalog
  // `generateStaticParams()` prerenders from — so a new prize or brand page cannot be added
  // without appearing here too.
  const promoPaths: MetadataRoute.Sitemap = [
    // Per-brand landing pages (`ToolsetLandingPage`), each with its own metadata.
    ...TOOLSET_LANDING_SLUGS.map((slug) => ({
      url: `${baseUrl}/promotions/${slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    // Prize-combination pages. The default one is the canonical major-draw page the header
    // links to, so it ranks with the brand pages rather than with its 24 siblings.
    ...listPrizeSummaries().map((prize) => ({
      url: `${baseUrl}/promotions/${prize.slug}`,
      lastModified: now,
      changeFrequency: prize.slug === DEFAULT_PRIZE_SLUG ? ("daily" as const) : ("weekly" as const),
      priority: prize.slug === DEFAULT_PRIZE_SLUG ? 0.9 : 0.7,
    })),
  ];

  let dynamicPaths: MetadataRoute.Sitemap = [];

  try {
    await connectDB();

    // Fetch a reasonable number to avoid huge sitemap sizes; split sitemaps later if needed
    const [products, miniDraws] = await Promise.all([
      Product.find({ isActive: true }).select({ _id: 1, updatedAt: 1 }).limit(10000).lean(),
      MiniDraw.find({ isActive: true }).select({ _id: 1, updatedAt: 1 }).limit(10000).lean(),
    ]);

    dynamicPaths = [
      ...products.map((p) => ({
        url: `${baseUrl}/shop/${String(p._id)}`,
        lastModified: (p.updatedAt as Date | undefined) || now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
      ...miniDraws.map((d) => ({
        url: `${baseUrl}/mini-draws/${String(d._id)}`,
        lastModified: (d.updatedAt as Date | undefined) || now,
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // Graceful fallback: serve only static routes if DB is not available in this environment
    dynamicPaths = [];
  }

  return [...staticPaths, ...promoPaths, ...dynamicPaths];
}
