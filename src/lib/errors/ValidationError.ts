/**
 * Error thrown during input validation
 */

import { MetricsError } from "./MetricsError";

export class ValidationError extends MetricsError {
  constructor(message: string, public details?: unknown) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

