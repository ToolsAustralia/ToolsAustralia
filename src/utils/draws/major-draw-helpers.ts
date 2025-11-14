/**
 * Major Draw Helper Functions
 *
 * Utility functions for major draw lifecycle management, entry allocation,
 * and status transitions.
 */

import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import { isInFreezePeriod, wasPaymentBeforeFreeze } from "../common/timezone";

/**
 * Interface for payment metadata used in entry allocation
 */
export interface PaymentMetadata {
  created?: number; // Stripe payment intent created timestamp (Unix seconds)
  type?: string;
  packageType?: string;
}

/**
 * Get the target major draw for entry allocation
 *
 * Logic:
 * 1. If current draw is frozen -> route to next queued draw
 * 2. If payment was created during freeze -> route to next queued draw
 * 3. If current draw is active -> use current draw
 * 4. If no active draw (gap period) -> use next queued draw
 * 5. Error if no valid draw found
 *
 * @param paymentMetadata - Optional payment metadata with created timestamp
 * @returns Target major draw for entry allocation
 * @throws Error if no valid draw found
 */
export async function getTargetMajorDraw(paymentMetadata?: PaymentMetadata): Promise<IMajorDraw> {
  console.log("🔍 getTargetMajorDraw called with metadata:", paymentMetadata);

  // Step 1: Find currently active or frozen draw
  const currentDraw = await MajorDraw.findOne({
    status: { $in: ["active", "frozen"] },
  }).sort({ activationDate: -1 });

  console.log(
    `🔍 Step 1 - Current active/frozen draw: ${currentDraw ? `${currentDraw.name} (${currentDraw.status})` : "None"}`
  );

  // Step 2: Check if current draw is frozen
  if (currentDraw && currentDraw.status === "frozen") {
    console.log("🔒 Current draw is frozen, routing to next queued draw");
    const nextDraw = await getNextQueuedDraw();
    if (!nextDraw) {
      throw new Error("No queued draw available during freeze period");
    }
    return nextDraw;
  }

  // Step 3: Check if payment was created before freeze but processed after
  if (currentDraw && paymentMetadata?.created && currentDraw.freezeEntriesAt) {
    const paymentDate = new Date(paymentMetadata.created);
    const freezeDate = currentDraw.freezeEntriesAt;

    console.log(`🔍 Step 3 - Freeze period check:`);
    console.log(`   Payment created: ${paymentDate.toISOString()}`);
    console.log(`   Freeze starts at: ${freezeDate.toISOString()}`);
    console.log(`   Payment before freeze? ${paymentDate < freezeDate}`);

    if (!wasPaymentBeforeFreeze(paymentMetadata.created, currentDraw.freezeEntriesAt)) {
      console.log("⏰ Payment created during freeze period, routing to next queued draw");
      const nextDraw = await getNextQueuedDraw();
      if (!nextDraw) {
        throw new Error("No queued draw available for deferred entries");
      }
      console.log(`✅ Routing to queued draw: ${nextDraw.name} (ID: ${nextDraw._id})`);
      return nextDraw;
    } else {
      console.log("✅ Payment created before freeze, using current active draw");
    }
  }

  // Step 4: Use current active draw
  if (currentDraw && currentDraw.status === "active") {
    return currentDraw;
  }

  // Step 5: No active draw (gap period) - use next queued draw
  console.log("⏳ No active draw found (gap period), using next queued draw");
  const nextDraw = await getNextQueuedDraw();
  if (!nextDraw) {
    console.error("❌ CRITICAL: No queued draw found during gap period!");
    console.error("❌ Please ensure a queued draw exists in the database for entry allocation");
    throw new Error("No active or queued major draw found for entry allocation");
  }

  console.log(`✅ Found queued draw for gap period: ${nextDraw.name} (ID: ${nextDraw._id})`);
  return nextDraw;
}

/**
 * Get the next queued major draw
 * @returns Next queued draw or null if none found
 */
export async function getNextQueuedDraw(): Promise<IMajorDraw | null> {
  return await MajorDraw.findOne({
    status: "queued",
  }).sort({ activationDate: 1 }); // Earliest activation date first
}

/**
 * Get the current active major draw for public display
 * During gap period, may return the latest completed draw or the upcoming queued draw
 *
 * @param includeQueuedDuringGap - If true, returns queued draw during gap period
 * @returns Current active major draw or null
 */
export async function getCurrentMajorDrawForDisplay(
  includeQueuedDuringGap: boolean = true
): Promise<IMajorDraw | null> {
  const now = new Date();

  // Step 1: Try to find active or frozen draw
  let draw = await MajorDraw.findOne({
    status: { $in: ["active", "frozen"] },
    activationDate: { $lte: now }, // Only show if activation time has passed
  }).sort({ activationDate: -1 });

  // Step 2: If no active/frozen draw found, try to find the latest completed draw
  // This handles the gap period between completed and next active draw
  if (!draw) {
    console.log("🔍 No active/frozen draw found, checking for latest completed draw...");
    draw = await MajorDraw.findOne({
      status: "completed",
    }).sort({ drawDate: -1 }); // Most recent completed draw

    if (draw) {
      console.log(`✅ Found completed draw for display: ${draw.name}`);
    }
  }

  // Step 3: If still no draw and we should show queued during gap
  if (!draw && includeQueuedDuringGap) {
    console.log("🔍 No completed draw found, checking for queued draw...");
    draw = await MajorDraw.findOne({
      status: "queued",
      activationDate: { $gt: now }, // Future activation
    }).sort({ activationDate: 1 }); // Next queued draw

    if (draw) {
      console.log(`✅ Found queued draw for display: ${draw.name}`);
    }
  }

  return draw;
}

