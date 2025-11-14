/**
 * Mini Draw Helper Functions
 *
 * Utility functions for mini draw lifecycle management, entry allocation,
 * and status transitions.
 */

import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";

/**
 * Interface for payment metadata used in entry allocation
 */
export interface PaymentMetadata {
  created?: number; // Stripe payment intent created timestamp (Unix seconds)
  type?: string;
  packageType?: string;
  miniDrawId?: string; // MiniDraw ID from purchase request
}

/**
 * Get the target mini draw for entry allocation
 *
 * Logic:
 * 1. Validate MiniDraw exists and is active
 * 2. Validate draw is accepting entries (not completed/cancelled)
 * 3. Return validated MiniDraw
 *
 * @param miniDrawId - Specific MiniDraw ID to add entries to
 * @param paymentMetadata - Optional payment metadata with created timestamp
 * @returns Target mini draw for entry allocation
 * @throws Error if MiniDraw is invalid, frozen, or not accepting entries
 */
export async function getTargetMiniDraw(miniDrawId: string, paymentMetadata?: PaymentMetadata): Promise<IMiniDraw> {
  console.log("🔍 getTargetMiniDraw called with:", { miniDrawId, paymentMetadata });

  // Step 1: Find the specific MiniDraw
  const miniDraw = await MiniDraw.findById(miniDrawId);

  if (!miniDraw) {
    throw new Error(`MiniDraw with ID ${miniDrawId} not found`);
  }

  console.log(`🔍 Found MiniDraw: ${miniDraw.name} (status: ${miniDraw.status})`);

  // Step 2: Validate MiniDraw is in a valid state to accept entries
  if (miniDraw.status !== "active") {
    throw new Error(`MiniDraw ${miniDraw.name} is ${miniDraw.status} and cannot accept new entries`);
  }

  // Step 3: Check if minimum entries has been reached
  if (miniDraw.totalEntries >= miniDraw.minimumEntries) {
    throw new Error(
      `MiniDraw ${miniDraw.name} has reached its minimum entries limit (${miniDraw.minimumEntries}) and is now closed`
    );
  }

  console.log(`✅ MiniDraw ${miniDraw.name} is valid for entry allocation`);
  return miniDraw;
}

/**
 * Get all active MiniDraws
 * @param filters - Optional filters for status
 * @returns Array of active MiniDraws
 */
export async function getActiveMiniDraws(filters?: { status?: string }): Promise<IMiniDraw[]> {
  const query: Record<string, unknown> = {};

  if (filters?.status) {
    query.status = filters.status;
  } else {
    // Default: get active draws
    query.status = "active";
  }

  const results = await MiniDraw.find(query)
    .sort({ createdAt: -1 }) // Latest first
    .lean();

  return results as unknown as IMiniDraw[];
}

/**
 * Check if a mini draw should be locked for configuration changes
 *
 * @param draw - Mini draw to check
 * @returns true if configuration should be locked
 */
export function shouldLockConfiguration(draw: IMiniDraw): boolean {
  if (draw.configurationLocked) {
    return true;
  }

  if (draw.status === "completed" || draw.status === "cancelled") {
    return true;
  }

  return false;
}

/**
 * Get mini draw display status for UI
 * Returns user-friendly status text
 *
 * @param draw - Mini draw
 * @returns Display status object
 */
export function getMiniDrawDisplayStatus(draw: IMiniDraw): {
  status: string;
  color: "green" | "yellow" | "red" | "blue" | "gray";
  message: string;
} {
  switch (draw.status) {
    case "active":
      return {
        status: "Active",
        color: "green",
        message: "Enter now to win!",
      };

    case "completed":
      if (draw.winner) {
        return {
          status: "Completed",
          color: "gray",
          message: "Winner announced",
        };
      }
      return {
        status: "Completed",
        color: "gray",
        message: "Winner to be announced",
      };

    case "cancelled":
      return {
        status: "Cancelled",
        color: "red",
        message: "This draw has been cancelled",
      };

    default:
      return {
        status: "Unknown",
        color: "gray",
        message: "",
      };
  }
}

/**
 * Validate that a mini draw can transition to a new status
 * @param currentStatus - Current status
 * @param newStatus - Desired new status
 * @returns Validation result
 */
export function validateStatusTransition(
  currentStatus: IMiniDraw["status"],
  newStatus: IMiniDraw["status"]
): { valid: boolean; error?: string } {
  const validTransitions: Record<IMiniDraw["status"], IMiniDraw["status"][]> = {
    active: ["completed", "cancelled"],
    completed: [], // Cannot transition from completed
    cancelled: [], // Cannot transition from cancelled
  };

  const allowedTransitions = validTransitions[currentStatus];

  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  return { valid: true };
}
