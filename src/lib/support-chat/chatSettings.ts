/**
 * chatSettings.ts
 * Runtime DB-backed accessor for the active chat provider.
 * Fail-safe: any error returns "anthropic" so the bot never breaks.
 */

export type ChatProvider = "anthropic" | "google";

/**
 * Provider used for ANONYMOUS (guest) turns. Guests run on the cheaper model
 * (Gemini Flash-Lite — ~10× cheaper than Claude Haiku) so open guest traffic can't
 * burn much of the daily budget; signed-in members use the admin-toggled provider.
 * Whether guests reach the LLM at all is gated separately by CHAT_ALLOW_GUEST_GENERATIVE
 * (see ChatService). Requires GOOGLE_GENERATIVE_AI_API_KEY to be set, or guest turns
 * fall back to the canned reply.
 */
export const GUEST_CHAT_PROVIDER: ChatProvider = "google";

/**
 * Resolve the chat provider for an actor:
 *   - anonymous (guest) → GUEST_CHAT_PROVIDER (Gemini), always the cheap model.
 *   - member            → the admin-toggled active provider (default "anthropic").
 * `resolveActive` is only awaited for members, so guest turns never touch the DB.
 */
export async function resolveActorProvider(
  actorKind: "member" | "anonymous",
  resolveActive: () => Promise<ChatProvider>
): Promise<ChatProvider> {
  return actorKind === "anonymous" ? GUEST_CHAT_PROVIDER : resolveActive();
}

export interface ChatSettingsDeps {
  findOne?: () => Promise<{ activeProvider: ChatProvider } | null>;
  upsert?: (provider: ChatProvider) => Promise<void>;
}

/**
 * Reads the singleton ChatSettings doc.
 * Fail-safe: on any error returns "anthropic".
 */
export async function getActiveChatProvider(deps?: ChatSettingsDeps): Promise<ChatProvider> {
  try {
    if (deps?.findOne) {
      const doc = await deps.findOne();
      return doc?.activeProvider ?? "anthropic";
    }
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatSettings } = await import("@/models/ChatSettings");
    await connectDB();
    const doc = await ChatSettings.findOne({ key: "chat" }).lean();
    return (doc as { activeProvider?: ChatProvider } | null)?.activeProvider ?? "anthropic";
  } catch {
    return "anthropic";
  }
}

/**
 * Upserts the singleton ChatSettings doc with the given provider.
 */
export async function setActiveChatProvider(provider: ChatProvider, deps?: ChatSettingsDeps): Promise<void> {
  if (deps?.upsert) {
    await deps.upsert(provider);
    return;
  }
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: ChatSettings } = await import("@/models/ChatSettings");
  await connectDB();
  await ChatSettings.findOneAndUpdate(
    { key: "chat" },
    { $set: { activeProvider: provider } },
    { upsert: true, new: true }
  );
}