/**
 * Check if a major draw is currently in freeze period
 * @param draw - Major draw to check
 * @returns true if in freeze period
 */
export function isMajorDrawFrozen(draw: IMajorDraw): boolean {
  if (draw.status === "frozen") {
    return true;
  }

  if (!draw.freezeEntriesAt || !draw.drawDate) {
    return false;
  }

  return isInFreezePeriod(draw.freezeEntriesAt, draw.drawDate);
}

/**
 * Check if a major draw should be locked for configuration changes
 * Draws are locked once freeze period starts
 *
 * @param draw - Major draw to check
 * @returns true if configuration should be locked
 */
export function shouldLockConfiguration(draw: IMajorDraw): boolean {
  if (draw.configurationLocked) {
    return true;
  }

  if (draw.status === "frozen" || draw.status === "completed" || draw.status === "cancelled") {
    return true;
  }

  if (!draw.freezeEntriesAt) {
    return false;
  }

  return new Date() >= draw.freezeEntriesAt;
}

/**
 * Get all major draws that need status transition
 * Used by cron job to find draws that need to be transitioned
 *
 * @returns Object containing draws to freeze, complete, and activate
 */
export async function getDrawsNeedingTransition() {
  const now = new Date();

  // Find draws that need to be frozen (reached freeze time but still active)
  const drawsToFreeze = await MajorDraw.find({
    status: "active",
    freezeEntriesAt: { $lte: now },
    drawDate: { $gt: now }, // Draw hasn't happened yet
  });

  // Find draws that need to be completed (reached draw date but still active/frozen)
  const drawsToComplete = await MajorDraw.find({
    status: { $in: ["active", "frozen"] },
    drawDate: { $lte: now },
  });

  // Find draws that need to be activated (reached activation date but still queued)
  const drawsToActivate = await MajorDraw.find({
    status: "queued",
    activationDate: { $lte: now },
  });

  return {
    drawsToFreeze,
    drawsToComplete,
    drawsToActivate,
  };
}

/**
 * Check if it's time to create the next queued draw
 * Next draw should be created 7 days before current draw date
 *
 * @returns true if next draw should be created
 */
export async function shouldCreateNextDraw(): Promise<boolean> {
  const now = new Date();

  // Get current active or frozen draw
  const currentDraw = await MajorDraw.findOne({
    status: { $in: ["active", "frozen"] },
  }).sort({ activationDate: -1 });

  if (!currentDraw || !currentDraw.drawDate) {
    return false;
  }

  // Check if we're within 7 days of the draw date
  const sevenDaysBeforeDraw = new Date(currentDraw.drawDate);
  sevenDaysBeforeDraw.setDate(sevenDaysBeforeDraw.getDate() - 7);

  // Check if next queued draw already exists
  const existingQueuedDraw = await MajorDraw.findOne({
    status: "queued",
    activationDate: { $gt: currentDraw.drawDate }, // After current draw
  });

  // Should create if we're past 7-day mark and no queued draw exists
  return now >= sevenDaysBeforeDraw && !existingQueuedDraw;
}

/**
 * Validate that a major draw can transition to a new status
 * @param currentStatus - Current status
 * @param newStatus - Desired new status
 * @returns Validation result
 */
export function validateStatusTransition(
  currentStatus: IMajorDraw["status"],
  newStatus: IMajorDraw["status"]
): { valid: boolean; error?: string } {
  const validTransitions: Record<IMajorDraw["status"], IMajorDraw["status"][]> = {
    queued: ["active", "cancelled"],
    active: ["frozen", "cancelled"],
    frozen: ["completed", "cancelled"],
    completed: [], // Cannot transition from completed
    cancelled: [], // Cannot transition from cancelled
  };

  const allowedTransitions = validTransitions[currentStatus];

  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  return { valid: true };
}

/**
 * Get major draw display status for UI
 * Returns user-friendly status text
 *
 * @param draw - Major draw
 * @returns Display status object
 */
export function getMajorDrawDisplayStatus(draw: IMajorDraw): {
  status: string;
  color: "green" | "yellow" | "red" | "blue" | "gray";
  message: string;
} {
  const now = new Date();

  switch (draw.status) {
    case "queued":
      return {
        status: "Coming Soon",
        color: "blue",
        message: `Starts ${draw.activationDate ? draw.activationDate.toLocaleDateString() : "soon"}`,
      };

    case "active":
      if (draw.freezeEntriesAt && now >= draw.freezeEntriesAt) {
        // Should be frozen but status not updated yet
        return {
          status: "Closing Soon",
          color: "yellow",
          message: "Entries closing soon!",
        };
      }
      return {
        status: "Active",
        color: "green",
        message: "Enter now to win!",
      };

    case "frozen":
      return {
        status: "Entries Closed",
        color: "yellow",
        message: "Draw happening soon!",
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
