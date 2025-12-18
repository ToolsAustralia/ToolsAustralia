/**
 * Klaviyo Failed Events Queue Utility Functions
 *
 * Utility functions for managing and monitoring the Klaviyo failed events queue.
 * Useful for debugging, monitoring, and manual operations.
 *
 * @module utils/integrations/klaviyo/klaviyo-queue
 */

import connectDB from "@/lib/mongodb";
import KlaviyoFailedEvent, { IKlaviyoFailedEvent } from "@/models/KlaviyoFailedEvent";
import { klaviyo } from "@/lib/klaviyo";

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
  pending: number;
  processing: number;
  succeeded: number;
  failed_permanent: number;
  total: number;
  readyToRetry: number; // Events ready to retry now
  oldestPending?: Date; // Oldest pending event
  newestPending?: Date; // Newest pending event
}

/**
 * Get queue statistics for monitoring
 *
 * @returns Queue statistics object
 */
export async function getFailedEventsStats(): Promise<QueueStats> {
  await connectDB();

  const now = new Date();

  // Get counts by status
  const [pending, processing, succeeded, failed_permanent] = await Promise.all([
    KlaviyoFailedEvent.countDocuments({ status: "pending" }),
    KlaviyoFailedEvent.countDocuments({ status: "processing" }),
    KlaviyoFailedEvent.countDocuments({ status: "succeeded" }),
    KlaviyoFailedEvent.countDocuments({ status: "failed_permanent" }),
  ]);

  // Count events ready to retry
  const readyToRetry = await KlaviyoFailedEvent.countDocuments({
    status: "pending",
    nextRetryAt: { $lte: now },
  });

  // Get oldest and newest pending events
  const oldestPending = await KlaviyoFailedEvent.findOne({ status: "pending" })
    .sort({ createdAt: 1 })
    .select("createdAt")
    .lean();

  const newestPending = await KlaviyoFailedEvent.findOne({ status: "pending" })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();

  // Handle lean() query results - they return plain objects
  const oldestDate =
    oldestPending && "createdAt" in oldestPending && oldestPending.createdAt
      ? new Date(oldestPending.createdAt as Date)
      : undefined;

  const newestDate =
    newestPending && "createdAt" in newestPending && newestPending.createdAt
      ? new Date(newestPending.createdAt as Date)
      : undefined;

  return {
    pending,
    processing,
    succeeded,
    failed_permanent,
    total: pending + processing + succeeded + failed_permanent,
    readyToRetry,
    oldestPending: oldestDate,
    newestPending: newestDate,
  };
}

/**
 * Manually retry a specific failed event by ID
 * Useful for admin operations or debugging
 *
 * @param eventId - MongoDB document ID of the failed event
 * @returns Success status and result
 */
export async function manuallyRetryFailedEvent(eventId: string): Promise<{
  success: boolean;
  message: string;
  event?: IKlaviyoFailedEvent;
}> {
  await connectDB();

  try {
    const failedEvent = await KlaviyoFailedEvent.findById(eventId);

    if (!failedEvent) {
      return {
        success: false,
        message: `Failed event with ID ${eventId} not found`,
      };
    }

    if (failedEvent.status === "succeeded") {
      return {
        success: false,
        message: "Event has already been successfully processed",
        event: failedEvent,
      };
    }

    if (failedEvent.status === "failed_permanent") {
      // Reset permanent failures to allow retry
      failedEvent.status = "pending";
      failedEvent.retryCount = 0;
      failedEvent.nextRetryAt = new Date(); // Retry immediately
      await failedEvent.save();
    }

    const success = await klaviyo.retryFailedEvent(failedEvent);

    return {
      success,
      message: success
        ? "Event successfully retried and sent to Klaviyo"
        : `Retry failed. Event will be retried again automatically. Retry count: ${failedEvent.retryCount}/${failedEvent.maxRetries}`,
      event: failedEvent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Error retrying event: ${errorMessage}`,
    };
  }
}

/**
 * Clear old failed events manually
 * Useful for manual cleanup or testing
 *
 * @param days - Number of days old to delete (default: 30 for succeeded, 90 for failed)
 * @param status - Status to clean up ('succeeded' | 'failed_permanent' | 'all')
 * @returns Number of events deleted
 */
export async function clearOldFailedEvents(
  days: number = 30,
  status: "succeeded" | "failed_permanent" | "all" = "all"
): Promise<{
  success: boolean;
  deletedCount: number;
  message: string;
}> {
  await connectDB();

  try {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query: Record<string, unknown> = {};

    if (status === "succeeded") {
      query = {
        status: "succeeded",
        succeededAt: { $lt: cutoffDate },
      };
    } else if (status === "failed_permanent") {
      query = {
        status: "failed_permanent",
        createdAt: { $lt: cutoffDate },
      };
    } else {
      // Delete both succeeded and failed_permanent
      query = {
        $or: [
          {
            status: "succeeded",
            succeededAt: { $lt: cutoffDate },
          },
          {
            status: "failed_permanent",
            createdAt: { $lt: cutoffDate },
          },
        ],
      };
    }

    const result = await KlaviyoFailedEvent.deleteMany(query);

    return {
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} events older than ${days} days`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      deletedCount: 0,
      message: `Error clearing old events: ${errorMessage}`,
    };
  }
}

/**
 * Get failed events by status
 * Useful for debugging and monitoring
 *
 * @param status - Status to filter by
 * @param limit - Maximum number of events to return (default: 50)
 * @returns Array of failed events (as plain objects)
 */
export async function getFailedEventsByStatus(
  status: "pending" | "processing" | "succeeded" | "failed_permanent",
  limit: number = 50
): Promise<IKlaviyoFailedEvent[]> {
  await connectDB();

  // Return full documents (not lean) to maintain type compatibility
  return await KlaviyoFailedEvent.find({ status })
    .sort({ createdAt: -1 }) // Newest first
    .limit(limit)
    .exec();
}
