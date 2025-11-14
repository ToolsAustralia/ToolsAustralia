import type { MetadataRoute } from "next";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const now = new Date();
  const brandSlugs = [
    "milwaukee",
    "dewalt",
    "makita",
    "kincrome",
    "sidchrome",
    "chicago-pneumatic",
    "gearwrench",
    "ingersoll-rand",
    "knipex",
    "koken",
    "mitutoyo",
    "stahlwille",
    "warren-brown",
  ];

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
  const brandPaths: MetadataRoute.Sitemap = brandSlugs.map((slug) => ({
    url: `${baseUrl}/shop/brand/${slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

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

  return [...staticPaths, ...brandPaths, ...dynamicPaths];
}
