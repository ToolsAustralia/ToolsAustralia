/**
 * Circuit Breaker for MongoDB Connection Failures
 *
 * Implements circuit breaker pattern to prevent cascading failures
 * when MongoDB connections repeatedly fail. After threshold failures,
 * the circuit opens and blocks connection attempts for a cooldown period.
 *
 * @module utils/database/circuit-breaker
 */

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  state: "closed" | "open" | "half-open";
}

class ConnectionCircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: null,
    state: "closed",
  };

  private readonly failureThreshold: number;
  private readonly cooldownPeriodMs: number;
  private readonly resetTimeoutMs: number;

  constructor(
    failureThreshold = 5,
    cooldownPeriodMs = 30000, // 30 seconds
    resetTimeoutMs = 60000 // 1 minute
  ) {
    this.failureThreshold = failureThreshold;
    this.cooldownPeriodMs = cooldownPeriodMs;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  /**
   * Check if circuit breaker allows connection attempt
   *
   * @returns true if connection is allowed, false if circuit is open
   */
  canAttempt(): boolean {
    const now = Date.now();

    // If circuit is closed, allow attempts
    if (this.state.state === "closed") {
      return true;
    }

    // If circuit is open, check if cooldown period has passed
    if (this.state.state === "open") {
      if (
        this.state.lastFailureTime &&
        now - this.state.lastFailureTime > this.cooldownPeriodMs
      ) {
        // Cooldown passed, move to half-open state
        this.state.state = "half-open";
        this.state.failures = 0;
        return true;
      }
      return false;
    }

    // If circuit is half-open, allow one attempt
    if (this.state.state === "half-open") {
      return true;
    }

    return false;
  }

  /**
   * Record a successful connection
   * Resets failure count and closes circuit if it was half-open
   */
  recordSuccess(): void {
    if (this.state.state === "half-open") {
      // Successful connection in half-open state, close the circuit
      this.state.state = "closed";
      this.state.failures = 0;
      this.state.lastFailureTime = null;
    } else if (this.state.state === "closed") {
      // Reset failure count on success
      this.state.failures = 0;
    }
  }

  /**
   * Record a connection failure
   * Increments failure count and opens circuit if threshold reached
   */
  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failures >= this.failureThreshold) {
      this.state.state = "open";
      console.error(
        `🔴 Circuit breaker OPENED after ${this.state.failures} failures. Blocking connections for ${this.cooldownPeriodMs}ms`
      );
    } else if (this.state.state === "half-open") {
      // Failure in half-open state, open circuit again
      this.state.state = "open";
      console.error(
        `🔴 Circuit breaker RE-OPENED after failure in half-open state`
      );
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Manually reset circuit breaker (for testing/recovery)
   */
  reset(): void {
    this.state = {
      failures: 0,
      lastFailureTime: null,
      state: "closed",
    };
  }
}

// Singleton instance
let circuitBreakerInstance: ConnectionCircuitBreaker | null = null;

/**
 * Get circuit breaker instance (singleton)
 */
export function getCircuitBreaker(): ConnectionCircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new ConnectionCircuitBreaker();
  }
  return circuitBreakerInstance;
}

/**
 * Check if connection attempt is allowed by circuit breaker
 *
 * @returns true if connection is allowed, false if blocked
 */
export function canAttemptConnection(): boolean {
  return getCircuitBreaker().canAttempt();
}

/**
 * Record successful connection
 */
export function recordConnectionSuccess(): void {
  getCircuitBreaker().recordSuccess();
}

/**
 * Record connection failure
 */
export function recordConnectionFailure(): void {
  getCircuitBreaker().recordFailure();
}

/**
 * Get circuit breaker state for monitoring
 */
export function getCircuitBreakerState(): CircuitBreakerState {
  return getCircuitBreaker().getState();
}

/**
 * Reset circuit breaker (for testing/recovery)
 */
export function resetCircuitBreaker(): void {
  getCircuitBreaker().reset();
}
