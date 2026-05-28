import FacebookAdsHealthSnooze from "@/models/FacebookAdsHealthSnooze";
import { Types } from "mongoose";

const MAX_SNOOZE_HOURS = 24;
const ALLOWED_VERDICTS = new Set(["investigate"]);

export interface UpsertSnoozeInput {
  userId: Types.ObjectId | string;
  adAccountId: string;
  adId: string;
  verdict: "investigate";
  hours: number;
  reason?: string;
}

export async function upsertSnooze(input: UpsertSnoozeInput): Promise<void> {
  if (!ALLOWED_VERDICTS.has(input.verdict)) {
    throw new Error(`Snooze not allowed for verdict: ${input.verdict}`);
  }
  const hours = Math.min(Math.max(1, input.hours), MAX_SNOOZE_HOURS);
  const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  await FacebookAdsHealthSnooze.findOneAndUpdate(
    { userId: new Types.ObjectId(input.userId.toString()), adId: input.adId },
    {
      userId: new Types.ObjectId(input.userId.toString()),
      adAccountId: input.adAccountId,
      adId: input.adId,
      verdict: input.verdict,
      snoozeUntil,
      reason: input.reason,
      createdAt: new Date(),
    },
    { upsert: true, new: true },
  );
}

export async function loadActiveSnoozes(
  userId: Types.ObjectId | string,
  adIds: string[],
): Promise<Map<string, Date>> {
  if (adIds.length === 0) return new Map();
  const docs = await FacebookAdsHealthSnooze.find({
    userId: new Types.ObjectId(userId.toString()),
    adId: { $in: adIds },
    snoozeUntil: { $gt: new Date() },
  })
    .select("adId snoozeUntil")
    .lean();
  return new Map(docs.map((d) => [d.adId, d.snoozeUntil]));
}
