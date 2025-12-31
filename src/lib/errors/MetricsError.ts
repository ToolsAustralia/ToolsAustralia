/**
 * Base error class for metrics operations
 */

export class MetricsError extends Error {
  constructor(
    message: string,
    public code: string = "METRICS_ERROR",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "MetricsError";
    Object.setPrototypeOf(this, MetricsError.prototype);
  }
}

