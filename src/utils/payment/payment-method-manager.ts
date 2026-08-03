import { stripe } from "@/lib/stripe";
import { IUser } from "@/models/User";
import User from "@/models/User";

/**
 * Payment Method Manager
 * 
 * Utility functions for managing payment methods with clear separation of concerns.
 * These functions handle payment method operations after payment succeeds,
 * ensuring payment methods are only saved when payment is confirmed.
 */

/**
 * Saves a payment method to a user account after payment succeeds
 * 
 * @param user - User document to save payment method to
 * @param paymentMethodId - Stripe payment method ID
 * @param options - Optional configuration
 * @returns Object with success status and updated user
 */
/**
 * Does this error mean "someone else wrote the document while we held it"?
 *
 * Mongoose applies `__v` optimistic concurrency automatically when you modify an array
 * (no `optimisticConcurrency` schema option needed), so a positional write like
 * `savedPaymentMethods.0.isDefault` throws `VersionError` if the doc moved underneath us.
 * A `VersionError` has NO `.code` property — it is identified by `name`. That is precisely
 * why the previous `if ("code" in saveError)` guard never caught it despite a comment
 * claiming "save with retry on conflict": the error fell straight through to a re-throw and
 * surfaced as a 500 on POST /api/stripe/payment-methods (6 occurrences / 5 users in the week
 * to 2026-08-03, on saves that had in fact already succeeded via the competing writer).
 */
function isWriteConflictError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number | string };
  return e.name === "VersionError" || e.code === 11000;
}

/**
 * Re-run a read-modify-save operation when it loses a write race.
 *
 * Every operation wrapped here MUST re-read the user document at its start — the retry is
 * only meaningful because the next attempt observes the winner's write. Any Stripe calls
 * inside must be idempotent, since a retry repeats them (`ensurePaymentMethodAttached` and
 * `setDefaultPaymentMethod` both are: attach-if-absent and set-to-value respectively).
 */
async function withWriteConflictRetry<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isWriteConflictError(err) || attempt === attempts) throw err;
      // Small jittered backoff so two racing writers don't retry in lockstep.
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.floor(Math.random() * 40)));
      console.warn(`[${label}] write conflict on attempt ${attempt}/${attempts} — retrying`);
    }
  }
  throw lastError;
}

