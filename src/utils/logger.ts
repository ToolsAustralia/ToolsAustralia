/**
 * Centralized Logging Utility
 *
 * Provides structured logging with levels, context, and environment-aware behavior.
 * Replaces console.log/error/warn throughout the codebase for better maintainability.
 *
 * @module utils/logger
 */

import { env } from "@/config/env";

// ============================================================
// LOG LEVELS
// ============================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ============================================================
// LOG CONTEXT
// ============================================================

export interface LogContext {
  [key: string]: unknown;
  userId?: string;
  email?: string;
  paymentIntentId?: string;
  subscriptionId?: string;
  error?: Error | unknown; // Allow Error or unknown for error context
  duration?: number;
  [key: `x-${string}`]: unknown; // Allow custom context keys
}

// ============================================================
// LOGGER CONFIGURATION
// ============================================================

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

const getLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_MAP) {
    return LOG_LEVEL_MAP[envLevel];
  }

  return env.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
};

const MIN_LOG_LEVEL = getLogLevel();

// ============================================================
// LOG FORMATTING
// ============================================================

function formatMessage(level: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

function formatError(error: Error, context?: LogContext): string {
  const errorContext: LogContext = {
    ...context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };
  return formatMessage("error", error.message, errorContext);
}

// ============================================================
// LOGGER IMPLEMENTATION
// ============================================================

class Logger {
  private shouldLog(level: LogLevel): boolean {
    // Always log errors in production
    if (level >= LogLevel.ERROR) {
      return true;
    }

    // Respect minimum log level
    if (level < MIN_LOG_LEVEL) {
      return false;
    }

    // In production, only log INFO and above (unless verbose logging is enabled)
    if (env.isProduction && !env.logging.webhookVerbose) {
      return level >= LogLevel.INFO;
    }

    return true;
  }

  /**
   * Debug logging - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    if (env.isDevelopment) {
      console.debug(`🐛 ${message}`, context || "");
    }
  }

  /**
   * Info logging - general information
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    console.log(`ℹ️ ${message}`, context || "");
  }

  /**
   * Warning logging - potential issues
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    console.warn(`⚠️ ${message}`, context || "");
  }

  /**
   * Error logging - errors that need attention
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    if (error instanceof Error) {
      const errorContext: LogContext = {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: env.isDevelopment ? error.stack : undefined,
        },
      };
      console.error(`❌ ${message}`, errorContext);
    } else {
      console.error(`❌ ${message}`, { ...context, error });
    }
  }

  /**
   * Success logging - positive outcomes
   */
  success(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    console.log(`✅ ${message}`, context || "");
  }

  /**
   * Payment-specific logging
   */
  payment(message: string, context?: LogContext): void {
    this.info(`💳 ${message}`, context);
  }

  /**
   * Webhook-specific logging
   */
  webhook(message: string, context?: LogContext): void {
    if (env.logging.webhookVerbose || env.isDevelopment) {
      this.info(`🔄 WEBHOOK: ${message}`, context);
    }
  }

  /**
   * API request logging
   */
  api(method: string, endpoint: string, context?: LogContext): void {
    this.debug(`🌐 ${method} ${endpoint}`, context);
  }

  /**
   * Database operation logging
   */
  database(operation: string, context?: LogContext): void {
    this.debug(`💾 DB: ${operation}`, context);
  }
}

// ============================================================
// EXPORT SINGLETON INSTANCE
// ============================================================

export const logger = new Logger();

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export const log = logger;
export default logger;
