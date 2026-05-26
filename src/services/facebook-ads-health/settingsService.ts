import FacebookAdsHealthSettings, {
  FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS,
} from "@/models/FacebookAdsHealthSettings";
import type { FacebookAdsHealthSettingsValues } from "./types";
import StaffActivity from "@/models/StaffActivity";
import { Types } from "mongoose";

export async function getOrInitSettings(): Promise<FacebookAdsHealthSettingsValues> {
  let doc = await FacebookAdsHealthSettings.findOne({ scope: "global" });
  if (!doc) {
    doc = await FacebookAdsHealthSettings.create(FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS);
  }
  return {
    breakevenRoas: doc.breakevenRoas,
    targetCpaAud: doc.targetCpaAud,
    zeroConvSpendMultiplier: doc.zeroConvSpendMultiplier,
    roasDropTriggerPct: doc.roasDropTriggerPct,
    postEditWaitHours: doc.postEditWaitHours,
  };
}

export interface UpdateSettingsInput {
  values: Partial<FacebookAdsHealthSettingsValues>;
  userId: Types.ObjectId | string;
  userEmail: string;
  userRoleName: string;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<FacebookAdsHealthSettingsValues> {
  const doc = await FacebookAdsHealthSettings.findOneAndUpdate(
    { scope: "global" },
    { ...input.values, updatedBy: new Types.ObjectId(input.userId.toString()), updatedAt: new Date() },
    { new: true, upsert: true },
  );
  // Audit the mutation. StaffActivity schema is strict — see src/models/StaffActivity.ts:
  // required fields are actorId, actorEmail, actorRoleName, action, method, path, status, timestamp.
  // No `metadata` field exists; record the action name plus the path for traceability.
  await StaffActivity.create({
    actorId: new Types.ObjectId(input.userId.toString()),
    actorEmail: input.userEmail,
    actorRoleName: input.userRoleName,
    action: "facebook_ads_health_settings_update",
    method: "PUT",
    path: "/api/admin/facebook-ads/health/settings",
    status: 200,
    timestamp: new Date(),
  });
  return {
    breakevenRoas: doc!.breakevenRoas,
    targetCpaAud: doc!.targetCpaAud,
    zeroConvSpendMultiplier: doc!.zeroConvSpendMultiplier,
    roasDropTriggerPct: doc!.roasDropTriggerPct,
    postEditWaitHours: doc!.postEditWaitHours,
  };
}
