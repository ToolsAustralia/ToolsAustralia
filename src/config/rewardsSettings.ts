/**
 * Rewards configuration helpers.
 *
 * All copy related to the rewards pause lives here so new engineers know where to
 * adjust messaging in one place. We keep both server and client env support.
 */

const DEFAULT_DISABLED_MESSAGE = "Rewards are currently unavailable while we make improvements.";

/**
 * Resolve the pause messaging from environment variables, preferring the server
 * value so API responses and server-rendered pages stay consistent.
 */
export const rewardsDisabledMessage = (): string => {
  const serverMessage = process.env.REWARDS_DISABLED_MESSAGE;
  if (typeof serverMessage === "string" && serverMessage.trim().length > 0) {
    return serverMessage;
  }

  const clientMessage = process.env.NEXT_PUBLIC_REWARDS_DISABLED_MESSAGE;
  if (typeof clientMessage === "string" && clientMessage.trim().length > 0) {
    return clientMessage;
  }

  return DEFAULT_DISABLED_MESSAGE;
};