async function savePaymentMethodToUserOnce(
  user: IUser,
  paymentMethodId: string,
  options: {
    setAsDefault?: boolean;
    skipStripeUpdate?: boolean;
  } = {}
): Promise<{
  success: boolean;
  user: IUser;
  wasNew: boolean;
  error?: string;
}> {
  try {
    // ✅ Validate inputs
    if (!user || !paymentMethodId) {
      return {
        success: false,
        user,
        wasNew: false,
        error: "Missing user or paymentMethodId",
      };
    }

    // ✅ CRITICAL: Always refresh user from database to avoid stale data
    // This prevents race conditions where another process updated the user
    const freshUser = await User.findById(user._id);
    if (!freshUser) {
      return {
        success: false,
        user,
        wasNew: false,
        error: "User not found in database",
      };
    }
    user = freshUser;

    // Check if payment method is already saved
    const existingPaymentMethod = user.savedPaymentMethods?.find(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (existingPaymentMethod) {
      // Payment method already exists - update lastUsed timestamp
      existingPaymentMethod.lastUsed = new Date();
      
      // Update default status if requested
      if (options.setAsDefault) {
        // Set all other payment methods to non-default
        user.savedPaymentMethods?.forEach((pm) => {
          pm.isDefault = pm.paymentMethodId === paymentMethodId;
        });
      }

      await user.save();
      return {
        success: true,
        user,
        wasNew: false,
      };
    }

    // ✅ CRITICAL: Ensure payment method is attached to Stripe customer BEFORE saving
    // This prevents save failures due to unattached payment methods
    if (!options.skipStripeUpdate && user.stripeCustomerId) {
      const attachmentSuccess = await ensurePaymentMethodAttached(paymentMethodId, user.stripeCustomerId);
      if (!attachmentSuccess) {
        // Log warning but continue - might still work if already attached
        console.warn(`⚠️ Failed to ensure payment method attachment, but continuing with save: ${paymentMethodId}`);
      }
    }

    // Determine if this should be the default payment method
    // Set as default if it's the first payment method or explicitly requested
    const isFirstPaymentMethod = !user.savedPaymentMethods || user.savedPaymentMethods.length === 0;
    const shouldBeDefault = options.setAsDefault ?? isFirstPaymentMethod;

    // Set all other payment methods to non-default if this is being set as default
    if (shouldBeDefault && user.savedPaymentMethods) {
      user.savedPaymentMethods.forEach((pm) => {
        pm.isDefault = false;
      });
    }

    // Create new payment method data
    const newPaymentMethod = {
      paymentMethodId,
      isDefault: shouldBeDefault,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Add payment method to user
    if (!user.savedPaymentMethods) {
      user.savedPaymentMethods = [];
    }
    user.savedPaymentMethods.push(newPaymentMethod);

    // Update Stripe customer default payment method if needed
    if (shouldBeDefault && !options.skipStripeUpdate && user.stripeCustomerId) {
      const defaultSetSuccess = await setDefaultPaymentMethod(user.stripeCustomerId, paymentMethodId);
      if (!defaultSetSuccess) {
        console.warn(`⚠️ Failed to set default payment method in Stripe, but payment method is saved: ${paymentMethodId}`);
      }
    }

    // Write conflicts are retried by `withWriteConflictRetry` around the whole operation
    // (which re-reads the user), so this save only has to handle the case where the
    // competing writer already added the very payment method we were adding.
    try {
      await user.save();
    } catch (saveError: unknown) {
      if (isWriteConflictError(saveError)) {
        const refreshedUser = await User.findById(user._id);
        if (refreshedUser?.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethodId)) {
          // Someone else saved it first — that is a success, not a failure.
          return {
            success: true,
            user: refreshedUser,
            wasNew: false,
          };
        }
      }
      throw saveError; // Not ours to swallow — let the retry wrapper decide.
    }

    return {
      success: true,
      user,
      wasNew: true,
    };
  } catch (error) {
    // Write conflicts must ESCAPE this catch so `withWriteConflictRetry` can re-run the
    // whole operation against a freshly-read document. Swallowing them into
    // `{ success: false }` here is what turned a retryable race into a user-facing 500.
    if (isWriteConflictError(error)) throw error;
    console.error("Error saving payment method to user:", error);
    return {
      success: false,
      user,
      wasNew: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Public entry point: `savePaymentMethodToUserOnce` with automatic retry when another
 * writer touches the user document mid-flight (Stripe webhooks such as
 * `payment_method.attached` / `customer.updated` fire on our own attach + set-default calls
 * and write the same document, which is the race that produced the production 500s).
 *
 * Preserves the original contract: a conflict that survives every retry is returned as
 * `{ success: false }` rather than thrown, so existing callers are unaffected.
 */
export async function savePaymentMethodToUser(
  user: IUser,
  paymentMethodId: string,
  options: {
    setAsDefault?: boolean;
    skipStripeUpdate?: boolean;
  } = {}
): Promise<{
  success: boolean;
  user: IUser;
  wasNew: boolean;
  error?: string;
}> {
  try {
    return await withWriteConflictRetry("savePaymentMethodToUser", () =>
      savePaymentMethodToUserOnce(user, paymentMethodId, options)
    );
  } catch (error) {
    console.error("Error saving payment method to user (after retries):", error);
    return {
      success: false,
      user,
      wasNew: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Removes a payment method from a user account
 * 
 * @param user - User document to remove payment method from
 * @param paymentMethodId - Stripe payment method ID to remove
 * @returns Object with success status and updated user
 */
export async function removePaymentMethodFromUser(
  user: IUser,
  paymentMethodId: string
): Promise<{
  success: boolean;
  user: IUser;
  error?: string;
}> {
  try {
    if (!user.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
      return {
        success: true,
        user,
      };
    }

    // Find the payment method to remove
    const paymentMethodIndex = user.savedPaymentMethods.findIndex(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (paymentMethodIndex === -1) {
      // Payment method not found - nothing to remove
      return {
        success: true,
        user,
      };
    }

    const wasDefault = user.savedPaymentMethods[paymentMethodIndex].isDefault;

    // Remove the payment method
    user.savedPaymentMethods.splice(paymentMethodIndex, 1);

    // If the removed payment method was default, set the first remaining one as default
    if (wasDefault && user.savedPaymentMethods.length > 0) {
      user.savedPaymentMethods[0].isDefault = true;
      
      // Update Stripe customer default payment method
      if (user.stripeCustomerId) {
        await setDefaultPaymentMethod(
          user.stripeCustomerId,
          user.savedPaymentMethods[0].paymentMethodId
        );
      }
    } else if (wasDefault && user.savedPaymentMethods.length === 0 && user.stripeCustomerId) {
      // No payment methods left - clear default in Stripe
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: undefined,
          },
        });
      } catch (error) {
        console.error("Error clearing default payment method in Stripe:", error);
        // Non-critical error - continue
      }
    }

    await user.save();

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("Error removing payment method from user:", error);
    return {
      success: false,
      user,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Resolves the subscription's default payment method id from Stripe (source of truth for billing). */
export async function getStripeSubscriptionDefaultPaymentMethodId(
  stripeSubscriptionId: string | undefined
): Promise<string | null> {
  if (!stripeSubscriptionId) {
    return null;
  }
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["default_payment_method"],
    });
    const dpm = sub.default_payment_method;
    return typeof dpm === "string"
      ? dpm
      : dpm && typeof dpm === "object" && "id" in dpm
        ? (dpm as { id: string }).id
        : null;
  } catch (e) {
    console.error("getStripeSubscriptionDefaultPaymentMethodId:", e);
    return null;
  }
}

export type DetachPaymentMethodResult =
  | { success: true; user: IUser }
  | {
      success: false;
      user: IUser;
      error: string;
      code?: "REQUIRES_BILLING_RISK_CONFIRMATION";
    };

/**
 * Detaches a payment method in Stripe and removes it from the user record,
 * keeping subscription and customer default_payment_method consistent when possible.
 */
async function detachAndRemoveSavedPaymentMethodOnce(
  user: IUser,
  paymentMethodId: string,
  options: { confirmBillingRisk?: boolean } = {}
): Promise<DetachPaymentMethodResult> {
  const freshUser = await User.findById(user._id);
  if (!freshUser) {
    return { success: false, user, error: "User not found" };
  }
  user = freshUser;

  if (!user.savedPaymentMethods?.length) {
    return { success: true, user };
  }

  const paymentMethodIndex = user.savedPaymentMethods.findIndex(
    (pm) => pm.paymentMethodId === paymentMethodId
  );
  if (paymentMethodIndex === -1) {
    return { success: true, user };
  }

  const remainingAfter = user.savedPaymentMethods.filter((pm) => pm.paymentMethodId !== paymentMethodId);

  const hasActiveSubscription =
    Boolean(user.subscription?.isActive) && Boolean(user.stripeSubscriptionId);

  const subscriptionDefaultPmId = await getStripeSubscriptionDefaultPaymentMethodId(user.stripeSubscriptionId);

  const isBillingPaymentMethod = subscriptionDefaultPmId === paymentMethodId;

  if (
    hasActiveSubscription &&
    isBillingPaymentMethod &&
    remainingAfter.length === 0 &&
    !options.confirmBillingRisk
  ) {
    return {
      success: false,
      user,
      error:
        "Removing your only payment method will stop automatic subscription renewals until you add a new card. Confirm to continue, or add another payment method first.",
      code: "REQUIRES_BILLING_RISK_CONFIRMATION",
    };
  }

  try {
    if (hasActiveSubscription && isBillingPaymentMethod && remainingAfter.length > 0) {
      const replacementPm = remainingAfter.find((pm) => pm.isDefault) ?? remainingAfter[0];
      const replacementId = replacementPm.paymentMethodId;

      await stripe.subscriptions.update(user.stripeSubscriptionId!, {
        default_payment_method: replacementId,
      });
      if (user.stripeCustomerId) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: replacementId,
          },
        });
      }
      user.savedPaymentMethods.forEach((pm) => {
        pm.isDefault = pm.paymentMethodId === replacementId;
      });
    } else if (
      hasActiveSubscription &&
      isBillingPaymentMethod &&
      remainingAfter.length === 0 &&
      options.confirmBillingRisk
    ) {
      try {
        await stripe.subscriptions.update(user.stripeSubscriptionId!, {
          default_payment_method: "",
        });
      } catch (clearSubErr) {
        console.warn("detachAndRemoveSavedPaymentMethod: could not clear subscription default PM", clearSubErr);
      }
      if (user.stripeCustomerId) {
        try {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: undefined,
            },
          });
        } catch (clearCustErr) {
          console.warn("detachAndRemoveSavedPaymentMethod: could not clear customer default PM", clearCustErr);
        }
      }
    }

    try {
      await stripe.paymentMethods.detach(paymentMethodId);
    } catch (detachErr) {
      console.warn("detachAndRemoveSavedPaymentMethod: detach warning", detachErr);
    }

    user.savedPaymentMethods.splice(paymentMethodIndex, 1);

    if (user.savedPaymentMethods.length > 0) {
      if (!user.savedPaymentMethods.some((pm) => pm.isDefault)) {
        user.savedPaymentMethods.forEach((pm) => {
          pm.isDefault = false;
        });
        user.savedPaymentMethods[0].isDefault = true;
      }
      const defaultPm = user.savedPaymentMethods.find((pm) => pm.isDefault);
      if (defaultPm && user.stripeCustomerId) {
        if (!(hasActiveSubscription && isBillingPaymentMethod && remainingAfter.length > 0)) {
          await setDefaultPaymentMethod(user.stripeCustomerId, defaultPm.paymentMethodId);
        }
      }
    } else if (user.stripeCustomerId) {
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: undefined,
          },
        });
      } catch (e) {
        console.error("Error clearing customer default payment method:", e);
      }
    }

    await user.save();

    return { success: true, user };
  } catch (error) {
    // Escape so the retry wrapper can re-run against a fresh document — same reasoning as
    // savePaymentMethodToUser. This path re-reads the user at its start, so a retry is safe.
    if (isWriteConflictError(error)) throw error;
    console.error("detachAndRemoveSavedPaymentMethod:", error);
    return {
      success: false,
      user,
      error: error instanceof Error ? error.message : "Failed to remove payment method",
    };
  }
}

