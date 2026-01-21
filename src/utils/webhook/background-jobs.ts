/**
 * Background Job Utilities
 * 
 * Centralized utilities for executing non-critical background operations
 * without blocking webhook responses. Following Stripe's best practice to
 * respond quickly (within 5 seconds) and process non-critical tasks asynchronously.
 * 
 * Best Practices:
 * - Use for non-critical operations (Klaviyo sync, pixel tracking, commission processing)
 * - Critical operations (payment processing, database saves) should remain synchronous
 * - Errors are logged but don't affect webhook response
 * - All background jobs execute in parallel without blocking
 */

/**
 * Execute a background job without blocking webhook response
 * Catches and logs errors without throwing
 * 
 * @param name - Descriptive name for the background job (for logging)
 * @param job - Async function to execute in background
 * @param options - Optional configuration
 * @param options.logErrors - Whether to log errors (default: true)
 */
export function executeBackgroundJob(
  name: string,
  job: () => Promise<void>,
  options?: { logErrors?: boolean }
): void {
  job().catch((error) => {
    if (options?.logErrors !== false) {
      console.error(`[Background Job] ${name} failed:`, error);
    }
  });
}

/**
 * Execute multiple background jobs in parallel without blocking
 * All jobs execute concurrently and independently
 * 
 * @param jobs - Array of background jobs to execute
 * @param jobs[].name - Descriptive name for the job
 * @param jobs[].job - Async function to execute
 */
export function executeBackgroundJobs(
  jobs: Array<{ name: string; job: () => Promise<void> }>
): void {
  jobs.forEach(({ name, job }) => executeBackgroundJob(name, job));
}
