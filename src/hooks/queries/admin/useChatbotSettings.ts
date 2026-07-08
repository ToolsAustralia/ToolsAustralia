import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * Active LLM provider for the support chatbot (Cobber).
 * Mirrors the union in src/models/ChatSettings.ts / chatSettings.ts — keep in sync.
 */
export type ChatProvider = "anthropic" | "google";

/** Settings snapshot from GET/PATCH /api/admin/chatbot-settings. */
export interface ChatbotSettings {
  activeProvider: ChatProvider;
  /** Admin (DB) Pause toggle. */
  killSwitch: boolean;
  /** CHAT_KILL_SWITCH env break-glass is on — the toggle is forced off/locked. */
  killSwitchEnvForced: boolean;
}

const SETTINGS_KEY = ["admin", "chatbot-settings"] as const;

async function fetchChatbotSettings(): Promise<ChatbotSettings> {
  const res = await fetch("/api/admin/chatbot-settings");
  if (!res.ok) {
    throw new Error(`Failed to load chatbot settings (${res.status})`);
  }
  const json = (await res.json()) as { data: ChatbotSettings };
  return json.data;
}

/**
 * Reads Cobber's settings (active provider + pause state). Drives the Cobber
 * availability toggle and the pause badge on the admin Cost tab.
 */
export function useChatbotSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchChatbotSettings,
    staleTime: 30_000,
  });
}

/**
 * Mutation to switch Cobber's live LLM provider (Claude ↔ Gemini).
 *
 * Invalidates both the settings query and the cost-analytics query so the
 * config strip (model name, active provider) refetches with no manual reload.
 * The toggle is DB-backed (ChatSettings singleton), so the switch takes effect
 * on the next chat request server-side.
 *
 * Reuse `mutation.variables` (the provider being switched to) for an optimistic
 * UI while `isPending` — avoids a flicker back to the old value during refetch.
 */
export function useSetChatProvider() {
  const queryClient = useQueryClient();

  return useMutation<ChatProvider, Error, ChatProvider>({
    mutationFn: async (activeProvider: ChatProvider) => {
      const res = await fetch("/api/admin/chatbot-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProvider }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update chat provider (${res.status})`);
      }
      const json = (await res.json()) as { data: ChatbotSettings };
      return json.data.activeProvider;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "chatbot-cost"] });
    },
  });
}

/**
 * Mutation to pause / resume Cobber via the admin DB kill switch. When paused,
 * the chat bubble is hidden site-wide (GET /api/chat/config) and the generative
 * path is blocked server-side (costGuard). Takes effect on the next page load /
 * chat request; no deploy required. The env break-glass overrides this.
 */
export function useSetChatKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, boolean>({
    mutationFn: async (killSwitch: boolean) => {
      const res = await fetch("/api/admin/chatbot-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ killSwitch }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update chatbot pause state (${res.status})`);
      }
      const json = (await res.json()) as { data: ChatbotSettings };
      return json.data.killSwitch;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "chatbot-cost"] });
    },
  });
}
