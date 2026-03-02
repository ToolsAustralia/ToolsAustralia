import mongoose from "mongoose";
import "@/models/MajorDraw"; // Side-effect: registers model with mongoose
import type { IMajorDraw } from "@/models/MajorDraw";

/**
 * Major Draw Transition Service
 *
 * Handles status transitions for major draws (completed, activated, frozen)
 * in a dedicated service with proper timeout protection, debouncing, and error handling.
 *
 * Architecture:
 * - Called explicitly at appropriate times (webhook, cron, helper functions)
 * - Idempotent operations (safe to call multiple times)
 * - Debounced to prevent stampede during webhook bursts
 * - Never throws - always returns result object for graceful degradation
 *
 * Note: Debouncing is best-effort per lambda instance, not a distributed lock.
 * This is acceptable because operations are idempotent and cron serves as fallback.
 */

export interface TransitionResult {
  success: boolean;
  completed: number;
  activated: number;
  frozen: number;
  skipped: boolean; // true if debounced
  duration: number;
  error?: string;
  connectionState?: {
    readyState: number;
    pinged: boolean;
  };
}

// Debouncing: Track last execution time per lambda instance
// Note: This is best-effort per instance, not a distributed lock
let lastExecutionTime: number = 0;
const DEBOUNCE_WINDOW_MS = 5000; // 5 seconds

// Connection health: Track last ping time to throttle expensive ping checks
let lastPingTime: number = 0;
const PING_THROTTLE_MS = 30000; // 30 seconds

/**
 * Check connection health with throttled ping
 * Primary check: readyState (fast, no network call)
 * Secondary check: ping (throttled to once per 30 seconds)
 */
async function checkConnectionHealth(): Promise<{ healthy: boolean; pinged: boolean }> {
  // Primary check: readyState
  if (mongoose.connection.readyState !== 1) {
    return { healthy: false, pinged: false };
  }

  // Secondary check: ping (only if last ping was > 30 seconds ago)
  const now = Date.now();
  const timeSinceLastPing = now - lastPingTime;

  if (timeSinceLastPing > PING_THROTTLE_MS) {
    try {
      // Ping with timeout to prevent hanging
      // Check if db is available before pinging
      if (!mongoose.connection.db) {
        return { healthy: false, pinged: true };
      }
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Ping timeout")), 2000)),
      ]);
      lastPingTime = now;
      return { healthy: true, pinged: true };
    } catch {
      // Ping failed - connection may be unhealthy
      return { healthy: false, pinged: true };
    }
  }

  // Skip ping (throttled) but readyState is healthy
  return { healthy: true, pinged: false };
}

/**
 * Transition major draws if needed
 *
 * Performs three atomic operations in parallel:
 * 1. Complete draws that reached draw date
 * 2. Activate queued draws that reached activation date
 * 3. Freeze active draws that reached freeze time
 *
 * All operations are:
 * - Idempotent (safe to call multiple times)
 * - Timeout protected (maxTimeMS: 5000)
 * - Observable (query comments for MongoDB Atlas profiling)
 *
 * @returns Transition result with counts and metrics
 */
