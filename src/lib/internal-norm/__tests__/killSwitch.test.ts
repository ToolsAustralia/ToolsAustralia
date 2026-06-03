import dotenv from "dotenv"; import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import NormEndpointSettings from "@/models/NormEndpointSettings";
import { isEndpointDisabled, __clearKillSwitchCacheForTests } from "@/lib/internal-norm/killSwitch";

async function run() {
  await connectDB();
  try {
    __clearKillSwitchCacheForTests();
    // Ensure clean state
    await NormEndpointSettings.deleteOne({ registryKey: "roas.summary" });
    await NormEndpointSettings.deleteOne({ registryKey: "dashboard.stats" });
    delete process.env.NORM_DISABLED_REGISTRY_KEYS;

    // Default: not disabled
    assert.equal(await isEndpointDisabled("roas.summary"), false);
    // DB toggle
    await NormEndpointSettings.findOneAndUpdate(
      { registryKey: "roas.summary" }, { $set: { disabled: true } }, { upsert: true }
    );
    __clearKillSwitchCacheForTests();
    assert.equal(await isEndpointDisabled("roas.summary"), true);
    // Env override always wins
    process.env.NORM_DISABLED_REGISTRY_KEYS = "dashboard.stats";
    __clearKillSwitchCacheForTests();
    assert.equal(await isEndpointDisabled("dashboard.stats"), true);

    console.log("✓ kill switch: DB toggle + env override + default off");
  } finally {
    // Cleanup
    await NormEndpointSettings.deleteOne({ registryKey: "roas.summary" });
    await NormEndpointSettings.deleteOne({ registryKey: "dashboard.stats" });
    delete process.env.NORM_DISABLED_REGISTRY_KEYS;
    await mongoose.disconnect();
  }
}

void run().catch((e) => { console.error(e); process.exit(1); });
