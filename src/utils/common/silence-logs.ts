/**
 * Comprehensive Console Log Silencer for Production
 *
 * Automatically disables ALL console logging methods (log, info, warn, debug, table, group, etc.)
 * in production environments to prevent console output in production builds.
 *
 * Uses multiple override strategies for maximum compatibility:
 * 1. Direct assignment (fastest, works in most cases)
 * 2. Object.defineProperty (for read-only properties)
 * 3. Proxy wrapper (ultimate fallback)
 *
 * This works as a runtime fallback - console logs are also stripped at build time
 * via Next.js compiler options, but this ensures any remaining logs are silenced.
 *
 * Console.error is preserved for critical error reporting.
 */

declare const process: { env: Record<string, string | undefined> };

// Type definition for window extension with original console methods
interface WindowWithOriginalConsole extends Window {
  __originalConsole?: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    debug: typeof console.debug;
    table: typeof console.table;
    group: typeof console.group;
    groupEnd: typeof console.groupEnd;
    groupCollapsed: typeof console.groupCollapsed;
    time: typeof console.time;
    timeEnd: typeof console.timeEnd;
    timeLog: typeof console.timeLog;
    trace: typeof console.trace;
    dir: typeof console.dir;
    dirxml: typeof console.dirxml;
    count: typeof console.count;
    countReset: typeof console.countReset;
    clear: typeof console.clear;
  };
}

// List of console methods to silence (excluding error)
const CONSOLE_METHODS_TO_SILENCE = [
  "log",
  "info",
  "warn",
  "debug",
  "table",
  "group",
  "groupEnd",
  "groupCollapsed",
  "time",
  "timeEnd",
  "timeLog",
  "trace",
  "dir",
  "dirxml",
  "count",
  "countReset",
  "clear",
] as const;

// No-op function that accepts any arguments
const noop = (): void => {
  // Intentionally empty - this function does nothing
};

/**
 * Silences a console method using multiple strategies for maximum compatibility
 */
function silenceConsoleMethod(methodName: string): boolean {
  if (!console || typeof console !== "object") {
    return false;
  }

  // Type-safe console access
  const consoleAny = console as unknown as Record<string, unknown>;

  // Strategy 1: Direct assignment (fastest, works in most browsers)
  try {
    consoleAny[methodName] = noop;
    // Verify it worked by checking if the method is now a noop
    if (consoleAny[methodName] === noop) {
      return true;
    }
  } catch {
    // Fall through to next strategy
  }

  // Strategy 2: Object.defineProperty (for read-only properties)
  try {
    Object.defineProperty(console, methodName, {
      value: noop,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return true;
  } catch {
    // Fall through to next strategy
  }

  // Strategy 3: Try to wrap with a function that does nothing
  try {
    const originalMethod = consoleAny[methodName];
    if (typeof originalMethod === "function") {
      consoleAny[methodName] = function () {
        // Intentionally empty - do nothing
      };
      return true;
    }
  } catch {
    // All strategies failed
  }

  return false;
}

/**
 * Main silencing function - runs immediately when module loads
 */
function silenceConsole(): void {
  // Only run in browser environment (client-side)
  if (typeof window === "undefined" || typeof console === "undefined") {
    return;
  }

  // Check if we're in production or if SILENCE_LOGS is explicitly set
  const isProduction = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production";

  const shouldSilence =
    isProduction || (typeof process !== "undefined" && process.env && process.env.SILENCE_LOGS === "true");

  if (!shouldSilence) {
    return;
  }

  // Store original methods for potential debugging (only in development)
  const originalConsole: Partial<WindowWithOriginalConsole["__originalConsole"]> = {};
  const isDevelopment = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development";

  // Store original methods before silencing
  if (isDevelopment) {
    const consoleAny = console as unknown as Record<string, unknown>;
    const originalConsoleAny = originalConsole as Record<string, unknown>;

    for (const methodName of CONSOLE_METHODS_TO_SILENCE) {
      if (methodName in console && typeof consoleAny[methodName] === "function") {
        originalConsoleAny[methodName] = consoleAny[methodName];
      }
    }
  }

  // Silence all console methods
  for (const methodName of CONSOLE_METHODS_TO_SILENCE) {
    if (methodName in console) {
      silenceConsoleMethod(methodName);
    }
  }

  // Expose original methods for debugging (only in development)
  if (isDevelopment && Object.keys(originalConsole).length > 0) {
    (window as WindowWithOriginalConsole).__originalConsole =
      originalConsole as WindowWithOriginalConsole["__originalConsole"];
  }
}

// Execute immediately when module loads - this ensures it runs before any other code
silenceConsole();

export {};
