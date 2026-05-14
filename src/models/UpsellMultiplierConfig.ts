import mongoose, { Document, Schema } from "mongoose";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

/** Sentinel id for the singleton config row. */
export const UPSELL_MULTIPLIER_CONFIG_ID = "upsell-multiplier-config";

export type UpsellCategory = "membership" | "one-time" | "additional";

export interface IUpsellMultiplierConfig extends Document {
  _id: string;
  membership: PromoMultiplier;
  oneTime: PromoMultiplier;
  additional: PromoMultiplier;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UpsellMultiplierConfigSchema = new Schema<IUpsellMultiplierConfig>(
  {
    _id: { type: String, default: UPSELL_MULTIPLIER_CONFIG_ID },
    membership: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 10,
    },
    oneTime: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 2,
    },
    additional: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 2,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    _id: false, // we set _id manually via default
  }
);

UpsellMultiplierConfigSchema.statics.getOrCreate = async function () {
  const existing = await this.findById(UPSELL_MULTIPLIER_CONFIG_ID);
  if (existing) return existing;
  return this.create({ _id: UPSELL_MULTIPLIER_CONFIG_ID });
};

export interface UpsellMultiplierConfigModel
  extends mongoose.Model<IUpsellMultiplierConfig> {
  getOrCreate(): Promise<IUpsellMultiplierConfig>;
}

const UpsellMultiplierConfig = (
  mongoose.models.UpsellMultiplierConfig ||
  mongoose.model<IUpsellMultiplierConfig>(
    "UpsellMultiplierConfig",
    UpsellMultiplierConfigSchema
  )
) as unknown as UpsellMultiplierConfigModel;

export default UpsellMultiplierConfig;
