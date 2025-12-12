import connectDB from "@/lib/mongodb";
import PromoLink from "@/models/PromoLink";

/**
 * Generate a unique promo link code
 * Format: BONUS + 6 alphanumeric characters (e.g., BONUS1A2B3C)
 *
 * @param maxRetries - Maximum number of retry attempts (default: 10)
 * @returns A unique promo code that doesn't exist in the database
 */
export async function generatePromoLinkCode(maxRetries: number = 10): Promise<string> {
  await connectDB();

  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let attempts = 0;

  while (attempts < maxRetries) {
    // Generate 6 random alphanumeric characters
    let randomSuffix = "";
    for (let i = 0; i < 6; i++) {
      randomSuffix += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const code = `BONUS${randomSuffix}`;

    // Check if code already exists
    const existing = await PromoLink.findOne({ code });
    if (!existing) {
      return code;
    }

    attempts++;
  }

  // If we've exhausted retries, throw an error
  throw new Error(`Failed to generate unique promo code after ${maxRetries} attempts`);
}
