import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

async function run() {
  await connectDB();
  try {
    // today, yesterday, all-time, custom must work without DB calls for the draw lookup.
    const t = await resolveNormDateRange({ range: "today" });
    assert.ok(t.startDate instanceof Date);
    assert.equal(t.dateRange, "today");

    const y = await resolveNormDateRange({ range: "yesterday" });
    assert.equal(y.dateRange, "yesterday");

    const a = await resolveNormDateRange({ range: "all-time" });
    assert.equal(a.dateRange, "all-time");

    const c = await resolveNormDateRange({ range: "custom", start: "2099-01-01", end: "2099-01-31" });
    assert.equal(c.dateRange, "custom");

    // current-draw / last-draw require DB; assert it returns something without throwing
    // unless no draws exist, in which case it throws a known error.
    try {
      const cd = await resolveNormDateRange({ range: "current-draw" });
      assert.ok(cd.startDate <= cd.endDate);
    } catch (e) {
      assert.match(String(e), /no.*draw/i);
    }
    console.log("✓ resolveNormDateRange covers today/yesterday/all-time/custom; current-draw degrades cleanly");
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
