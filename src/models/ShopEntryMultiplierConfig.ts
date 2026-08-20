import mongoose, { Document, Schema } from "mongoose";
import {
  SHOP_ENTRY_MULTIPLIER_MAX,
  SHOP_ENTRY_MULTIPLIER_MIN,
} from "@/utils/shop/entry-multiplier";

/** Sentinel id for the singleton config row. */
export const SHOP_ENTRY_MULTIPLIER_CONFIG_ID = "shop-entry-multiplier-config";

export interface IShopEntryMultiplierConfig extends Document {
  _id: string;
  /** Shop-wide merch multiplier. null = fall back to 1x (no multiplication). */
  multiplier: number | null;
  /** Per-category multipliers, keyed by `normaliseCategoryKey`. Absent = fall through. */
  categoryMultipliers: Map<string, number>;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ShopEntryMultiplierConfigSchema = new Schema<IShopEntryMultiplierConfig>(
  {
    _id: { type: String, default: SHOP_ENTRY_MULTIPLIER_CONFIG_ID },
    // Nullable rather than defaulting to 1: null means "nothing configured", and
    // an explicit 1 means "an admin decided 1". They read the same to a customer
    // but not to whoever is debugging why a promo did nothing.
    multiplier: {
      type: Number,
      default: null,
      min: SHOP_ENTRY_MULTIPLIER_MIN,
      max: SHOP_ENTRY_MULTIPLIER_MAX,
    },
    // A Map, not an array of {category, multiplier}: a map cannot hold two rows
    // for the same category, so "which one wins" is unaskable rather than
    // answered.
    categoryMultipliers: {
      type: Map,
      of: {
        type: Number,
        min: SHOP_ENTRY_MULTIPLIER_MIN,
        max: SHOP_ENTRY_MULTIPLIER_MAX,
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
