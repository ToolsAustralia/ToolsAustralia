/**
 * MongoDB Connection Health Utilities
 *
 * Provides utilities for checking connection health and pool availability
 * before performing database operations.
 *
 * @module utils/database/connection-health
 */

import connectDB, { getConnectionMetrics } from "@/lib/mongodb";
import mongoose from "mongoose";

/**
 * Connection health status
 */
export interface ConnectionHealthStatus {
  healthy: boolean;
  readyState: number;
  poolMetrics: {
    active: number;
    idle: number;
    maxPoolSize: number;
    waitQueue: number;
    utilizationPercent: number;
  } | null;
  error?: string;
}

/**
 * Check if MongoDB connection is healthy
 * Performs a ping to verify the connection is responsive
 *
 * @returns Health status with connection and pool metrics
 */
export async function checkConnectionHealth(): Promise<ConnectionHealthStatus> {
  try {
    const conn = await connectDB();
    
    // Verify connection is responsive with ping
    await conn.db.admin().ping();
    
    const metrics = getConnectionMetrics();
    const utilizationPercent = metrics
      ? Math.round((metrics.active / metrics.maxPoolSize) * 100)
      : 0;
    
    return {
      healthy: true,
      readyState: conn.readyState,
      poolMetrics: metrics
        ? {
            active: metrics.active,
            idle: metrics.idle,
            maxPoolSize: metrics.maxPoolSize,
            waitQueue: metrics.waitQueue,
            utilizationPercent,
          }
        : null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      readyState: mongoose.connection.readyState,
      poolMetrics: getConnectionMetrics()
        ? {
            active: getConnectionMetrics()!.active,
            idle: getConnectionMetrics()!.idle,
            maxPoolSize: getConnectionMetrics()!.maxPoolSize,
            waitQueue: getConnectionMetrics()!.waitQueue,
            utilizationPercent: 0,
          }
        : null,
      error: errorMessage,
    };
  }
}

/**
 * Check if connection pool has available capacity
 * Returns true if pool utilization is below the threshold
 *
 * @param thresholdPercent - Maximum pool utilization percentage (default: 80)
 * @returns true if pool has capacity, false otherwise
 */
export async function hasPoolCapacity(thresholdPercent = 80): Promise<boolean> {
  try {
    const metrics = getConnectionMetrics();
    if (!metrics) {
      // If metrics unavailable, assume capacity exists (conservative)
      return true;
    }
    
    const utilizationPercent = (metrics.active / metrics.maxPoolSize) * 100;
    return utilizationPercent < thresholdPercent;
  } catch (error) {
    // On error, assume capacity exists (conservative approach)
    console.warn("Error checking pool capacity:", error);
    return true;
  }
}

/**
 * Wait for pool capacity to become available
 * Useful before starting bulk operations
 *
 * @param thresholdPercent - Maximum pool utilization percentage (default: 80)
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 10000)
 * @param checkIntervalMs - Interval between checks in milliseconds (default: 500)
 * @returns true if capacity became available, false if timeout
 */
export async function waitForPoolCapacity(
  thresholdPercent = 80,
  maxWaitMs = 10000,
  checkIntervalMs = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await hasPoolCapacity(thresholdPercent)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }
  
  return false;
}

/**
 * Get current pool utilization percentage
 *
 * @returns Pool utilization percentage (0-100), or null if unavailable
 */
export function getPoolUtilization(): number | null {
  try {
    const metrics = getConnectionMetrics();
    if (!metrics) return null;
    
    return Math.round((metrics.active / metrics.maxPoolSize) * 100);
  } catch (error) {
    return null;
  }
}
