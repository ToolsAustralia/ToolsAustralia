import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Active LLM provider for the support chatbot (Cobber).
 * Mirrors the union in src/models/ChatSettings.ts / chatSettings.ts — keep in sync.
 */
export type ChatProvider = "anthropic" | "google";

/**
 * Mutation to switch Cobber's live LLM provider (Claude ↔ Gemini).
 *
 * On success it invalidates the chatbot-cost analytics query so the cost page's
 * config strip (model name, active provider) refetches and reflects the change
 * with no manual reload. The toggle is DB-backed (ChatSettings singleton), so
 * the switch takes effect on the next chat request server-side.
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
      const json = (await res.json()) as { data: { activeProvider: ChatProvider } };
      return json.data.activeProvider;
    },
    onSuccess: () => {
      // Refetch the cost analytics so config.activeProvider / config.model update.
      void queryClient.invalidateQueries({ queryKey: ["admin", "chatbot-cost"] });
    },
  });
}
