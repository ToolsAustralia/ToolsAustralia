import { z } from "zod";

// ─── invoices.charge-past-due.preview ────────────────────────────────────────

const PreviewRowSchema = z.object({
  invoiceId: z.string().describe("Stripe invoice id."),
  customerId: z.string().describe("Stripe customer id."),
  userId: z.string().describe("Mongo User._id."),
  userEmail: z
    .string()
    .describe('User email. Falls back to "N/A" when missing on the User record.'),
  userName: z
    .string()
    .describe(
      'Concatenated first + last name. Falls back to "N/A" when both are empty.',
    ),
  amount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Outstanding amount on the invoice in Stripe currency-minor-unit (cents). Divide by 100 for AUD dollars.",
    ),
  currency: z
    .string()
    .describe("ISO 4217 lowercase code (e.g. \"aud\")."),
});

const FilterStatsSchema = z.object({
  wrongCollectionMethod: z.number().int().nonnegative(),
  noAmountRemaining: z.number().int().nonnegative(),
  noPaymentMethod: z.number().int().nonnegative(),
  noCustomerId: z.number().int().nonnegative(),
  userNotFound: z.number().int().nonnegative(),
  notPastDue: z.number().int().nonnegative(),
  duplicateOrStaleCycle: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Invoices that passed per-row eligibility but were collapsed away by per-customer scoping (older/duplicate cycle).",
    ),
});

const PreviewDebugSchema = z.object({
  totalCustomerIds: z
    .number()
    .int()
    .nonnegative()
    .describe("Distinct Stripe customer ids extracted from the open-invoice list."),
  totalUsersFound: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Diagnostic-only count of Mongo users matching any of those customer ids (drives the "Total Users Found" admin modal tile).',
    ),
  pastDueUsersFound: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Subset of totalUsersFound whose `subscription.status` is currently `past_due` — the cohort eligibility filters against.",
    ),
});

export const NormChargePastDuePreviewSchema = z.object({
  eligibleCount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Rows that survived every eligibility filter AND per-customer scoping — the count the POST run would attempt.",
    ),
  totalInvoices: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Open `charge_automatically` invoices returned by Stripe before any filtering.",
    ),
  filterStats: FilterStatsSchema,
  debug: PreviewDebugSchema,
  users: z
    .array(PreviewRowSchema)
    .describe(
      "Eligible preview rows — one per customer (the invoice attached to the user's current subscription).",
    ),
});
