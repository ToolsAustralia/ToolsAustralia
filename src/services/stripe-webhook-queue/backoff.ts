export const BACKOFF_SCHEDULE_MS: ReadonlyArray<number> = [
  0,                  // attempts=0 → process immediately (initial enqueue)
  60 * 1000,          // attempts=1 → retry after 1 minute
  5 * 60 * 1000,      // attempts=2 → retry after 5 minutes
  15 * 60 * 1000,     // attempts=3 → retry after 15 minutes
  60 * 60 * 1000,     // attempts=4 → retry after 1 hour
  6 * 60 * 60 * 1000, // attempts=5 → retry after 6 hours
];

export const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;

/**
 * Return the Date at which the worker should next pick this row up, given
 * how many times it has been attempted so far. Returns the string "dead"
 * when the retry budget is exhausted.
 */
export function computeNextAttempt(attempts: number, now: Date = new Date()): Date | "dead" {
  if (attempts >= MAX_ATTEMPTS) return "dead";
  const offsetMs = BACKOFF_SCHEDULE_MS[attempts];
  return new Date(now.getTime() + offsetMs);
}
