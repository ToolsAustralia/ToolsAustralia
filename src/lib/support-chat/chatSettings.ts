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
  findOne?: () => Promise<{ activeProvider?: ChatProvider; killSwitch?: boolean } | null>;
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

// ─── Kill switch (Cobber pause) ──────────────────────────────────────────────
//
// Two independent off signals, OR'd together for the effective state:
//   • CHAT_KILL_SWITCH env var — break-glass override, set in the host env.
//   • ChatSettings.killSwitch  — admin "Pause" toggle, DB-backed, no deploy.
// The env override wins: an admin cannot un-pause Cobber while the env var is on.
// When either is on, the bubble is hidden (GET /api/chat/config) AND the
// generative path is blocked (costGuard). Free FAQ deflection still answers on a
// direct API call, but the hidden bubble means users can't reach it via the UI.

/** True when the CHAT_KILL_SWITCH env break-glass override is set. */
export function isChatKillSwitchEnvOn(): boolean {
  return (process.env.CHAT_KILL_SWITCH ?? "").toLowerCase() === "true";
}

/**
 * Reads the admin (DB) killSwitch from the singleton ChatSettings doc.
 * Fail-safe: on any error returns false (do NOT hide/kill Cobber on a DB blip —
 * the env override remains the reliable break-glass, and costGuard still caps
 * spend via the daily budget).
 */
export async function getDbChatKillSwitch(deps?: ChatSettingsDeps): Promise<boolean> {
  try {
    if (deps?.findOne) {
      const doc = await deps.findOne();
      return doc?.killSwitch ?? false;
    }
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatSettings } = await import("@/models/ChatSettings");
    await connectDB();
    const doc = await ChatSettings.findOne({ key: "chat" }).lean();
    return (doc as { killSwitch?: boolean } | null)?.killSwitch ?? false;
  } catch {
    return false;
  }
}

/** Effective kill state = env break-glass OR admin (DB) toggle. */
export async function getChatKillSwitchEffective(deps?: ChatSettingsDeps): Promise<boolean> {
  return isChatKillSwitchEnvOn() || (await getDbChatKillSwitch(deps));
}

/** Upserts the admin (DB) killSwitch on the singleton ChatSettings doc. */
export async function setChatKillSwitch(on: boolean): Promise<void> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: ChatSettings } = await import("@/models/ChatSettings");
  await connectDB();
  await ChatSettings.findOneAndUpdate(
    { key: "chat" },
    { $set: { killSwitch: on } },
    { upsert: true, new: true }
  );
}
