import mongoose, { Document, Schema } from "mongoose";
import {
  SHOP_ENTRY_CAP_MAX,
  SHOP_ENTRY_CAP_MIN,
} from "@/utils/shop/entry-multiplier";

/** Sentinel id for the singleton config row. */
export const SHOP_ENTRY_MULTIPLIER_CONFIG_ID = "shop-entry-multiplier-config";

export interface IShopEntryMultiplierConfig extends Document {
  _id: string;
  /** Shop-wide ceiling. null = inherit the one-time promo unchanged. */
  cap: number | null;
  /** Per-category ceilings, keyed by `normaliseCategoryKey`. Absent = fall through. */
  categoryCaps: Map<string, number>;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ShopEntryMultiplierConfigSchema = new Schema<IShopEntryMultiplierConfig>(
  {
    _id: { type: String, default: SHOP_ENTRY_MULTIPLIER_CONFIG_ID },
    // Nullable rather than defaulting to 10: null means "inherit", which is a
    // different statement from "capped at the highest possible value", and only
    // the first one keeps behaving correctly if PROMO_MULTIPLIERS ever grows.
    cap: {
      type: Number,
      default: null,
      min: SHOP_ENTRY_CAP_MIN,
      max: SHOP_ENTRY_CAP_MAX,
    },
    // A Map, not an array of {category, cap}: a map cannot hold two rows for the
    // same category, so "which one wins" is unaskable rather than answered.
    categoryCaps: {
      type: Map,
      of: {
        type: Number,
        min: SHOP_ENTRY_CAP_MIN,
        max: SHOP_ENTRY_CAP_MAX,
      },
      default: () => new Map<string, number>(),
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    _id: false, // set manually via default
  }
);

ShopEntryMultiplierConfigSchema.statics.getOrCreate = async function () {
  const existing = await this.findById(SHOP_ENTRY_MULTIPLIER_CONFIG_ID);
  if (existing) return existing;
  return this.create({ _id: SHOP_ENTRY_MULTIPLIER_CONFIG_ID });
};

export interface ShopEntryMultiplierConfigModel
  extends mongoose.Model<IShopEntryMultiplierConfig> {
  getOrCreate(): Promise<IShopEntryMultiplierConfig>;
}

const ShopEntryMultiplierConfig = (mongoose.models.ShopEntryMultiplierConfig ||
  mongoose.model<IShopEntryMultiplierConfig>(
    "ShopEntryMultiplierConfig",
    ShopEntryMultiplierConfigSchema
  )) as unknown as ShopEntryMultiplierConfigModel;

export default ShopEntryMultiplierConfig;
