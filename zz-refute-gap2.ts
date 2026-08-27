/** READ-ONLY prod probe (aggregation, server-side): trigger-purchase -> upsell PaymentEvent gap. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { connectOpsDb } from "./scripts/connect-ops-db";

async function main() {
  const mongoose = await connectOpsDb("upsell-gap-agg");
  const db = mongoose.connection.db!;
  const pe = db.collection("paymentevents");
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

  const rows = await pe
    .aggregate(
      [
        { $match: { eventType: "BenefitsGranted", timestamp: { $gte: since } } },
        { $sort: { userId: 1, timestamp: 1 } },
        {
          $group: {
            _id: "$userId",
            evs: { $push: { t: "$timestamp", p: "$packageType" } },
          },
        },
        { $unwind: { path: "$evs", includeArrayIndex: "i" } },
        { $limit: 400000 },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  // Rebuild per-user sequences and compute prev-nonupsell -> upsell gaps.
  const byUser = new Map<string, Array<{ t: Date; p: string }>>();
  for (const r of rows) {
    const k = String(r._id);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(r.evs);
  }
  const gaps: number[] = [];
  for (const evs of byUser.values()) {
    evs.sort((a, b) => a.t.getTime() - b.t.getTime());
    for (let i = 1; i < evs.length; i++) {
      if (evs[i].p !== "upsell") continue;
      const prev = evs[i - 1];
      if (prev.p === "upsell") continue;
      const g = evs[i].t.getTime() - prev.t.getTime();
      if (g >= 0 && g <= 30 * 60 * 1000) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  const q = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
  console.log(`users scanned: ${byUser.size} · trigger→upsell pairs within 30min: ${gaps.length}`);
  if (gaps.length) {
    console.log(
      `gap ms — min ${gaps[0]} · p01 ${q(0.01)} · p05 ${q(0.05)} · median ${q(0.5)} · p95 ${q(0.95)} · max ${gaps[gaps.length - 1]}`
    );
    console.log(`<500ms: ${gaps.filter((g) => g < 500).length} · <1s: ${gaps.filter((g) => g < 1000).length} · <3s: ${gaps.filter((g) => g < 3000).length} · <10s: ${gaps.filter((g) => g < 10000).length}`);
    console.log(`20 smallest: ${gaps.slice(0, 20).join(", ")}`);
  }
  await mongoose.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
