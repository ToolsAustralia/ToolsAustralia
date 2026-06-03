import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig, {
  type UpsellCategory,
  type IUpsellMultiplierConfig,
} from "@/models/UpsellMultiplierConfig";

const FIELD_BY_CATEGORY: Record<UpsellCategory, keyof IUpsellMultiplierConfig> = {
  membership: "membership",
  "one-time": "oneTime",
  additional: "additional",
};

/**
 * Returns the configured upsell multiplier for a category.
 * Mini upsells never call this — they use no multiplier.
 */
export async function getUpsellMultiplier(
  category: UpsellCategory
): Promise<number> {
  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  const value = config[FIELD_BY_CATEGORY[category]];
  return typeof value === "number" ? value : 1;
}

/** Snapshot of all three category multipliers. */
export async function getAllUpsellMultipliers(): Promise<{
  membership: number;
  oneTime: number;
  additional: number;
}> {
  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  return {
    membership: config.membership,
    oneTime: config.oneTime,
    additional: config.additional,
  };
}

/** Full upsell-multiplier config row including the last-updated timestamp. */
export interface UpsellMultiplierConfigSnapshot {
  membership: number;
  oneTime: number;
  additional: number;
  updatedAt: Date;
}

export async function getUpsellMultiplierConfig(): Promise<UpsellMultiplierConfigSnapshot> {
  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  return {
    membership: config.membership,
    oneTime: config.oneTime,
    additional: config.additional,
    updatedAt: config.updatedAt,
  };
}
