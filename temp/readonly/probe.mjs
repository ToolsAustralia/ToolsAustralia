import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

// Failing batch window (UTC): 13:00Z–16:00Z on 2026-05-23 (= 23:00 May23 – 02:00 May24 AEST)
const a = new Date("2026-05-23T13:00:00Z");
const b = new Date("2026-05-23T16:30:00Z");
const evs = await db
  .collection("paymentevents")
  .find({ eventType: "BenefitsGranted", packageType: "membership", timestamp: { $gte: a, $lt: b } })
  .project({ timestamp: 1, paymentIntentId: 1, processedBy: 1, "data.entries": 1, "data.grants": 1 })
  .sort({ timestamp: 1 })
  .toArray();

const tally = {};
for (const e of evs) {
  const empty = (e.data?.grants?.drawGrants?.length ?? 0) === 0;
  const key = `${e.processedBy}|${empty ? "EMPTY" : "ok"}|${(e.paymentIntentId || "").slice(0, 8)}`;
  tally[key] = (tally[key] || 0) + 1;
}
console.log("=== 13:00Z-16:30Z membership grants: processedBy | drawGrants | piPrefix => count ===");
for (const k of Object.keys(tally).sort()) console.log(`  ${k} => ${tally[k]}`);

const failed = evs.find((e) => (e.data?.grants?.drawGrants?.length ?? 0) === 0);
const ok = evs.find((e) => (e.data?.grants?.drawGrants?.length ?? 0) > 0);
for (const [label, e] of [["FAILED", failed], ["OK", ok]]) {
  if (!e) { console.log(`\n=== ${label}: none in window ===`); continue; }
  console.log(`\n=== ${label} ${e.paymentIntentId} | processedBy=${e.processedBy} | ${new Date(e.timestamp).toISOString()} ===`);
  console.log("grants:", JSON.stringify(e.data?.grants));
}
await mongoose.disconnect();