/**
 * Public entry point: detach with automatic retry on a lost write race.
 *
 * Matters more than it looks — removing a card issues Stripe calls (subscription default
 * swap, customer default clear, detach) that each fire webhooks writing the same user
 * document we are about to save.
 */
export async function detachAndRemoveSavedPaymentMethod(
  user: IUser,
  paymentMethodId: string,
  options: { confirmBillingRisk?: boolean } = {}
): Promise<DetachPaymentMethodResult> {
  try {
    return await withWriteConflictRetry("detachAndRemoveSavedPaymentMethod", () =>
      detachAndRemoveSavedPaymentMethodOnce(user, paymentMethodId, options)
    );
  } catch (error) {
    console.error("detachAndRemoveSavedPaymentMethod (after retries):", error);
    return {
      success: false,
      user,
      error: error instanceof Error ? error.message : "Failed to remove payment method",
    };
  }
}

/**
 * Ensures a payment method is attached to a Stripe customer
 * 
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @returns Success status
 */
export async function ensurePaymentMethodAttached(
  paymentMethodId: string,
  customerId: string
): Promise<boolean> {
  try {
    // Retrieve payment method to check current attachment
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if payment method is already attached to this customer
    const currentCustomerId =
      typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

    if (currentCustomerId === customerId) {
      // Already attached to correct customer
      return true;
    }

    // Detach from current customer if attached to different customer
    if (currentCustomerId) {
      try {
        await stripe.paymentMethods.detach(paymentMethodId);
      } catch (detachError) {
        // Payment method might already be detached - continue
        console.warn("Payment method detach warning:", detachError);
      }
    }

    // Attach to the correct customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    return true;
  } catch (error) {
    console.error("Error ensuring payment method attachment:", error);
    return false;
  }
}

