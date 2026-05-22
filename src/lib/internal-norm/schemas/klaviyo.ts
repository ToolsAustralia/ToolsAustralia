import { z } from "zod";

const SampleUserSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().optional(),
});

export const NormKlaviyoDrawResetPreviewSchema = z.object({
  targetDraw: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    activationDate: z.string().describe("ISO 8601 UTC"),
  }),
  cutoffDate: z.string().describe("ISO 8601 UTC"),
  totalUsers: z.number().int().nonnegative(),
  totalParticipants: z.number().int().nonnegative(),
  skippedUsers: z.number().int().nonnegative(),
  reductionPercentage: z.number(),
  sampleUsers: z.array(SampleUserSchema),
});

export const NormKlaviyoDrawResetProgressSchema = z
  .object({
    isRunning: z.boolean(),
    total: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    synced: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    currentUserEmail: z.string().optional(),
    startTime: z.number().optional(),
  })
  .nullable();
