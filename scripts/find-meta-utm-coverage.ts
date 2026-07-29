/**
 * Diagnostic — measures what fraction of recent MetaAdDestination rows have
 * utm_content= in their rawUrls. Tells us whether ad-level TRUE ROAS via UTM
 * tagging is viable now or whether the ads team needs to fix tagging first.
 *
 * Run: npx tsx scripts/find-meta-utm-coverage.ts
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import AdDestination from "@/models/AdDestination";

interface IMetaAdDestinationLean {
  adId: string;
  rawUrls?: string[];
}

async function main() {
  await connectDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const docs = await AdDestination.find({ platform: "meta", fetchedAt: { $gte: cutoff } })
    .select("adId rawUrls")
    .lean() as unknown as IMetaAdDestinationLean[];
  let withContent = 0;
  let withoutContent = 0;
  const examplesMissing: string[] = [];
  for (const d of docs) {
    const urls = d.rawUrls ?? [];
    const hasContent = urls.some((u) => u.includes("utm_content="));
    if (hasContent) withContent++;
    else {
      withoutContent++;
      if (examplesMissing.length < 5) examplesMissing.push(d.adId);
    }
  }
  const total = withContent + withoutContent;
  const pct = total > 0 ? ((withContent / total) * 100).toFixed(1) : "0";
  console.error(`Meta ad UTM coverage (last 60 days):`);
  console.error(`  Total ads: ${total}`);
  console.error(`  With utm_content: ${withContent} (${pct}%)`);
  console.error(`  Without utm_content: ${withoutContent}`);
  if (examplesMissing.length) console.error(`  Examples missing: ${examplesMissing.join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
