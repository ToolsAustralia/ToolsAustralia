/**
 * chatSettings.ts
 * Runtime DB-backed accessor for the active chat provider.
 * Fail-safe: any error returns "anthropic" so the bot never breaks.
 */

export type ChatProvider = "anthropic" | "google";

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
