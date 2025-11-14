import mongoose from "mongoose";
import { z } from "zod";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import type { AdminUserUpdatePayload } from "@/types/admin";

const mobileRegex = /^(\+61|61|0)?[4-5]\d{8}$/;

const objectIdSchema = z
  .string()
  .min(1, "Id is required")
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: "Invalid identifier format",
  });

const basicInfoSchema = z
  .object({
    firstName: z.string().min(1, "First name is required").max(50, "First name too long").optional(),
    lastName: z.string().min(1, "Last name is required").max(50, "Last name too long").optional(),
    email: z.string().email("Email must be valid").optional(),
    mobile: z
      .string()
      .min(8, "Mobile number is too short")
      .max(15, "Mobile number is too long")
      .regex(mobileRegex, "Use a valid Australian phone number format")
      .optional(),
    state: z
      .string()
      .refine(
        (value) => AUSTRALIAN_STATES.some((state) => state.code === value.toUpperCase()),
        "State must be a valid Australian state code"
      )
      .optional(),
    role: z.enum(["user", "admin"]).optional(),
    isActive: z.boolean().optional(),
    isEmailVerified: z.boolean().optional(),
    isMobileVerified: z.boolean().optional(),
    profileSetupCompleted: z.boolean().optional(),
  })
  .strict()
  .partial();

const subscriptionSchema = z
  .object({
    packageId: z.string().min(1, "Package id is required").optional(),
    status: z.string().min(1, "Subscription status is required").optional(),
    isActive: z.boolean().optional(),
    autoRenew: z.boolean().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    lastDowngradeDate: z.string().datetime().optional(),
    lastUpgradeDate: z.string().datetime().optional(),
  })
  .strict()
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one subscription field to update",
  });

const nonNegativeInt = z.number().int("Value must be an integer").min(0, "Value cannot be negative");

const nonNegativeNumber = z.number().min(0, "Value cannot be negative");

const oneTimePackageSchema = z
  .object({
    packageId: z.string().min(1, "Package id is required"),
    purchaseDate: z.string().datetime().optional(),
    startDate: z.string().datetime({ message: "Start date must be an ISO string" }),
    endDate: z.string().datetime({ message: "End date must be an ISO string" }),
    isActive: z.boolean(),
    entriesGranted: nonNegativeInt,
  })
  .strict();

const miniDrawPackageSchema = z
  .object({
    packageId: z.string().min(1, "Package id is required"),
    packageName: z.string().min(1, "Package name is required"),
    miniDrawId: objectIdSchema.optional(),
    purchaseDate: z.string().datetime({ message: "Purchase date must be an ISO string" }),
    startDate: z.string().datetime({ message: "Start date must be an ISO string" }),
    endDate: z.string().datetime({ message: "End date must be an ISO string" }),
    isActive: z.boolean(),
    entriesGranted: nonNegativeInt,
    price: nonNegativeNumber,
    partnerDiscountHours: nonNegativeInt.optional(),
    partnerDiscountDays: nonNegativeInt.optional(),
    stripePaymentIntentId: z.string().min(1, "Stripe payment intent id is required"),
  })
  .strict();

const majorDrawParticipationSchema = z
  .object({
    drawId: objectIdSchema,
    totalEntries: nonNegativeInt,
  })
  .strict();

const miniDrawParticipationSchema = z
  .object({
    miniDrawId: objectIdSchema,
    totalEntries: nonNegativeInt,
    isActive: z.boolean().optional(),
  })
  .strict();

const partnerDiscountSchema = z
  .object({
    queueId: objectIdSchema,
    status: z.enum(["active", "queued", "expired", "cancelled"]),
  })
  .strict();

export const adminUserUpdateSchema: z.ZodType<AdminUserUpdatePayload> = z
  .object({
    basicInfo: basicInfoSchema.optional(),
    subscription: z.union([subscriptionSchema, z.null()]).optional(),
    rewards: z
      .object({
        rewardsPoints: nonNegativeNumber.optional(),
        accumulatedEntries: nonNegativeInt.optional(),
        entryWallet: nonNegativeInt.optional(),
      })
      .strict()
      .optional(),
    oneTimePackages: z.array(oneTimePackageSchema).optional(),
    miniDrawPackages: z.array(miniDrawPackageSchema).optional(),
    majorDrawParticipation: z.array(majorDrawParticipationSchema).optional(),
    miniDrawParticipation: z.array(miniDrawParticipationSchema).optional(),
    partnerDiscountQueue: z.array(partnerDiscountSchema).optional(),
  })
  .strict();