export async function transitionMajorDrawsIfNeeded(): Promise<TransitionResult> {
  const startTime = Date.now();
  const currentDate = new Date();

  // Debouncing: Skip if executed within last 5 seconds
  const now = Date.now();
  const timeSinceLastExecution = now - lastExecutionTime;

  if (timeSinceLastExecution < DEBOUNCE_WINDOW_MS) {
    return {
      success: true,
      completed: 0,
      activated: 0,
      frozen: 0,
      skipped: true,
      duration: Date.now() - startTime,
      connectionState: {
        readyState: mongoose.connection.readyState,
        pinged: false,
      },
    };
  }

  // Update last execution time
  lastExecutionTime = now;

  try {
    // Check connection health
    const connectionHealth = await checkConnectionHealth();

    if (!connectionHealth.healthy) {
      return {
        success: false,
        completed: 0,
        activated: 0,
        frozen: 0,
        skipped: false,
        duration: Date.now() - startTime,
        error: `Connection unhealthy (readyState: ${mongoose.connection.readyState})`,
        connectionState: {
          readyState: mongoose.connection.readyState,
          pinged: connectionHealth.pinged,
        },
      };
    }

    // Get the compiled model safely from mongoose registry
    const MajorDrawModel = (mongoose.models.MajorDraw ||
      mongoose.model<IMajorDraw>("MajorDraw")) as mongoose.Model<IMajorDraw>;

    // Execute all three transitions in parallel for better performance
    // Use Promise.allSettled to handle partial failures gracefully
    const [completedResult, activatedResult, frozenResult] = await Promise.allSettled([
      // STEP 1: Complete draws that reached draw date
      MajorDrawModel.updateMany(
        {
          status: { $in: ["active", "frozen"] },
          drawDate: { $lte: currentDate }, // Draw date has passed
        },
        {
          $set: {
            status: "completed",
            isActive: false, // Backward compatibility
            configurationLocked: true,
            lockedAt: currentDate,
          },
        },
        {
          maxTimeMS: 5000,
          comment: "major-draw-transition",
        }
      ),

      // STEP 2: Activate queued draws that reached activation date
      // Happens after completing draws to avoid status conflicts
      MajorDrawModel.updateMany(
        {
          status: "queued",
          activationDate: { $lte: currentDate }, // Activation time has arrived
        },
        {
          $set: {
            status: "active",
            isActive: true, // Backward compatibility
          },
        },
        {
          maxTimeMS: 5000,
          comment: "major-draw-transition",
        }
      ),

      // STEP 3: Freeze active draws that reached freeze time
      // Happens last since it only affects active draws
      MajorDrawModel.updateMany(
        {
          status: "active",
          freezeEntriesAt: { $lte: currentDate }, // Freeze time has arrived
          drawDate: { $gt: currentDate }, // Draw hasn't happened yet
        },
        {
          $set: {
            status: "frozen",
            configurationLocked: true,
            lockedAt: currentDate,
          },
        },
        {
          maxTimeMS: 5000,
          comment: "major-draw-transition",
        }
      ),
    ]);

    // Extract results from Promise.allSettled
    const completedCount =
      completedResult.status === "fulfilled" ? completedResult.value.modifiedCount : 0;
    const activatedCount =
      activatedResult.status === "fulfilled" ? activatedResult.value.modifiedCount : 0;
    const frozenCount = frozenResult.status === "fulfilled" ? frozenResult.value.modifiedCount : 0;

    // Check for errors
    const errors: string[] = [];
    if (completedResult.status === "rejected") {
      errors.push(`Completed transition failed: ${completedResult.reason}`);
    }
    if (activatedResult.status === "rejected") {
      errors.push(`Activated transition failed: ${activatedResult.reason}`);
    }
    if (frozenResult.status === "rejected") {
      errors.push(`Frozen transition failed: ${frozenResult.reason}`);
    }

    const success = errors.length === 0;
    const duration = Date.now() - startTime;

    // Log results (only in development or if verbose logging enabled)
    if (process.env.NODE_ENV === "development" || process.env.WEBHOOK_VERBOSE_LOGGING === "true") {
      if (completedCount > 0 || activatedCount > 0 || frozenCount > 0) {
        console.log(`✅ Major draw transitions: ${completedCount} completed, ${activatedCount} activated, ${frozenCount} frozen (${duration}ms)`);
      }
      if (errors.length > 0) {
        console.warn(`⚠️ Major draw transition errors:`, errors);
      }
    }

    return {
      success,
      completed: completedCount,
      activated: activatedCount,
      frozen: frozenCount,
      skipped: false,
      duration,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      connectionState: {
        readyState: mongoose.connection.readyState,
        pinged: connectionHealth.pinged,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    console.error("❌ Major draw transition service error:", errorMessage);
    console.error("   Connection state:", {
      readyState: mongoose.connection.readyState,
      hasConnection: !!mongoose.connection.db,
    });

    return {
      success: false,
      completed: 0,
      activated: 0,
      frozen: 0,
      skipped: false,
      duration,
      error: errorMessage,
      connectionState: {
        readyState: mongoose.connection.readyState,
        pinged: false,
      },
    };
  }
}