/**
 * Sets the default payment method for a Stripe customer and optionally updates user account
 * 
 * @param customerId - Stripe customer ID
 * @param paymentMethodId - Stripe payment method ID to set as default
 * @returns Success status
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<boolean> {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return true;
  } catch (error) {
    console.error("Error setting default payment method in Stripe:", error);
    return false;
  }
}

/**
 * Deduplicates payment methods in a user's savedPaymentMethods array
 * Removes duplicate paymentMethodIds, keeping the first occurrence
 * Merges metadata (preserves most recent lastUsed, oldest createdAt)
 * 
 * @param user - User document to deduplicate payment methods for
 * @returns Object with success status, number of duplicates removed, and updated user
 */
export async function deduplicatePaymentMethods(
  user: IUser
): Promise<{
  success: boolean;
  duplicatesRemoved: number;
  user: IUser;
  error?: string;
}> {
  try {
    if (!user.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
      return {
        success: true,
        duplicatesRemoved: 0,
        user,
      };
    }

    // ✅ CRITICAL: Always refresh user from database to avoid stale data
    const freshUser = await User.findById(user._id);
    if (!freshUser) {
      return {
        success: false,
        duplicatesRemoved: 0,
        user,
        error: "User not found in database",
      };
    }
    user = freshUser;

    const originalCount = user.savedPaymentMethods.length;

    // Use Map to track unique payment methods (key: paymentMethodId)
    const uniquePaymentMethodsMap = new Map<
      string,
      {
        paymentMethodId: string;
        isDefault: boolean;
        createdAt: Date;
        lastUsed?: Date;
      }
    >();

    // Process each payment method, keeping first occurrence and merging metadata
    for (const pm of user.savedPaymentMethods) {
      const existing = uniquePaymentMethodsMap.get(pm.paymentMethodId);

      if (!existing) {
        // First occurrence - add to map
        uniquePaymentMethodsMap.set(pm.paymentMethodId, {
          paymentMethodId: pm.paymentMethodId,
          isDefault: pm.isDefault,
          createdAt: pm.createdAt,
          lastUsed: pm.lastUsed,
        });
      } else {
        // Duplicate found - merge metadata
        // Keep oldest createdAt
        if (pm.createdAt < existing.createdAt) {
          existing.createdAt = pm.createdAt;
        }
        // Keep most recent lastUsed
        if (pm.lastUsed) {
          if (!existing.lastUsed || pm.lastUsed > existing.lastUsed) {
            existing.lastUsed = pm.lastUsed;
          }
        }
        // If either is default, keep default status (prioritize existing)
        if (pm.isDefault && !existing.isDefault) {
          existing.isDefault = true;
        }
      }
    }

    // Convert map back to array
    let deduplicatedMethods = Array.from(uniquePaymentMethodsMap.values());

    // Ensure only one default payment method
    const defaultMethods = deduplicatedMethods.filter((pm) => pm.isDefault);
    if (defaultMethods.length > 1) {
      // Keep the first default, remove default from others
      for (let i = 1; i < defaultMethods.length; i++) {
        defaultMethods[i].isDefault = false;
      }
    } else if (defaultMethods.length === 0 && deduplicatedMethods.length > 0) {
      // No default found - set first one as default
      deduplicatedMethods[0].isDefault = true;
    }

    // ✅ ENHANCED: Use atomic update with retry logic to handle VersionError
    // Retry with exponential backoff: 100ms, 200ms, 400ms (max 3 attempts)
    const maxRetries = 3;
    const baseDelayMs = 100;
    let lastError: Error | null = null;
    let duplicatesRemoved = originalCount - deduplicatedMethods.length;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // ✅ CRITICAL: Refresh user from database before each attempt to get latest version
        const freshUser = await User.findById(user._id);
        if (!freshUser) {
          return {
            success: false,
            duplicatesRemoved: 0,
            user,
            error: "User not found in database",
          };
        }

        // ✅ ENHANCED: Use findByIdAndUpdate with atomic $set operator to prevent version conflicts
        // This ensures the update is atomic and handles concurrent modifications
        const updateResult = await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              savedPaymentMethods: deduplicatedMethods,
            },
          },
          {
            new: true, // Return updated document
            runValidators: true, // Run schema validators
          }
        );

        if (!updateResult) {
          throw new Error("User not found during update");
        }

        // Update user reference for return value
        user = updateResult;

        if (duplicatesRemoved > 0) {
          console.log(
            `✅ Deduplicated payment methods for user ${user._id}: removed ${duplicatesRemoved} duplicate(s) (attempt ${attempt})`
          );
        }

        return {
          success: true,
          duplicatesRemoved,
          user,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // ✅ ENHANCED: Check if this is a VersionError (optimistic concurrency conflict)
        const isVersionError =
          lastError.name === "VersionError" ||
          lastError.message.includes("No matching document found") ||
          lastError.message.includes("version");

        if (isVersionError && attempt < maxRetries) {
          // Calculate exponential backoff delay with jitter
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 50; // Add 0-50ms jitter
          const totalDelay = delayMs + jitter;

          console.warn(
            `⚠️ VersionError on attempt ${attempt}/${maxRetries} for user ${user._id}, retrying in ${Math.round(totalDelay)}ms...`
          );

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, totalDelay));

          // Re-deduplicate with fresh data (may have changed)
          const freshUser = await User.findById(user._id);
          if (freshUser && freshUser.savedPaymentMethods) {
            // Re-run deduplication logic with fresh data
            const freshOriginalCount = freshUser.savedPaymentMethods.length;
            const freshUniqueMap = new Map<
              string,
              {
                paymentMethodId: string;
                isDefault: boolean;
                createdAt: Date;
                lastUsed?: Date;
              }
            >();

            for (const pm of freshUser.savedPaymentMethods) {
              const existing = freshUniqueMap.get(pm.paymentMethodId);
              if (!existing) {
                freshUniqueMap.set(pm.paymentMethodId, {
                  paymentMethodId: pm.paymentMethodId,
                  isDefault: pm.isDefault,
                  createdAt: pm.createdAt,
                  lastUsed: pm.lastUsed,
                });
              } else {
                if (pm.createdAt < existing.createdAt) {
                  existing.createdAt = pm.createdAt;
                }
                if (pm.lastUsed) {
                  if (!existing.lastUsed || pm.lastUsed > existing.lastUsed) {
                    existing.lastUsed = pm.lastUsed;
                  }
                }
                if (pm.isDefault && !existing.isDefault) {
                  existing.isDefault = true;
                }
              }
            }

            const freshDeduplicated = Array.from(freshUniqueMap.values());
            const freshDefaultMethods = freshDeduplicated.filter((pm) => pm.isDefault);
            if (freshDefaultMethods.length > 1) {
              for (let i = 1; i < freshDefaultMethods.length; i++) {
                freshDefaultMethods[i].isDefault = false;
              }
            } else if (freshDefaultMethods.length === 0 && freshDeduplicated.length > 0) {
              freshDeduplicated[0].isDefault = true;
            }

            deduplicatedMethods = freshDeduplicated;
            duplicatesRemoved = freshOriginalCount - freshDeduplicated.length;
          }

          // Continue to next retry attempt
          continue;
        }

        // If not a VersionError or we've exhausted retries, throw the error
        if (!isVersionError || attempt >= maxRetries) {
          throw lastError;
        }
      }
    }

    // If we get here, all retries failed
    console.error(`❌ Failed to deduplicate payment methods after ${maxRetries} attempts:`, lastError);
    return {
      success: false,
      duplicatesRemoved: 0,
      user,
      error: lastError?.message || "Unknown error after retries",
    };
  } catch (error) {
    console.error("Error deduplicating payment methods:", error);
    return {
      success: false,
      duplicatesRemoved: 0,
      user,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

