/**
 * Error thrown during data aggregation
 */

import { MetricsError } from "./MetricsError";

export class AggregationError extends MetricsError {
  constructor(message: string, public date?: Date) {
    super(message, "AGGREGATION_ERROR", 500);
    this.name = "AggregationError";
    Object.setPrototypeOf(this, AggregationError.prototype);
  }
}

