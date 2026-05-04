import { stripe } from "@/lib/stripe";
import { AllowlistService } from "./AllowlistService";
import { MongoAllowlistRepository } from "./MongoAllowlistRepository";

let instance: AllowlistService | null = null;

/** Returns the process-singleton AllowlistService wired to real Stripe + Mongo. */
export function getAllowlistService(): AllowlistService {
  if (instance) return instance;
  instance = new AllowlistService({
    repo: new MongoAllowlistRepository(),
    stripeRadar: stripe.radar,
    stripeClient: stripe,
  });
  return instance;
}

export type { AllowlistService } from "./AllowlistService";
